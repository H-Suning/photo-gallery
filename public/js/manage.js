// ===== Manage =====
let allPhotos = [];
let currentIndex = 0;

async function loadPhotos() {
  try {
    const res = await fetch('/api/photos');
    allPhotos = await res.json();
  } catch { allPhotos = []; }
  render();
}

function render() {
  const grid = document.getElementById('photoGrid');
  const stats = document.getElementById('mgStats');
  // Remove photo-items, keep empty state
  grid.querySelectorAll('.photo-item').forEach(el => el.remove());

  if (allPhotos.length === 0) {
    grid.querySelector('.empty-state').style.display = 'flex';
    stats.textContent = '0 张照片';
    return;
  }
  grid.querySelector('.empty-state').style.display = 'none';
  stats.textContent = `${allPhotos.length} 张照片 · ${allPhotos.filter(p => p.featured).length} 张精选`;

  allPhotos.forEach((photo, i) => {
    const div = document.createElement('div');
    div.className = 'photo-item';
    div.innerHTML = `
      <div class="check-wrap">
        <input type="checkbox" data-i="${i}">
      </div>
      <img src="${photo.secure_url}" alt="photo" loading="lazy">
      <div class="photo-actions">
        <button class="btn-star ${photo.featured ? 'active' : ''}" data-i="${i}" title="精选">
          <svg viewBox="0 0 24 24" fill="${photo.featured ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        <button class="btn-del" data-i="${i}" title="删除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    // Image click → lightbox
    div.querySelector('img').addEventListener('click', () => openLightbox(i));
    // Star toggle
    div.querySelector('.btn-star').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFeature(photo.id);
    });
    // Delete
    div.querySelector('.btn-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('确定删除这张照片？')) return;
      await deletePhoto(photo.id);
    });
    // Checkbox
    div.querySelector('input[type="checkbox"]').addEventListener('change', updateSelectAllBtn);

    grid.appendChild(div);
  });
}

async function toggleFeature(id) {
  try {
    const res = await fetch(`/api/photos/${encodeURIComponent(id)}/feature`, { method: 'PUT' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const photo = allPhotos.find(p => p.id === id);
    if (photo) photo.featured = data.featured;
    render();
    showToast(data.featured ? '已添加到首页精选' : '已从首页移除');
  } catch {
    showToast('操作失败');
  }
}

async function deletePhoto(id) {
  try {
    const res = await fetch(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    allPhotos = allPhotos.filter(p => p.id !== id);
    render();
    showToast('已删除');
  } catch {
    showToast('删除失败');
  }
}

// Selection
let selectAllOn = false;
function toggleSelectAll() {
  selectAllOn = !selectAllOn;
  document.querySelectorAll('.photo-item input[type="checkbox"]').forEach(cb => {
    cb.checked = selectAllOn;
  });
  document.getElementById('selectAllBtn').textContent = selectAllOn ? '取消全选' : '全选';
}

function updateSelectAllBtn() {
  const all = document.querySelectorAll('.photo-item input[type="checkbox"]');
  const checked = document.querySelectorAll('.photo-item input[type="checkbox"]:checked');
  selectAllOn = all.length > 0 && all.length === checked.length;
  document.getElementById('selectAllBtn').textContent = selectAllOn ? '取消全选' : '全选';
}

function getSelectedIds() {
  const checked = document.querySelectorAll('.photo-item input[type="checkbox"]:checked');
  return Array.from(checked).map(cb => {
    const i = parseInt(cb.dataset.i);
    return allPhotos[i]?.id;
  }).filter(Boolean);
}

async function shareSelected() {
  const ids = getSelectedIds();
  if (ids.length === 0) return showToast('请先选择要分享的照片');
  try {
    const res = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds: ids }),
    });
    const data = await res.json();
    const link = `${window.location.origin}/share/${data.token}`;
    document.getElementById('shareLinkInput').value = link;
    document.getElementById('shareModal').classList.add('open');
  } catch {
    showToast('创建分享失败');
  }
}

function closeShareModal() {
  document.getElementById('shareModal').classList.remove('open');
}

function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('链接已复制');
  }).catch(() => {
    document.execCommand('copy');
    showToast('链接已复制');
  });
}

async function downloadSelected() {
  const ids = getSelectedIds();
  if (ids.length === 0) return showToast('请先选择要下载的照片');
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'photos.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('下载开始');
  } catch {
    showToast('下载失败');
  }
}

async function deleteSelected() {
  const ids = getSelectedIds();
  if (ids.length === 0) return showToast('请先选择要删除的照片');
  if (!confirm(`确定删除选中的 ${ids.length} 张照片？此操作不可恢复。`)) return;
  for (const id of ids) {
    try {
      await fetch(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
      allPhotos = allPhotos.filter(p => p.id !== id);
    } catch {}
  }
  render();
  showToast(`已删除 ${ids.length} 张照片`);
}

// Lightbox
function openLightbox(index) {
  currentIndex = index;
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = allPhotos[index];
  if (!photo) return;
  img.src = photo.secure_url;
  info.textContent = `${index + 1} / ${allPhotos.length}`;
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
  if (currentIndex < 0) currentIndex = allPhotos.length - 1;
  if (currentIndex >= allPhotos.length) currentIndex = 0;
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const photo = allPhotos[currentIndex];
  if (!photo) return;
  img.src = photo.secure_url;
  info.textContent = `${currentIndex + 1} / ${allPhotos.length}`;
}

function lightboxKeyHandler(e) {
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

loadPhotos();
