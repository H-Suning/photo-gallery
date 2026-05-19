// ===== Manage — 管理页面 =====
let allPhotos = [];
let allYears = [];
let currentIndex = 0;
let dragFrom = null;

function optimizedUrl(url, w) {
  return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto/`);
}

async function loadPhotos() {
  try {
    const [pr, yr] = await Promise.all([
      fetch('/api/photos'),
      fetch('/api/years'),
    ]);
    allPhotos = await pr.json();
    allYears = await yr.json();
  } catch { allPhotos = []; }
  render();
}

function render() {
  const grid = document.getElementById('photoGrid');
  const stats = document.getElementById('mgStats');
  grid.querySelectorAll('.photo-item').forEach(el => el.remove());

  if (allPhotos.length === 0) {
    grid.querySelector('.empty-state').style.display = 'flex';
    stats.textContent = '0 张照片';
    return;
  }
  grid.querySelector('.empty-state').style.display = 'none';
  stats.textContent = `${allPhotos.length} 张照片 · ${allPhotos.filter(p => p.featured).length} 精选 · ${allYears.length} 年份`;

  allPhotos.forEach((photo, i) => {
    const div = document.createElement('div');
    div.className = 'photo-item';
    div.draggable = true;
    div.dataset.index = i;
    div.innerHTML = `
      <div class="check-wrap"><input type="checkbox" data-i="${i}"></div>
      <img src="${optimizedUrl(photo.secure_url, 300)}" alt="photo" loading="lazy">
      <div class="photo-actions">
        <button class="btn-star ${photo.featured ? 'active' : ''}" data-i="${i}" title="精选">★</button>
        <button class="btn-year" data-i="${i}" title="年份">📅</button>
        <button class="btn-del" data-i="${i}" title="删除">🗑</button>
      </div>
      <div class="photo-year-badge">${photo.year || ''}</div>
    `;

    div.querySelector('img').addEventListener('click', () => openLightbox(i));
    div.querySelector('.btn-star').addEventListener('click', e => { e.stopPropagation(); toggleFeatured(photo.id, i); });

    div.querySelector('.btn-year').addEventListener('click', e => { e.stopPropagation(); showYearPicker(photo.id, i); });
    div.querySelector('.btn-del').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('确定删除这张照片？')) deletePhoto(photo.id);
    });
    div.querySelector('input[type="checkbox"]').addEventListener('change', updateSelectAllBtn);

    // Drag
    div.addEventListener('dragstart', e => { dragFrom = i; div.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    div.addEventListener('dragend', () => { div.classList.remove('dragging'); document.querySelectorAll('.photo-item').forEach(el => el.classList.remove('drag-over')); });
    div.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.photo-item').forEach(el => el.classList.remove('drag-over')); div.classList.add('drag-over'); });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', e => {
      e.preventDefault(); div.classList.remove('drag-over');
      if (dragFrom === i) return;
      const [m] = allPhotos.splice(dragFrom, 1);
      allPhotos.splice(i, 0, m);
      render();
      showToast('顺序已调整，点击"保存排序"持久化');
    });

    grid.appendChild(div);
  });
}

async function toggleFeatured(photoId, idx) {
  try {
    const res = await fetch("/api/photos/" + encodeURIComponent(photoId) + "/feature", { method: "PUT" });
    if (!res.ok) throw new Error();
    const data = await res.json();
    allPhotos[idx].featured = data.featured;
    render();
    showToast(data.featured ? "已设为精选" : "已取消精选");
  } catch { showToast("操作失败"); }
}

async function deletePhoto(id) {
  try {
    const res = await fetch(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    allPhotos = allPhotos.filter(p => p.id !== id);
    render();
    showToast('已删除');
  } catch { showToast('删除失败'); }
}

async function saveOrder() {
  if (!allPhotos.length) return;
  try {
    const res = await fetch('/api/photos/reorder', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: allPhotos.map(p => p.id) }),
    });
    if (!res.ok) throw new Error();
    showToast('排序已保存');
  } catch { showToast('保存排序失败'); }
}

// ===== Year Picker =====
function showYearPicker(photoId, idx) {
  const existing = document.getElementById('yearPickerModal');
  if (existing) existing.remove();
  const photo = allPhotos[idx];
  if (!photo) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'yearPickerModal';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="modal">
      <h3>设置年份</h3>
      <p>为这张照片选择或输入年份</p>
      <div class="year-picker-grid">
        ${allYears.map(y => `<button class="year-option${photo.year === y ? ' active' : ''}" data-year="${y}">${y}</button>`).join('')}
      </div>
      <div class="year-picker-custom">
        <input type="number" id="yearCustomInput" placeholder="输入4位年份" min="1900" max="2099">
        <button class="btn btn-primary btn-sm" id="yearCustomBtn">添加</button>
      </div>
      <button class="btn-close-modal" onclick="this.closest('.modal-overlay').remove()">关闭</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('.year-option').forEach(b => {
    b.addEventListener('click', async () => {
      await setYear(photoId, b.dataset.year);
      overlay.remove();
    });
  });

  overlay.querySelector('#yearCustomBtn').addEventListener('click', async () => {
    const input = document.getElementById('yearCustomInput');
    const y = input.value.trim();
    if (!/^\d{4}$/.test(y)) { showToast('请输入4位年份'); return; }
    if (!allYears.includes(y)) { allYears.push(y); allYears.sort((a, b) => parseInt(b) - parseInt(a)); }
    await setYear(photoId, y);
    overlay.remove();
  });
}

async function setYear(photoId, year) {
  try {
    const res = await fetch(`/api/photos/${encodeURIComponent(photoId)}/year`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const p = allPhotos.find(x => x.id === photoId);
    if (p) p.year = year;
    render();
    showToast(`已设为 ${year} 年`);
  } catch (e) { showToast('设置年份失败: ' + e.message); }
}

// ===== Selection =====
let selectAllOn = false;
function toggleSelectAll() {
  selectAllOn = !selectAllOn;
  document.querySelectorAll('.photo-item input[type="checkbox"]').forEach(cb => { cb.checked = selectAllOn; });
  document.getElementById('selectAllBtn').textContent = selectAllOn ? '取消全选' : '全选';
}

function updateSelectAllBtn() {
  const all = document.querySelectorAll('.photo-item input[type="checkbox"]');
  const checked = document.querySelectorAll('.photo-item input[type="checkbox"]:checked');
  selectAllOn = all.length > 0 && all.length === checked.length;
  document.getElementById('selectAllBtn').textContent = selectAllOn ? '取消全选' : '全选';
}

function getSelectedIds() {
  return Array.from(document.querySelectorAll('.photo-item input[type="checkbox"]:checked')).map(cb => {
    return allPhotos[parseInt(cb.dataset.i)]?.id;
  }).filter(Boolean);
}

async function shareSelected() {
  const ids = getSelectedIds();
  if (!ids.length) return showToast('请先选择要分享的照片');
  try {
    const res = await fetch('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoIds: ids }) });
    const data = await res.json();
    document.getElementById('shareLinkInput').value = window.location.origin + '/share/' + data.token;
    document.getElementById('shareModal').classList.add('open');
  } catch { showToast('创建分享失败'); }
}

function closeShareModal() { document.getElementById('shareModal').classList.remove('open'); }

function copyShareLink() {
  const i = document.getElementById('shareLinkInput');
  i.select();
  navigator.clipboard.writeText(i.value).then(() => showToast('链接已复制')).catch(() => showToast('链接已复制'));
}

async function downloadSelected() {
  const ids = getSelectedIds();
  if (!ids.length) return showToast('请先选择要下载的照片');
  try {
    const res = await fetch('/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'photos.zip';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast('下载开始');
  } catch { showToast('下载失败'); }
}

async function deleteSelected() {
  const ids = getSelectedIds();
  if (!ids.length) return showToast('请先选择要删除的照片');
  if (!confirm(`确定删除选中的 ${ids.length} 张照片？`)) return;
  for (const id of ids) {
    try { await fetch(`/api/photos/${encodeURIComponent(id)}`, { method: 'DELETE' }); allPhotos = allPhotos.filter(p => p.id !== id); } catch {}
  }
  render();
  showToast(`已删除 ${ids.length} 张照片`);
}

// ===== Featured Management =====
let featuredIds = [];

async function manageFeatured() {
  // Fetch current featured list from server (initial load)
  try {
    const res = await fetch('/api/featured');
    featuredIds = (await res.json()).map(p => p.id);
  } catch { featuredIds = []; }
  renderFeaturedModal();
}

function renderFeaturedModal() {
  // Remove existing modal if any
  const existing = document.getElementById('featuredModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'featuredModal';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const allPhotosHtml = allPhotos.map((p, i) => {
    const idx = featuredIds.indexOf(p.id);
    const isFeatured = idx !== -1;
    return `<div class="featured-pick-item${isFeatured ? ' featured-selected' : ''}" data-id="${p.id}" data-index="${i}">
      <img src="${p.secure_url}" alt="photo" loading="lazy">
      <div class="featured-pick-order">${isFeatured ? (idx + 1) : '+'}</div>
    </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="modal modal-featured">
      <h3>精选照片管理</h3>
      <p>点击照片按顺序选择要展示在首页轮播的照片（1, 2, 3...），再次点击取消选择</p>
      <div class="featured-preview-list" id="featuredPreviewList">
        ${featuredIds.length ? featuredIds.map((id, i) => {
          const p = allPhotos.find(x => x.id === id);
          return p ? `<span class="featured-chip">${i + 1}. ${p.year || '照片 ' + (i + 1)}</span>` : '';
        }).join('') : '<span class="featured-chip-placeholder">尚未选择照片</span>'}
      </div>
      <div class="featured-pick-grid">${allPhotosHtml}</div>
      <div class="featured-actions">
        <button class="btn btn-primary" id="featuredSaveBtn">保存</button>
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Event delegation on grid — direct DOM mutation, no full re-render
  const grid = overlay.querySelector('.featured-pick-grid');
  const previewList = overlay.querySelector('#featuredPreviewList');
  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.featured-pick-item');
    if (!item) return;
    const id = item.dataset.id;
    const idx = featuredIds.indexOf(id);
    if (idx !== -1) {
      featuredIds.splice(idx, 1);
      item.classList.remove('featured-selected');
      item.querySelector('.featured-pick-order').textContent = '+';
    } else {
      featuredIds.push(id);
      item.classList.add('featured-selected');
      item.querySelector('.featured-pick-order').textContent = featuredIds.length;
    }
    // Update preview list without re-rendering entire modal
    previewList.innerHTML = featuredIds.length
      ? featuredIds.map((fid, fi) => {
          const p = allPhotos.find(x => x.id === fid);
          return p ? '<span class="featured-chip">' + (fi + 1) + '. ' + (p.year || '照片 ' + (fi + 1)) + '</span>' : '';
        }).join('')
      : '<span class="featured-chip-placeholder">尚未选择照片</span>';
  });

  document.getElementById('featuredSaveBtn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/featured', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: featuredIds }),
      });
      if (!res.ok) throw new Error();
      showToast(`精选照片已保存，共 ${featuredIds.length} 张`);
      overlay.remove();
    } catch { showToast('保存失败'); }
  });
}
function openLightbox(index) {
  currentIndex = index;
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const info = document.getElementById('lightboxInfo');
  const p = allPhotos[index];
  if (!p) return;
  img.src = optimizedUrl(p.secure_url, 1200);
  info.textContent = `${index + 1} / ${allPhotos.length}`;
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
  currentIndex = (currentIndex + dir + allPhotos.length) % allPhotos.length;
  const p = allPhotos[currentIndex];
  if (!p) return;
  document.getElementById('lightboxImg').src = p.secure_url;
  document.getElementById('lightboxInfo').textContent = `${currentIndex + 1} / ${allPhotos.length}`;
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
  t._hide = setTimeout(() => t.classList.remove('show'), 3000);
}

loadPhotos();
