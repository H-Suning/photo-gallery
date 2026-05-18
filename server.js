require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const https = require('https');
const archiver = require('archiver');

const app = express();
const PORT = 3000;
const TAG_FEATURED = 'gallery-featured';
const FOLDER = 'photo-gallery';
const runningOnCFWorker = typeof process !== 'undefined' && process.env && process.env.CF_WORKER;

// Lazy Cloudinary init — avoids Railway build-time secret resolution
function ensureCloudinary() {
  const ccName = process.env.CLOUDINARY_CLOUD_NAME;
  const ccKey = process.env.CLOUDINARY_API_KEY;
  const ccSecret = process.env.CLOUDINARY_API_SECRET;
  if (ccName && ccKey && ccSecret) {
    cloudinary.config({
      cloud_name: ccName,
      api_key: ccKey,
      api_secret: ccSecret,
    });
  } else {
    console.warn('Cloudinary env vars not set yet at', new Date().toISOString());
  }
}

app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => { ensureCloudinary(); next(); });
console.log('ENV:', { n: !!process.env.CLOUDINARY_CLOUD_NAME, k: !!process.env.CLOUDINARY_API_KEY, s: !!process.env.CLOUDINARY_API_SECRET });

// In production (Cloudflare Workers), static files are served at the edge by wrangler assets.
// On local Node.js, serve from the public/ directory.
if (!runningOnCFWorker) {
  app.use(express.static('public', { extensions: ['html'] }));
} else {
  // On Workers, express.static might not be available; register explicit routes
  app.get('/upload', (req, res) => res.redirect('/upload.html'));
  app.get('/manage', (req, res) => res.redirect('/manage.html'));
}

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
    console.error('List error:', err?.message || err, err?.stack);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// Upload single (accepts data from direct browser-to-Cloudinary upload)
app.post('/api/upload', async (req, res) => {
  const { public_id, secure_url, format, bytes, width, height } = req.body;
  if (!public_id || !secure_url) return res.status(400).json({ error: 'Missing public_id or secure_url' });
  try {
    await cloudinary.uploader.add_tag(TAG_FEATURED, [public_id]);
  } catch (e) {
    console.warn('Tag failed:', e.message);
  }
  res.json(toPhoto({
    public_id,
    secure_url,
    format: format || 'jpg',
    bytes: bytes || 0,
    width: width || 0,
    height: height || 0,
    created_at: new Date().toISOString(),
    tags: [TAG_FEATURED],
  }));
});

// Upload multiple (accepts array of Cloudinary resource data)
app.post('/api/upload-multiple', async (req, res) => {
  const files = req.body.files || req.body;
  if (!Array.isArray(files) || !files.length) return res.status(400).json({ error: 'No files' });
  const ids = files.map(f => f.public_id);
  try { await cloudinary.api.add_tag(TAG_FEATURED, ids); } catch (e) { console.warn('Tag failed:', e.message); }
  const photos = files.map(f => toPhoto({
    public_id: f.public_id,
    secure_url: f.secure_url,
    format: f.format || 'jpg',
    bytes: f.bytes || 0,
    width: f.width || 0,
    height: f.height || 0,
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
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// Delete
app.delete('/api/photos/:id', async (req, res) => {
  try {
    await cloudinary.uploader.destroy(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Unknown error' });
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
    if (!res.headersSent) res.status(500).json({ error: err?.message || 'Unknown error' });
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

// Share page — redirect with token as query param so it works on both Node.js (sendFile) and CF Workers (static assets)
app.get('/share/:token', (req, res) => {
  if (runningOnCFWorker) {
    // On Cloudflare Workers, redirect to share.html with token in query string
    // share.js will read it from the URL
    res.redirect('/share.html?token=' + encodeURIComponent(req.params.token));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
  }
});

// ===================== Start =====================
if (!runningOnCFWorker) {
  app.listen(PORT, () => {
    console.log(`Photo Gallery running at http://localhost:${PORT}`);
  });
}

module.exports = app;
