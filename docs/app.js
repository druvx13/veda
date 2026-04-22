const VEDAS = {
  rik: { title: 'ऋग्वेद (Rik)', file: 'data/rik.json' },
  yaju: { title: 'यजुर्वेद (Yaju)', file: 'data/yaju.json' },
  saam: { title: 'सामवेद (Saam)', file: 'data/saam.json' },
  atharva: { title: 'अथर्ववेद (Atharva)', file: 'data/atharva.json' }
};

const TITLE_KEYS = [
  'अध्याय.मन्त्रसंख्या', 'मन्त्र संख्या', 'मन्त्रसंख्या 1', '#',
  'काण्डः.सूक्तम्.मन्त्रः', 'मण्डलम्', 'सूक्तम्', 'मन्त्रः', 'क्रमसंख्या', 'क्रम संख्या', 'क्रमाङ्कः'
];

const appState = {
  current: 'rik',
  loaded: {},
  search: '',
  page: 1,
  pageSize: 20
};

const vedaSwitch = document.getElementById('vedaSwitch');
const searchInput = document.getElementById('searchInput');
const pageSizeEl = document.getElementById('pageSize');
const meta = document.getElementById('meta');
const results = document.getElementById('results');
const pagination = document.getElementById('pagination');
const template = document.getElementById('recordTemplate');

function normalizeValue(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function getTitle(record, fallbackIndex) {
  for (const key of TITLE_KEYS) {
    const val = normalizeValue(record[key]);
    if (val) return `${key}: ${val}`;
  }
  return `Record ${fallbackIndex + 1}`;
}

function searchableText(record) {
  return Object.values(record).map(normalizeValue).join(' ').toLowerCase();
}

function getVisibleRecords(dataset) {
  const s = appState.search.trim().toLowerCase();
  if (!s) return dataset.rows;
  return dataset.rows.filter((row) => searchableText(row).includes(s));
}

function render() {
  const dataset = appState.loaded[appState.current];
  if (!dataset) return;

  const visible = getVisibleRecords(dataset);
  const totalPages = Math.max(1, Math.ceil(visible.length / appState.pageSize));
  if (appState.page > totalPages) appState.page = totalPages;

  const start = (appState.page - 1) * appState.pageSize;
  const pageRows = visible.slice(start, start + appState.pageSize);

  meta.textContent = `${VEDAS[appState.current].title} · ${visible.length.toLocaleString()} matches of ${dataset.rows.length.toLocaleString()} rows`;

  results.innerHTML = '';
  pageRows.forEach((row, i) => {
    const node = template.content.cloneNode(true);
    node.querySelector('.record-title').textContent = getTitle(row, start + i);

    const fields = node.querySelector('.record-fields');
    Object.entries(row).forEach(([k, v]) => {
      const text = normalizeValue(v);
      if (!text) return;
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = text;
      wrap.append(dt, dd);
      fields.appendChild(wrap);
    });

    results.appendChild(node);
  });

  renderPager(totalPages);
}

function renderPager(totalPages) {
  pagination.innerHTML = '';
  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.disabled = appState.page <= 1;
  prev.onclick = () => { appState.page -= 1; render(); };

  const info = document.createElement('span');
  info.textContent = `Page ${appState.page} / ${totalPages}`;

  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.disabled = appState.page >= totalPages;
  next.onclick = () => { appState.page += 1; render(); };

  pagination.append(prev, info, next);
}

async function loadVeda(key) {
  if (appState.loaded[key]) return;
  const res = await fetch(VEDAS[key].file);
  if (!res.ok) throw new Error(`Failed to load ${VEDAS[key].file}`);
  appState.loaded[key] = await res.json();
}

function renderSwitch() {
  vedaSwitch.innerHTML = '';
  Object.entries(VEDAS).forEach(([key, val]) => {
    const b = document.createElement('button');
    b.className = `veda-btn ${key === appState.current ? 'active' : ''}`;
    b.textContent = val.title;
    b.onclick = async () => {
      appState.current = key;
      appState.page = 1;
      document.querySelectorAll('.veda-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      await loadVeda(key);
      render();
    };
    vedaSwitch.appendChild(b);
  });
}

searchInput.addEventListener('input', () => {
  appState.search = searchInput.value;
  appState.page = 1;
  render();
});

pageSizeEl.addEventListener('change', () => {
  appState.pageSize = Number(pageSizeEl.value) || 20;
  appState.page = 1;
  render();
});

(async function init() {
  renderSwitch();
  await loadVeda(appState.current);
  render();
})();
