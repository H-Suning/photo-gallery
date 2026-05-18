// ===== Share Page =====
let photos = [];
let currentIndex = 0;

async function init() {
  const token = window.location.pathname.split('/').pop();
  if (!token) {
    document.getElementById('shareInfo').textContent = '无效的分享链接';
    return;
  }
  try {
    const res = await fetch(`/api/shares/${token}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    photos = data.photos || [];
    document.getElementById('shareInfo').textContent = `共 ${photos.length} 张照片`;
    renderGrid();
  } catch {
    document.getElementById('shareInfo').textContent = '分享链接无效或已过期';
    document.querySelector('.share-header h1').textContent = '无法加载';
  }
}

function renderGrid() {
  const grid = document.getElementById('shareGrid');
  if (photos.length === 0) {
    grid.innerHTML = '<div class="share-error"><h2>暂无照片</h2></div>';
    return;
  }
  photos.forEach((photo, i) => {
    const div = document.createElement('div');
    div.className = 'photo-item';
    div.innerHTML = `<img src="${photo.secure_url}" alt="" loading="lazy">`;
    div.addEventListener('click', () => openLightbox(i));
    grid.appendChild(div);
  });
}

function openLightbox(index) {
  currentIndex = index;
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = photos[index];
  if (!photo) return;
  img.src = photo.secure_url;
  info.textContent = `${index + 1} / ${photos.length}`;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', lightboxKeyHandler);
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', lightboxKeyHandler);
}

function navigateLightbox(dir) {
  currentIndex += dir;
  if (currentIndex < 0) currentIndex = photos.length - 1;
  if (currentIndex >= photos.length) currentIndex = 0;
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = photos[currentIndex];
  if (!photo) return;
  img.src = photo.secure_url;
  info.textContent = `${currentIndex + 1} / ${photos.length}`;
}

function lightboxKeyHandler(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
}

init();
