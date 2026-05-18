// ===== Gallery (Homepage) =====
let photos = [];
let currentIndex = 0;
let autoScrollTimer = null;
const MAX_PHOTOS = 10;
const AUTO_SCROLL_INTERVAL = 3000; // ms

async function loadGallery() {
  try {
    const res = await fetch('/api/photos?featured=true');
    let all = await res.json();
    photos = all.slice(0, MAX_PHOTOS);
  } catch { photos = []; }
  renderGallery();
  startAutoScroll();
}

function renderGallery() {
  const scroll = document.getElementById('galleryScroll');
  const empty = document.getElementById('emptyState');
  scroll.querySelectorAll('.gallery-card').forEach(el => el.remove());

  if (photos.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  // Set scroll container as a carousel
  scroll.classList.add('carousel');

  photos.forEach((photo, i) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.dataset.index = i;
    card.innerHTML = `<img src="${photo.secure_url}" alt="photo" loading="lazy">`;
    card.addEventListener('click', () => openLightbox(i));
    scroll.appendChild(card);
  });

  // Update indicator
  updateIndicator();
}

// Auto-scroll carousel
function startAutoScroll() {
  stopAutoScroll();
  if (photos.length <= 1) return;
  autoScrollTimer = setInterval(() => {
    const scroll = document.getElementById('galleryScroll');
    if (!scroll) return;
    const card = scroll.querySelector('.gallery-card');
    if (!card) return;
    const cardWidth = card.offsetWidth + parseInt(getComputedStyle(card).marginRight || 0);
    const maxScroll = scroll.scrollWidth - scroll.clientWidth;
    const next = scroll.scrollLeft + cardWidth;
    if (next >= maxScroll) {
      scroll.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      scroll.scrollTo({ left: next, behavior: 'smooth' });
    }
  }, AUTO_SCROLL_INTERVAL);
}

function stopAutoScroll() {
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }
}

// Pause on hover/touch
document.addEventListener('DOMContentLoaded', () => {
  const scroll = document.getElementById('galleryScroll');
  if (!scroll) return;
  scroll.addEventListener('mouseenter', stopAutoScroll);
  scroll.addEventListener('mouseleave', startAutoScroll);
  scroll.addEventListener('touchstart', stopAutoScroll);
  scroll.addEventListener('touchend', startAutoScroll);
});

function updateIndicator() {
  // Remove existing indicator
  const old = document.querySelector('.carousel-indicator');
  if (old) old.remove();
}

// Dragging
(function() {
  const scroll = document.getElementById('galleryScroll');
  let isDown = false, startX, scrollLeft;
  if (!scroll) return;
  scroll.addEventListener('mousedown', (e) => {
    isDown = true; startX = e.pageX - scroll.offsetLeft; scrollLeft = scroll.scrollLeft;
    scroll.classList.add('dragging');
    stopAutoScroll();
  });
  scroll.addEventListener('mouseleave', () => { isDown = false; scroll.classList.remove('dragging'); });
  scroll.addEventListener('mouseup', () => { isDown = false; scroll.classList.remove('dragging'); startAutoScroll(); });
  scroll.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - scroll.offsetLeft;
    scroll.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });
})();

// Lightbox
function openLightbox(index) {
  currentIndex = index;
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = photos[index];
  if (!photo) return;
  img.src = photo.secure_url;
  img.alt = 'photo';
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
  img.alt = 'photo';
  info.textContent = `${currentIndex + 1} / ${photos.length}`;
}

function lightboxKeyHandler(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
}

// Toast
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}

loadGallery();
