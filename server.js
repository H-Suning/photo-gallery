require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const https = require('https');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const TAG_FEATURED = 'gallery-featured';
const FOLDER = 'photo-gallery';

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer storage — uploads to Cloudinary with default featured tag
const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: FOLDER,
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'avif'],
    tags: [TAG_FEATURED],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  }),
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));

// --- Helper: Cloudinary resource → photo object ---
function toPhoto(r) {
  return {
    id: r.public_id,
    url: r.secure_url,
    secure_url: r.secure_url,
    public_id: r.public_id,
    format: r.format,
    bytes: r.bytes,
    width: r.width,
    height: r.height,
    created_at: r.created_at,
    featured: r.tags ? r.tags.includes(TAG_FEATURED) : false,
  };
}

// --- Helper: download image buffer ---
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ===================== Photo API =====================

// List photos (all or featured only)
app.get('/api/photos', async (req, res) => {
  try {
    let result;
    if (req.query.featured === 'true') {
      result = await cloudinary.api.resources_by_tag(TAG_FEATURED, {
        resource_type: 'image',
        max_results: 500,
        order: 'desc',
      });
    } else {
      result = await cloudinary.api.resources({
        type: 'upload',
        prefix: FOLDER + '/',
        max_results: 500,
        order: 'desc',
      });
    }
    const photos = (result.resources || []).map(toPhoto);
    if (req.query.sort === 'oldest') photos.reverse();
    res.json(photos);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Upload single
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  // Tag as featured (multer-storage-cloudinary may not handle tags in older versions)
  try {
    await cloudinary.uploader.add_tag(TAG_FEATURED, [req.file.public_id]);
  } catch {}
  const photo = toPhoto({
    public_id: req.file.public_id,
    secure_url: req.file.secure_url || req.file.path,
    format: req.file.format,
    bytes: req.file.bytes,
    width: req.file.width,
    height: req.file.height,
    created_at: new Date().toISOString(),
    tags: [TAG_FEATURED],
  });
  res.json(photo);
});

// Upload multiple
app.post('/api/upload-multiple', upload.array('images', 50), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });
  const ids = req.files.map(f => f.public_id);
  try { await cloudinary.api.add_tag(TAG_FEATURED, ids); } catch {}
  const photos = req.files.map(f => toPhoto({
    public_id: f.public_id,
    secure_url: f.secure_url || f.path,
    format: f.format,
    bytes: f.bytes,
    width: f.width,
    height: f.height,
    created_at: new Date().toISOString(),
    tags: [TAG_FEATURED],
  }));
  res.json(photos);
});

// Toggle featured
app.put('/api/photos/:id/feature', async (req, res) => {
  try {
    const pubId = req.params.id;
    const r = await cloudinary.api.resource(pubId);
    const isFeatured = r.tags && r.tags.includes(TAG_FEATURED);
    if (isFeatured) {
      await cloudinary.api.remove_tag(TAG_FEATURED, [pubId]);
    } else {
      await cloudinary.api.add_tag(TAG_FEATURED, [pubId]);
    }
    res.json({ featured: !isFeatured });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete
app.delete('/api/photos/:id', async (req, res) => {
  try {
    await cloudinary.uploader.destroy(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================== Batch Download =====================
app.post('/api/download', async (req, res) => {
  const { ids } = req.body;
  try {
    let resources;
    if (ids && ids.length) {
      resources = await Promise.allSettled(
        ids.map(id => cloudinary.api.resource(id))
      );
      resources = resources.filter(r => r.status === 'fulfilled').map(r => r.value);
    } else {
      const result = await cloudinary.api.resources({
        type: 'upload', prefix: FOLDER + '/', max_results: 500,
      });
      resources = result.resources || [];
    }
    if (!resources.length) return res.status(400).json({ error: 'No photos' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=photos.zip');
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    for (const r of resources) {
      try {
        const buf = await downloadImage(r.secure_url);
        archive.append(buf, { name: `${r.public_id.replace(/\//g, '-')}.${r.format || 'jpg'}` });
      } catch (e) { console.warn('Skip', r.public_id, e.message); }
    }
    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ===================== Share (stateless — IDs encoded in URL) =====================
app.post('/api/shares', (req, res) => {
  const { photoIds } = req.body;
  if (!photoIds || !photoIds.length) return res.status(400).json({ error: 'No photos' });
  const token = Buffer.from(JSON.stringify(photoIds)).toString('base64url').slice(0, 120);
  res.json({ token, url: `/share/${token}` });
});

app.get('/api/shares/:token', async (req, res) => {
  try {
    const ids = JSON.parse(Buffer.from(req.params.token, 'base64url').toString());
    const results = await Promise.allSettled(ids.map(id => cloudinary.api.resource(id)));
    const photos = results.filter(r => r.status === 'fulfilled').map(r => toPhoto(r.value));
    res.json({ token: req.params.token, photos });
  } catch {
    res.status(404).json({ error: 'Invalid share link' });
  }
});

// Share page
app.get('/share/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// ===================== Start =====================
app.listen(PORT, () => {
  console.log(`Photo Gallery running at http://localhost:${PORT}`);
});
