// ===== Gallery (Homepage) =====
let photos = [];
let currentIndex = 0;

async function loadGallery() {
  try {
    const res = await fetch('/api/photos?featured=true');
    photos = await res.json();
  } catch { photos = []; }
  renderGallery();
}

function renderGallery() {
  const scroll = document.getElementById('galleryScroll');
  const empty = document.getElementById('emptyState');
  // Clear all children except empty state
  scroll.querySelectorAll('.gallery-card').forEach(el => el.remove());

  if (photos.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  photos.forEach((photo, i) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.style.animationDelay = `${(i % 6) * 0.05}s`;
    card.innerHTML = `<img src="${photo.secure_url}" alt="photo" loading="lazy">`;
    card.addEventListener('click', () => openLightbox(i));
    scroll.appendChild(card);
  });
}

// Dragging
(function() {
  const scroll = document.getElementById('galleryScroll');
  let isDown = false, startX, scrollLeft;
  if (!scroll) return;
  scroll.addEventListener('mousedown', (e) => {
    isDown = true; startX = e.pageX - scroll.offsetLeft; scrollLeft = scroll.scrollLeft;
    scroll.classList.add('dragging');
  });
  scroll.addEventListener('mouseleave', () => { isDown = false; scroll.classList.remove('dragging'); });
  scroll.addEventListener('mouseup', () => { isDown = false; scroll.classList.remove('dragging'); });
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
  // Keyboard nav
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
