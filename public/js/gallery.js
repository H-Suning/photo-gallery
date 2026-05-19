// ===== Gallery (Homepage) with 3D Cylinder Carousel + Year Timeline =====
let photos = [];
let allPhotos = [];
let currentIndex = 0;
let currentAngle = 0;
let autoRollTimer = null;
let isHovering = false;
let isDragging = false;
let dragStartX = 0;
let dragStartAngle = 0;
let dragMoved = false;

const MAX_PHOTOS = 10;
const AUTO_ROLL_INTERVAL = 4000;

// ===================== 3D Carousel =====================

async function loadGallery() {
  try {
    const res = await fetch('/api/photos?featured=true');
    const all = await res.json();
    photos = all.slice(0, MAX_PHOTOS);
  } catch { photos = []; }
  renderCarousel();
  if (photos.length > 1) startAutoRoll();
}

function renderCarousel() {
  const stage = document.getElementById('carouselStage');
  const wrap = document.querySelector('.carousel-3d-wrap');
  const empty = document.getElementById('emptyState');
  const carousel = document.getElementById('carousel3d');
  if (!stage) return;
  stage.querySelectorAll('.carousel-3d-card').forEach(el => el.remove());

  if (photos.length === 0) {
    empty.style.display = 'flex';
    carousel.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  carousel.style.display = 'block';
  currentAngle = 0;

  const count = photos.length;
  const angleStep = 360 / count;
  const isMobile = window.innerWidth <= 768;
  const cardSize = isMobile ? 160 : 220;
  // radius ensures no overlap: r = (cardSize/2) / tan(π/n) + small gap
  const radius = Math.max(280, (cardSize / 2) / Math.tan(Math.PI / count) + 60);

  // Set stage card size for centering
  stage.style.setProperty('--card-size', cardSize + 'px');

  photos.forEach((photo, i) => {
    const card = document.createElement('div');
    card.className = 'carousel-3d-card';
    const tilt = i * angleStep;
    card.style.transform = `rotateY(${tilt}deg) translateZ(${radius}px)`;
    card.dataset.index = i;
    const img = document.createElement('img');
    img.src = photo.secure_url;
    img.alt = 'photo';
    img.loading = 'lazy';
    card.appendChild(img);
    card.addEventListener('click', () => openLightbox(i));
    stage.appendChild(card);
  });

  stage.style.transform = `rotateY(0deg)`;
  stage.dataset.angle = angleStep;
  stage.dataset.count = count;
  stage.dataset.radius = radius;
}

function startAutoRoll() {
  stopAutoRoll();
  autoRollTimer = setInterval(() => {
    if (isHovering || isDragging) return;
    const stage = document.getElementById('carouselStage');
    if (!stage) return;
    const angle = parseFloat(stage.dataset.angle) || (360 / photos.length);
    currentAngle += angle;
    stage.style.transform = `rotateY(${-currentAngle}deg)`;
  }, AUTO_ROLL_INTERVAL);
}

function stopAutoRoll() {
  if (autoRollTimer) { clearInterval(autoRollTimer); autoRollTimer = null; }
}

// Hover / touch pause
document.addEventListener('DOMContentLoaded', () => {
  const carousel = document.getElementById('carousel3d');
  if (!carousel) return;
  carousel.addEventListener('mouseenter', () => { isHovering = true; });
  carousel.addEventListener('mouseleave', () => { isHovering = false; });
  carousel.addEventListener('touchstart', () => { isHovering = true; }, { passive: true });
  carousel.addEventListener('touchend', () => { isHovering = false; });
});

// Prev / Next
document.addEventListener('DOMContentLoaded', () => {
  const prev = document.getElementById('carouselPrev');
  const next = document.getElementById('carouselNext');
  if (prev) prev.addEventListener('click', (e) => { e.stopPropagation(); navigateCarousel(-1); });
  if (next) next.addEventListener('click', (e) => { e.stopPropagation(); navigateCarousel(1); });
});

function navigateCarousel(dir) {
  const stage = document.getElementById('carouselStage');
  if (!stage) return;
  const a = parseFloat(stage.dataset.angle) || 36;
  currentAngle += a * dir;
  stage.style.transform = `rotateY(${-currentAngle}deg)`;
  stopAutoRoll();
  if (photos.length > 1) startAutoRoll();
}

// Drag
(function() {
  let stage = null, isDown = false, startX = 0, startAngle = 0, moved = false;
  document.addEventListener('DOMContentLoaded', () => {
    stage = document.getElementById('carouselStage');
    const carousel = document.getElementById('carousel3d');
    if (!stage || !carousel) return;

    carousel.addEventListener('mousedown', (e) => {
      if (e.target.closest('.carousel-3d-nav')) return;
      isDown = true; moved = false;
      startX = e.pageX; startAngle = currentAngle;
      isDragging = true;
      stage.style.transition = 'none';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 5) moved = true;
      const w = carousel.offsetWidth || 900;
      currentAngle = startAngle + (dx / w) * 360;
      stage.style.transform = `rotateY(${-currentAngle}deg)`;
    });
    window.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false; isDragging = false; dragMoved = moved;
      stage.style.transition = 'transform 0.5s ease';
      const a = parseFloat(stage.dataset.angle) || 36;
      currentAngle = Math.round(currentAngle / a) * a;
      stage.style.transform = `rotateY(${-currentAngle}deg)`;
      stopAutoRoll();
      if (photos.length > 1) startAutoRoll();
    });
  });
})();

// ===================== Year Timeline =====================

let selectedYear = null;
let yearPhotos = [];
let yearsList = [];

async function loadYears() {
  const section = document.getElementById('yearSection');
  const timeline = document.getElementById('yearTimeline');

  // Fetch year tags from backend
  try {
    const res = await fetch('/api/years');
    yearsList = await res.json();
  } catch { yearsList = []; }

  // Also fetch all photos for year grid content
  try {
    const res = await fetch('/api/photos');
    allPhotos = await res.json();
  } catch { allPhotos = []; }

  if (yearsList.length === 0 && allPhotos.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';
  if (!timeline) return;
  timeline.innerHTML = '';

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className = 'year-marker';
  allBtn.textContent = '全部';
  allBtn.addEventListener('click', () => selectYear(null, allBtn));
  timeline.appendChild(allBtn);

  yearsList.forEach(year => {
    const btn = document.createElement('button');
    btn.className = 'year-marker';
    btn.textContent = year;
    btn.dataset.year = year;
    btn.addEventListener('click', () => selectYear(year, btn));
    timeline.appendChild(btn);
  });

  selectYear(null, allBtn);
}

async function selectYear(year, btn) {
  selectedYear = year;
  document.querySelectorAll('.year-marker').forEach(m => m.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (year === null) {
    yearPhotos = allPhotos;
    renderYearPhotos();
    return;
  }

  // Fetch photos filtered by year tag
  try {
    const res = await fetch('/api/photos?year=' + year);
    yearPhotos = await res.json();
  } catch { yearPhotos = []; }
  renderYearPhotos();
}

function renderYearPhotos() {
  const grid = document.getElementById('yearPhotoGrid');
  if (!grid) return;
  grid.innerHTML = '';
  if (yearPhotos.length === 0) {
    grid.innerHTML = '<div class="empty-state"><h3>暂无照片</h3></div>';
    return;
  }
  yearPhotos.forEach((photo, i) => {
    const div = document.createElement('div');
    div.className = 'year-photo-item';
    const img = document.createElement('img');
    img.src = photo.secure_url;
    img.alt = 'photo';
    img.loading = 'lazy';
    div.appendChild(img);
    div.addEventListener('click', () => { currentIndex = i; openYearLightbox(i); });
    grid.appendChild(div);
  });
}

// ===================== Lightbox =====================
let lightboxPhotos = [];

function openLightbox(index) {
  lightboxPhotos = photos;
  currentIndex = index;
  showLightbox();
}

function openYearLightbox(index) {
  lightboxPhotos = yearPhotos;
  currentIndex = index;
  showLightbox();
}

function showLightbox() {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = lightboxPhotos[currentIndex];
  if (!photo) { closeLightbox(); return; }
  img.src = photo.secure_url;
  img.alt = 'photo';
  info.textContent = `${currentIndex + 1} / ${lightboxPhotos.length}`;
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
  currentIndex = (currentIndex + dir + lightboxPhotos.length) % lightboxPhotos.length;
  const photo = lightboxPhotos[currentIndex];
  if (!photo) return;
  document.getElementById('lightboxImg').src = photo.secure_url;
  document.getElementById('lightboxImg').alt = 'photo';
  document.getElementById('lightboxInfo').textContent = `${currentIndex + 1} / ${lightboxPhotos.length}`;
}

function lightboxKeyHandler(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
}

// ===================== Init =====================
loadGallery();
