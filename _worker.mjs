// Cloudinary API helper
function cloudinaryAuth(key, secret) {
  return 'Basic ' + btoa(key + ':' + secret);
}

async function cloudinaryFetch(env, path, options = {}) {
  const url = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': cloudinaryAuth(env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary API ${res.status}: ${text}`);
  }
  return res.json();
}

const TAG = 'gallery-featured';
const FOLDER = 'photo-gallery';

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
    featured: r.tags ? r.tags.includes(TAG) : false,
  };
}

// --- Handlers ---

async function handleListPhotos(request, env) {
  const url = new URL(request.url);
  const featured = url.searchParams.get('featured') === 'true';
  const sort = url.searchParams.get('sort');

  let result;
  if (featured) {
    result = await cloudinaryFetch(env, `/resources/image/tags/${TAG}?max_results=500&order=desc`);
  } else {
    result = await cloudinaryFetch(env, `/resources/image/upload?prefix=${FOLDER}/&max_results=500&order=desc`);
  }

  let photos = (result.resources || []).map(toPhoto);
  if (sort === 'oldest') photos.reverse();
  return new Response(JSON.stringify(photos), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleUpload(request, env) {
  const body = await request.json();
  const { public_id, secure_url, format, bytes, width, height } = body;
  if (!public_id || !secure_url) {
    return new Response(JSON.stringify({ error: 'Missing public_id or secure_url' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Tag as featured
  try {
    await cloudinaryFetch(env, `/resources/image/tags/${TAG}`, {
      method: 'POST',
      body: JSON.stringify({ public_ids: [public_id] }),
    });
  } catch (e) {
    console.warn('Tag failed:', e.message);
  }

  return new Response(JSON.stringify(toPhoto({
    public_id,
    secure_url,
    format: format || 'jpg',
    bytes: bytes || 0,
    width: width || 0,
    height: height || 0,
    created_at: new Date().toISOString(),
    tags: [TAG],
  })), { headers: { 'Content-Type': 'application/json' } });
}

async function handleUploadMultiple(request, env) {
  const body = await request.json();
  const files = body.files || body;
  if (!Array.isArray(files) || !files.length) {
    return new Response(JSON.stringify({ error: 'No files' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const ids = files.map(f => f.public_id);
  try {
    await cloudinaryFetch(env, `/resources/image/tags/${TAG}`, {
      method: 'POST',
      body: JSON.stringify({ public_ids: ids }),
    });
  } catch (e) {
    console.warn('Tag failed:', e.message);
  }

  const photos = files.map(f => toPhoto({
    public_id: f.public_id,
    secure_url: f.secure_url,
    format: f.format || 'jpg',
    bytes: f.bytes || 0,
    width: f.width || 0,
    height: f.height || 0,
    created_at: new Date().toISOString(),
    tags: [TAG],
  }));
  return new Response(JSON.stringify(photos), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleToggleFeature(request, env, publicId) {
  const r = await cloudinaryFetch(env, `/resources/image/upload/${publicId}`);
  const isFeatured = r.tags && r.tags.includes(TAG);

  if (isFeatured) {
    await cloudinaryFetch(env, `/resources/image/tags/${TAG}`, {
      method: 'DELETE',
      body: JSON.stringify({ public_ids: [publicId] }),
    });
  } else {
    await cloudinaryFetch(env, `/resources/image/tags/${TAG}`, {
      method: 'POST',
      body: JSON.stringify({ public_ids: [publicId] }),
    });
  }

  return new Response(JSON.stringify({ featured: !isFeatured }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleDeletePhoto(request, env, publicId) {
  await cloudinaryFetch(env, `/resources/image/upload/${publicId}`, {
    method: 'DELETE',
  });
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleDownload(request, env) {
  return new Response(JSON.stringify({ error: 'Batch download is not available on this platform' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleCreateShare(request, env) {
  const body = await request.json();
  const { photoIds } = body;
  if (!photoIds || !photoIds.length) {
    return new Response(JSON.stringify({ error: 'No photos' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const token = btoa(JSON.stringify(photoIds)).replace(/=+$/, '').slice(0, 120);
  return new Response(JSON.stringify({ token, url: `/share/${token}` }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleGetShare(request, env, token) {
  try {
    const ids = JSON.parse(atob(token));
    const results = await Promise.allSettled(
      ids.map(id => cloudinaryFetch(env, `/resources/image/upload/${encodeURIComponent(id)}`))
    );
    const photos = results.filter(r => r.status === 'fulfilled').map(r => toPhoto(r.value));
    return new Response(JSON.stringify({ token, photos }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid share link' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleShareRedirect(request, env) {
  const url = new URL(request.url);
  const token = url.pathname.split('/').pop();
  return Response.redirect(`/share.html?token=${encodeURIComponent(token)}`, 302);
}

// --- Router ---

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Static assets are handled at the edge by wrangler, so we only get non-asset requests here.

      // API routes
      if (path === '/api/photos' && method === 'GET') {
        return handleListPhotos(request, env);
      }

      if (path === '/api/upload' && method === 'POST') {
        return handleUpload(request, env);
      }

      if (path === '/api/upload-multiple' && method === 'POST') {
        return handleUploadMultiple(request, env);
      }

      const featureMatch = path.match(/^\/api\/photos\/(.+)\/feature$/);
      if (featureMatch && method === 'PUT') {
        return handleToggleFeature(request, env, featureMatch[1]);
      }

      const deleteMatch = path.match(/^\/api\/photos\/(.+)$/);
      if (deleteMatch && method === 'DELETE') {
        return handleDeletePhoto(request, env, deleteMatch[1]);
      }

      if (path === '/api/download' && method === 'POST') {
        return handleDownload(request, env);
      }

      if (path === '/api/shares' && method === 'POST') {
        return handleCreateShare(request, env);
      }

      const shareApiMatch = path.match(/^\/api\/shares\/(.+)$/);
      if (shareApiMatch && method === 'GET') {
        return handleGetShare(request, env, shareApiMatch[1]);
      }

      // Share page redirect
      const sharePageMatch = path.match(/^\/share\/(.+)$/);
      if (sharePageMatch) {
        return handleShareRedirect(request, env);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
