// ===== Upload =====
let selectedFiles = [];

const area = document.getElementById('uploadArea');
const input = document.getElementById('fileInput');
const preview = document.getElementById('uploadPreview');
const grid = document.getElementById('previewGrid');
const count = document.getElementById('fileCount');
const btn = document.getElementById('uploadBtn');

const CLOUD_NAME = 'dujsw8fkh';
const UPLOAD_PRESET = 'it4ocs5n';

area.addEventListener('click', () => input.click());

input.addEventListener('change', () => {
  handleFiles(input.files);
  input.value = '';
});

area.addEventListener('dragover', (e) => {
  e.preventDefault();
  area.classList.add('dragover');
});
area.addEventListener('dragleave', () => {
  area.classList.remove('dragover');
});
area.addEventListener('drop', (e) => {
  e.preventDefault();
  area.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

// Mobile: also support touch-based capture
document.addEventListener('DOMContentLoaded', () => {
  if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    input.removeAttribute('capture');
    input.setAttribute('capture', 'environment');
  }
});

function handleFiles(files) {
  const newFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (newFiles.length === 0) return showToast('请选择图片文件');
  selectedFiles = [...selectedFiles, ...newFiles];
  renderPreviews();
}

function renderPreviews() {
  if (selectedFiles.length === 0) {
    preview.style.display = 'none';
    return;
  }
  preview.style.display = 'block';
  count.textContent = selectedFiles.length;
  grid.innerHTML = '';
  selectedFiles.forEach((file, i) => {
    const div = document.createElement('div');
    div.className = 'preview-item';
    const url = URL.createObjectURL(file);
    div.innerHTML = `
      <img src="${url}" alt="">
      <button class="remove-preview" data-i="${i}">✕</button>
    `;
    div.querySelector('.remove-preview').addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.splice(i, 1);
      renderPreviews();
    });
    grid.appendChild(div);
  });
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
  return res.json();
}

async function tagOnBackend(data) {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      public_id: data.public_id,
      secure_url: data.secure_url,
      format: data.format,
      bytes: data.bytes,
      width: data.width,
      height: data.height,
    }),
  });
  if (!res.ok) throw new Error('Backend tag failed');
  return res.json();
}

async function startUpload() {
  if (selectedFiles.length === 0) return showToast('请先选择照片');
  btn.disabled = true;
  btn.textContent = '上传中...';
  const progress = document.getElementById('uploadProgress');
  const bar = document.getElementById('progressBar');
  const status = document.getElementById('uploadStatus');
  progress.style.display = 'block';

  const total = selectedFiles.length;
  let completed = 0;

  for (const file of selectedFiles) {
    try {
      const cloudData = await uploadToCloudinary(file);
      await tagOnBackend(cloudData);
    } catch (e) {
      showToast(`${file.name} 上传失败: ${e.message}`);
    }
    completed++;
    const pct = Math.round((completed / total) * 100);
    bar.style.width = pct + '%';
    status.textContent = `已上传 ${completed}/${total}`;
  }

  progress.style.display = 'none';
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> 上传到云端`;

  selectedFiles = [];
  renderPreviews();
  showToast(`完成！共上传 ${completed} 张照片`);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}
