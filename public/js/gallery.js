// ===== Gallery (Homepage) with 3D Cylinder Carousel + Year Timeline =====
let photos = [];
let allPhotos = []; // for year timeline
let currentIndex = 0;
let currentAngle = 0;
let autoRollTimer = null;
let isDragging = false;
let dragStartX = 0;
let dragStartAngle = 0;
let isHovering = false;

const MAX_PHOTOS = 10;
const AUTO_ROLL_INTERVAL = 3500; // ms
const STAGE_SELECTOR = '#carouselStage';
const CAROUSEL_SELECTOR = '#carousel3d';

// ===================== 3D Carousel =====================

async function loadGallery() {
  try {
    const res = await fetch('/api/photos?featured=true');
    let all = await res.json();
    photos = all.slice(0, MAX_PHOTOS);
  } catch { photos = []; }
  renderCarousel();
  startAutoRoll();
  loadYears();
}

function renderCarousel() {
  const stage = document.querySelector(STAGE_SELECTOR);
  const wrap = document.querySelector('.carousel-3d-wrap');
  const empty = document.getElementById('emptyState');
  const carousel = document.querySelector(CAROUSEL_SELECTOR);

  if (!stage) return;

  // Clear existing cards
  stage.querySelectorAll('.carousel-3d-card').forEach(el => el.remove());

  if (photos.length === 0) {
    empty.style.display = 'flex';
    carousel.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  carousel.style.display = 'flex';
  currentAngle = 0;

  const count = photos.length;
  const angle = 360 / count;
  const cardWidth = window.innerWidth <= 480 ? 140 : window.innerWidth <= 768 ? 180 : 240;
  // Compute radius so cards don't overlap: r = w / (2 * sin(π/n))
  const rad = Math.max(220, cardWidth / (2 * Math.sin(Math.PI / count)));

  photos.forEach((photo, i) => {
    const card = document.createElement('div');
    card.className = 'carousel-3d-card';
    const tilt = i * angle;
    card.style.transform = `rotateY(${tilt}deg) translateZ(${rad}px)`;
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
  stage.dataset.angle = angle;
  stage.dataset.radius = rad;
  stage.dataset.count = count;
}

// Auto-rotation
function startAutoRoll() {
  stopAutoRoll();
  if (photos.length <= 1) return;
  autoRollTimer = setInterval(() => {
    if (isHovering || isDragging) return;
    const stage = document.querySelector(STAGE_SELECTOR);
    if (!stage) return;
    const angle = parseFloat(stage.dataset.angle) || (360 / photos.length);
    currentAngle += angle;
    stage.style.transform = `rotateY(${-currentAngle}deg)`;
  }, AUTO_ROLL_INTERVAL);
}

function stopAutoRoll() {
  if (autoRollTimer) {
    clearInterval(autoRollTimer);
    autoRollTimer = null;
  }
}

// Hover pause
document.addEventListener('DOMContentLoaded', () => {
  const carousel = document.querySelector(CAROUSEL_SELECTOR);
  if (!carousel) return;
  carousel.addEventListener('mouseenter', () => { isHovering = true; });
  carousel.addEventListener('mouseleave', () => { isHovering = false; });
  carousel.addEventListener('touchstart', () => { isHovering = true; });
  carousel.addEventListener('touchend', () => { isHovering = false; });
});

// Prev / Next buttons
document.addEventListener('DOMContentLoaded', () => {
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateCarousel(-1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateCarousel(1);
    });
  }
});

function navigateCarousel(dir) {
  const stage = document.querySelector(STAGE_SELECTOR);
  if (!stage) return;
  const angle = parseFloat(stage.dataset.angle) || (360 / (parseInt(stage.dataset.count) || photos.length));
  currentAngle += angle * dir;
  stage.style.transform = `rotateY(${-currentAngle}deg)`;
  // Reset auto-roll timer so it doesn't jump immediately after manual nav
  stopAutoRoll();
  startAutoRoll();
}

// Drag rotation
(function() {
  let stage = null;
  let isDown = false;
  let startX = 0;
  let startAngle = 0;
  let hasMoved = false;

  document.addEventListener('DOMContentLoaded', () => {
    stage = document.querySelector(STAGE_SELECTOR);
    if (!stage) return;
    const carousel = document.querySelector(CAROUSEL_SELECTOR);
    if (!carousel) return;

    carousel.addEventListener('mousedown', (e) => {
      if (e.target.closest('.carousel-3d-nav')) return;
      isDown = true;
      hasMoved = false;
      startX = e.pageX;
      startAngle = currentAngle;
      isDragging = true;
      stage.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 5) hasMoved = true;
      const container = carousel;
      const w = container.offsetWidth || 900;
      const deltaAngle = (dx / w) * 360;
      currentAngle = startAngle + deltaAngle;
      stage.style.transform = `rotateY(${-currentAngle}deg)`;
    });

    window.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      isDragging = false;
      if (!stage) return;
      stage.style.transition = 'transform 0.4s ease';
      // Snap to nearest card
      const angle = parseFloat(stage.dataset.angle) || (360 / (parseInt(stage.dataset.count) || photos.length));
      if (hasMoved) {
        // Snap: round to nearest angle increment
        const snapped = Math.round(currentAngle / angle) * angle;
        currentAngle = snapped;
        stage.style.transform = `rotateY(${-currentAngle}deg)`;
      }
      // Resume auto-roll
      stopAutoRoll();
      startAutoRoll();
    });
  });
})();

// ===================== Year Timeline =====================

let selectedYear = null;
let yearPhotos = [];

async function loadYears() {
  try {
    const res = await fetch('/api/photos');
    allPhotos = await res.json();
  } catch { allPhotos = []; }

  const section = document.getElementById('yearSection');
  if (allPhotos.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  // Extract unique years
  const years = new Set();
  allPhotos.forEach(p => {
    if (p.created_at) {
      const y = new Date(p.created_at).getFullYear();
      if (!isNaN(y)) years.add(y);
    }
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a); // descending
  if (sortedYears.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';

  const timeline = document.getElementById('yearTimeline');
  if (!timeline) return;
  timeline.innerHTML = '';

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className = 'year-marker';
  allBtn.textContent = '全部';
  allBtn.addEventListener('click', () => selectYear(null, allBtn));
  timeline.appendChild(allBtn);

  sortedYears.forEach(year => {
    const btn = document.createElement('button');
    btn.className = 'year-marker';
    btn.textContent = year;
    btn.dataset.year = year;
    btn.addEventListener('click', () => selectYear(year, btn));
    timeline.appendChild(btn);
  });

  // Default: no year selected (show "all" as active, show all photos)
  selectYear(null, allBtn);
}

function selectYear(year, btn) {
  selectedYear = year;
  // Update active state
  document.querySelectorAll('.year-marker').forEach(m => m.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Filter photos
  if (year === null) {
    yearPhotos = [...allPhotos];
  } else {
    yearPhotos = allPhotos.filter(p => {
      if (!p.created_at) return false;
      const y = new Date(p.created_at).getFullYear();
      return y === year;
    });
  }

  renderYearPhotos();
}

function renderYearPhotos() {
  const grid = document.getElementById('yearPhotoGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (yearPhotos.length === 0) {
    // Because we only show years that have photos, this shouldn't normally happen
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
    div.addEventListener('click', () => {
      // Open lightbox with yearPhotos context
      currentIndex = i;
      openYearLightbox(i);
    });
    grid.appendChild(div);
  });
}

// ===================== Lightbox (shared between carousel and year grid) =====================
let lightboxPhotos = [];
let lightboxMode = 'carousel'; // 'carousel' or 'year'

function openLightbox(index) {
  lightboxPhotos = photos;
  lightboxMode = 'carousel';
  currentIndex = index;
  showLightbox();
}

function openYearLightbox(index) {
  lightboxPhotos = yearPhotos;
  lightboxMode = 'year';
  currentIndex = index;
  showLightbox();
}

function showLightbox() {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = lightboxPhotos[currentIndex];
  if (!photo) return;
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
  currentIndex += dir;
  if (currentIndex < 0) currentIndex = lightboxPhotos.length - 1;
  if (currentIndex >= lightboxPhotos.length) currentIndex = 0;
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = lightboxPhotos[currentIndex];
  if (!photo) return;
  img.src = photo.secure_url;
  img.alt = 'photo';
  info.textContent = `${currentIndex + 1} / ${lightboxPhotos.length}`;
}

function lightboxKeyHandler(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
}

// ===================== Toast =====================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}

loadGallery();
