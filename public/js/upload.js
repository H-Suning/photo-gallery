// ===== Upload — 上传页面 =====
let selectedFiles = [];
let availableYears = [];

function optimizedUrl(url, w) {
  return url.replace("/upload/", "/upload/w_" + w + ",q_auto,f_auto/");
}

const area = document.getElementById('uploadArea');
const input = document.getElementById('fileInput');
const preview = document.getElementById('uploadPreview');
const grid = document.getElementById('previewGrid');
const count = document.getElementById('fileCount');
const btn = document.getElementById('uploadBtn');

const CLOUD_NAME = 'dujsw8fkh';
const UPLOAD_PRESET = 'it4ocs5n';

// Load years for dropdown
fetch('/api/years').then(r => r.json()).then(years => {
  availableYears = years;
  populateYearSelect();
}).catch(() => {});

function populateYearSelect() {
  const sel = document.getElementById('yearSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">不选择年份</option>';
  availableYears.forEach(y => {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    sel.appendChild(o);
  });
  const co = document.createElement('option');
  co.value = '__custom__'; co.textContent = '自定义年份...';
  sel.appendChild(co);
  sel.value = cur;
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('yearSelect');
  if (sel) {
    sel.addEventListener('change', () => {
      if (sel.value === '__custom__') {
        const y = prompt('输入4位年份（例如 2024）');
        if (y && /^\d{4}$/.test(y)) {
          if (!availableYears.includes(y)) {
            availableYears.push(y);
            availableYears.sort((a, b) => parseInt(b) - parseInt(a));
            populateYearSelect();
          }
          sel.value = y;
        } else {
          sel.value = '';
        }
      }
    });
  }
});

area.addEventListener('click', () => input.click());

input.addEventListener('change', () => {
  handleFiles(input.files);
  input.value = '';
});

area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
area.addEventListener('dragleave', () => area.classList.remove('dragover'));
area.addEventListener('drop', e => {
  e.preventDefault();
  area.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});

function handleFiles(files) {
  const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return showToast('请选择图片文件');
  selectedFiles = [...selectedFiles, ...imgs];
  renderPreviews();
}

function renderPreviews() {
  if (!selectedFiles.length) { preview.style.display = 'none'; return; }
  preview.style.display = 'block';
  count.textContent = selectedFiles.length;
  grid.innerHTML = '';
  selectedFiles.forEach((f, i) => {
    const d = document.createElement('div');
    d.className = 'preview-item';
    d.innerHTML = `<img src="${URL.createObjectURL(f)}" alt=""><button class="remove-preview" data-i="${i}">✕</button>`;
    d.querySelector('.remove-preview').addEventListener('click', e => { e.stopPropagation(); selectedFiles.splice(i, 1); renderPreviews(); });
    grid.appendChild(d);
  });
}

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed: ' + res.status);
  return res.json();
}

async function tagOnBackend(data, year) {
  const body = { public_id: data.public_id, secure_url: data.secure_url, format: data.format, bytes: data.bytes, width: data.width, height: data.height };
  if (year) body.year = year;
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Backend tag failed');
  return res.json();
}

async function startUpload() {
  if (!selectedFiles.length) return showToast('请先选择照片');
  const year = document.getElementById('yearSelect')?.value || '';
  btn.disabled = true;
  btn.textContent = '上传中...';
  const progress = document.getElementById('uploadProgress');
  const bar = document.getElementById('progressBar');
  const status = document.getElementById('uploadStatus');
  progress.style.display = 'block';

  let done = 0;
  const total = selectedFiles.length;
  const concurrency = Math.min(3, total);
  const queue = [...selectedFiles];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();
      try {
        const cloudData = await uploadToCloudinary(file);
        await tagOnBackend(cloudData, year);
      } catch (e) {
        showToast(`${file.name} 上传失败: ${e.message}`);
      }
      done++;
      bar.style.width = Math.round((done / total) * 100) + '%';
      status.textContent = `已上传 ${done}/${total}`;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  progress.style.display = 'none';
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> 上传到云端`;
  selectedFiles = [];
  renderPreviews();
  showToast(`完成！共上传 ${done} 张照片`);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}
