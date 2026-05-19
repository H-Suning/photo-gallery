require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const https = require('https');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const TAG_FEATURED = 'gallery-featured';
const TAG_COVER = 'gallery-cover';
const TAG_YEAR_PREFIX = 'year-';
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

if (!runningOnCFWorker) {
  app.use(express.static('public', { extensions: ['html'] }));
} else {
  app.get('/upload', (req, res) => res.redirect('/upload.html'));
  app.get('/manage', (req, res) => res.redirect('/manage.html'));
}

// --- Helpers ---
function toPhoto(r) {
  const tags = r.tags || [];
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
    featured: tags.includes(TAG_FEATURED),
    covered: tags.includes(TAG_COVER),
    year: tags.find(t => t.startsWith(TAG_YEAR_PREFIX))?.replace(TAG_YEAR_PREFIX, '') || null,
    sortOrder: r.context && r.context.custom ? parseInt(r.context.custom.carousel_order) : null,
  };
}

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

// ===================== Cloudinary API =====================

// List all photos (returns everything tagged)
app.get('/api/photos', async (req, res) => {
  try {
    const options = {
      resource_type: 'image',
      max_results: 500,
      order: 'desc',
      context: true,
    };

    // Filter by year tag
    let result;
    if (req.query.year) {
      const yearTag = TAG_YEAR_PREFIX + req.query.year;
      result = await cloudinary.api.resources_by_tag(yearTag, options);
    } else {
      // List ALL photos by fetching multiple tag groups
      result = await cloudinary.api.resources_by_tag(TAG_FEATURED, options);
    }

    const photos = (result.resources || []).map(toPhoto);
    photos.sort((a, b) => {
      if (a.sortOrder !== null && b.sortOrder !== null) return a.sortOrder - b.sortOrder;
      if (a.sortOrder !== null) return -1;
      if (b.sortOrder !== null) return 1;
      return 0;
    });
    if (req.query.sort === 'oldest') photos.reverse();
    res.json(photos);
  } catch (err) {
    console.error('List error:', JSON.stringify(err), err?.stack);
    res.status(500).json({ error: err?.message || JSON.stringify(err) });
  }
});

// Get all year tags
app.get('/api/years', async (req, res) => {
  try {
    const result = await cloudinary.api.tags({ max_results: 500 });
    const yearTags = (result.tags || [])
      .filter(t => t.startsWith(TAG_YEAR_PREFIX))
      .map(t => t.replace(TAG_YEAR_PREFIX, ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    res.json(yearTags);
  } catch (err) {
    console.error('Years error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Upload single
app.post('/api/upload', async (req, res) => {
  const { public_id, secure_url, format, bytes, width, height, year } = req.body;
  if (!public_id || !secure_url) return res.status(400).json({ error: 'Missing public_id or secure_url' });
  try {
    const tags = [TAG_FEATURED];
    if (year) tags.push(TAG_YEAR_PREFIX + year);
    await cloudinary.uploader.add_tag(tags.join(','), [public_id]);
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
    tags: [TAG_FEATURED, year ? TAG_YEAR_PREFIX + year : null].filter(Boolean),
  }));
});

// Upload multiple
app.post('/api/upload-multiple', async (req, res) => {
  const files = req.body.files || req.body;
  if (!Array.isArray(files) || !files.length) return res.status(400).json({ error: 'No files' });
  const ids = files.map(f => f.public_id);
  const commonYear = req.body.year || null;
  try {
    const tags = [TAG_FEATURED];
    if (commonYear) tags.push(TAG_YEAR_PREFIX + commonYear);
    await cloudinary.api.add_tag(tags, ids);
  } catch (e) { console.warn('Tag failed:', e.message); }
  const photos = files.map(f => toPhoto({
    public_id: f.public_id,
    secure_url: f.secure_url,
    format: f.format || 'jpg',
    bytes: f.bytes || 0,
    width: f.width || 0,
    height: f.height || 0,
    created_at: new Date().toISOString(),
    tags: [TAG_FEATURED, commonYear ? TAG_YEAR_PREFIX + commonYear : null].filter(Boolean),
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
    console.error('Feature toggle error:', err.message);
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

// Toggle cover
app.put('/api/photos/:id/cover', async (req, res) => {
  try {
    const pubId = req.params.id;
    const r = await cloudinary.api.resource(pubId);
    const isCover = r.tags && r.tags.includes(TAG_COVER);
    if (isCover) {
      await cloudinary.api.remove_tag(TAG_COVER, [pubId]);
    } else {
      await cloudinary.api.add_tag(TAG_COVER, [pubId]);
    }
    res.json({ covered: !isCover });
  } catch (err) {
    console.error('Cover toggle error:', err.message);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// Set year on a photo
app.put('/api/photos/:id/year', async (req, res) => {
  try {
    const pubId = req.params.id;
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'Missing year' });
    const r = await cloudinary.api.resource(pubId);
    const tags = r.tags || [];
    // Remove old year tag
    const oldYearTag = tags.find(t => t.startsWith(TAG_YEAR_PREFIX));
    if (oldYearTag) {
      await cloudinary.api.remove_tag(oldYearTag, [pubId]);
    }
    // Add new year tag
    await cloudinary.api.add_tag(TAG_YEAR_PREFIX + year, [pubId]);
    res.json({ year });
  } catch (err) {
    console.error('Year set error:', err.message);
    res.status(500).json({ error: err?.message || 'Unknown error' });
  }
});

// Reorder photos for carousel
app.put('/api/photos/reorder', async (req, res) => {
  const { orderedIds } = req.body;
  if (!orderedIds || !orderedIds.length) return res.status(400).json({ error: 'No orderedIds' });
  try {
    await Promise.all(orderedIds.map((id, i) =>
      cloudinary.uploader.explicit(id, {
        type: 'upload',
        context: `carousel_order=${i}`,
      })
    ));
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

// ===================== Share =====================
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

app.get('/share/:token', (req, res) => {
  if (runningOnCFWorker) {
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
