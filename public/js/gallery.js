// ===== Gallery — 3D Carousel + Year Timeline =====
let photos = [];
let allPhotos = [];
let allYears = [];
let currentIndex = 0;
let currentAngle = 0;
let autoTimer = null;
let isHovering = false;
let isDragging = false;
let lightboxPhotos = [];

function optimizedUrl(url, w) {
  return url.replace("/upload/", "/upload/w_" + w + ",q_auto,f_auto/");
}

const MAX_CAROUSEL = 10;
const AUTO_INTERVAL = 4000;

// ===================== 3D Carousel =====================

async function loadGallery() {
  try {
    const r = await fetch('/api/photos?featured=true');
    photos = (await r.json()).slice(0, MAX_CAROUSEL);
  } catch { photos = []; }
  renderCarousel();
  if (photos.length > 1) startAutoRotate();
  loadYears();
}

function getCardSize() {
  if (window.innerWidth <= 480) return 140;
  if (window.innerWidth <= 768) return 180;
  return 240;
}

function renderCarousel() {
  const stage = document.getElementById('carouselStage');
  const car3d = document.getElementById('carousel3d');
  const empty = document.getElementById('emptyState');
  if (!stage) return;

  stage.querySelectorAll('.carousel-3d-card').forEach(el => el.remove());

  if (photos.length === 0) {
    empty.style.display = 'flex';
    car3d.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  car3d.style.display = 'block';
  currentAngle = 0;

  const count = photos.length;
  const angleStep = 360 / count;
  const size = getCardSize();
  const radius = count <= 2 ? Math.max(280, size * 2) : Math.max(280, (size / 2) / Math.tan(Math.PI / count) + 80);

  photos.forEach((photo, i) => {
    const card = document.createElement('div');
    card.className = 'carousel-3d-card';
    card.style.transform = count === 1 ? `translateZ(0px)` : `rotateY(${i * angleStep}deg) translateZ(${radius}px)`;
    card.innerHTML = `<img src="${optimizedUrl(photo.secure_url, 500)}" alt="photo" loading="lazy">`;
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      currentIndex = i;
      lightboxPhotos = photos;
      openLightbox();
    });
    stage.appendChild(card);
  });

  stage.style.transform = `rotateY(0deg)`;
  stage.dataset.angle = angleStep;
  stage.dataset.count = count;
}

// Auto-rotation
function startAutoRotate() {
  stopAutoRotate();
  autoTimer = setInterval(() => {
    if (isHovering || isDragging) return;
    const st = document.getElementById('carouselStage');
    if (!st) return;
    const a = parseFloat(st.dataset.angle) || 36;
    currentAngle += a;
    st.style.transform = `rotateY(${-currentAngle}deg)`;
  }, AUTO_INTERVAL);
}

function stopAutoRotate() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}

// Hover & nav listeners
document.addEventListener('DOMContentLoaded', () => {
  const c = document.getElementById('carousel3d');
  if (!c) return;
  c.addEventListener('mouseenter', () => { isHovering = true; });
  c.addEventListener('mouseleave', () => { isHovering = false; });
  c.addEventListener('touchstart', () => { isHovering = true; }, { passive: true });
  c.addEventListener('touchend', () => { isHovering = false; });

  document.getElementById('carouselPrev')?.addEventListener('click', (e) => { e.stopPropagation(); rotateCarousel(-1); });
  document.getElementById('carouselNext')?.addEventListener('click', (e) => { e.stopPropagation(); rotateCarousel(1); });

  // Drag rotation
  let isDown = false, startX = 0, startAngle = 0;
  c.addEventListener('mousedown', (e) => {
    if (e.target.closest('.carousel-3d-btn')) return;
    isDown = true;
    isDragging = true;
    startX = e.pageX;
    startAngle = currentAngle;
    const st = document.getElementById('carouselStage');
    if (st) st.style.transition = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const st = document.getElementById('carouselStage');
    if (!st) return;
    const dx = e.pageX - startX;
    currentAngle = startAngle + (dx / (c.offsetWidth || 800)) * 360;
    st.style.transform = `rotateY(${-currentAngle}deg)`;
  });
  window.addEventListener('mouseup', () => {
    if (!isDown) return;
    isDown = false;
    isDragging = false;
    const st = document.getElementById('carouselStage');
    if (!st) return;
    st.style.transition = 'transform 0.5s ease';
    const a = parseFloat(st.dataset.angle) || 36;
    currentAngle = Math.round(currentAngle / a) * a;
    st.style.transform = `rotateY(${-currentAngle}deg)`;
    stopAutoRotate();
    if (photos.length > 1) startAutoRotate();
  });
});

function rotateCarousel(dir) {
  const st = document.getElementById('carouselStage');
  if (!st) return;
  const a = parseFloat(st.dataset.angle) || 36;
  currentAngle += a * dir;
  st.style.transform = `rotateY(${-currentAngle}deg)`;
  stopAutoRotate();
  if (photos.length > 1) startAutoRotate();
}

// ===================== Year Timeline =====================

async function loadYears() {
  try {
    const r = await fetch('/api/years');
    allYears = await r.json();
  } catch { allYears = []; }
  try {
    const r = await fetch('/api/photos');
    allPhotos = await r.json();
  } catch { allPhotos = []; }
  // Remove skeleton placeholders
  document.querySelectorAll('.skeleton').forEach(el => el.remove());

  const section = document.getElementById('yearSection');
  if (!section) return;
  if (allYears.length === 0 && allPhotos.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const tl = document.getElementById('yearTimeline');
  if (!tl) return;
  tl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'year-marker';
  allBtn.textContent = '全部';
  allBtn.addEventListener('click', () => filterYear(null, allBtn));
  tl.appendChild(allBtn);

  allYears.forEach(y => {
    const b = document.createElement('button');
    b.className = 'year-marker';
    b.textContent = y;
    b.addEventListener('click', () => filterYear(y, b));
    tl.appendChild(b);
  });

  // Add year button
  const addBtn = document.createElement('button');
  addBtn.className = 'year-marker year-add-btn';
  addBtn.textContent = '+ 添加年份';
  addBtn.addEventListener('click', async () => {
    const y = prompt('输入4位年份（例如 2024）');
    if (!y || !/^\d{4}$/.test(y)) { showToast('请输入有效的4位年份'); return; }
    try {
      await fetch('/api/years', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year: y }) });
      showToast(`已添加 ${y} 年`);
      loadYears();
    } catch { showToast('添加年份失败'); }
  });
  tl.appendChild(addBtn);

  filterYear(null, allBtn);
}

async function filterYear(year, btn) {
  document.querySelectorAll('.year-marker').forEach(m => m.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (year === null) {
    yearPhotos = allPhotos;
  } else {
    try {
      const r = await fetch('/api/photos?year=' + year);
      yearPhotos = await r.json();
    } catch { yearPhotos = []; }
  }

  const grid = document.getElementById('yearPhotoGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (yearPhotos.length === 0) {
    grid.innerHTML = '<div class="empty-state"><h3>暂无照片</h3></div>';
    return;
  }

  yearPhotos.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'year-photo-item';
    div.innerHTML = `<img src="${optimizedUrl(p.secure_url, 300)}" alt="photo" loading="lazy">`;
    div.addEventListener('click', () => {
      currentIndex = i;
      lightboxPhotos = yearPhotos;
      openLightbox();
    });
    grid.appendChild(div);
  });
}

// ===================== Lightbox =====================
function openLightbox() {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const p = lightboxPhotos[currentIndex];
  if (!p) return;
  img.src = optimizedUrl(p.secure_url, 1200);
  info.textContent = `${currentIndex + 1} / ${lightboxPhotos.length}`;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', keyHandler);
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', keyHandler);
}

function navigateLightbox(dir) {
  currentIndex = (currentIndex + dir + lightboxPhotos.length) % lightboxPhotos.length;
  const p = lightboxPhotos[currentIndex];
  if (!p) return;
  document.getElementById('lightboxImg').src = p.secure_url;
  document.getElementById('lightboxInfo').textContent = `${currentIndex + 1} / ${lightboxPhotos.length}`;
}

function keyHandler(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}

loadGallery();
