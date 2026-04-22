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

function setNavLink(el, href, enabled) {
  if (enabled) {
    el.href = href;
    el.classList.remove('disabled');
  } else {
    el.href = '#';
    el.classList.add('disabled');
  }
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const veda = params.get('veda') || 'rik';
  const idx = Number(params.get('idx') || '0');

  if (!VEDAS[veda]) {
    document.getElementById('verseTitle').textContent = 'Invalid Veda selection';
    return;
  }

  document.getElementById('verseHeading').textContent = VEDAS[veda].title;
  document.getElementById('backLink').href = `index.html?veda=${encodeURIComponent(veda)}`;

  const res = await fetch(VEDAS[veda].file);
  if (!res.ok) {
    document.getElementById('verseTitle').textContent = 'Unable to load verse data';
    return;
  }

  const dataset = await res.json();
  const safeIndex = Number.isFinite(idx) && idx >= 0 && idx < dataset.rows.length ? idx : 0;
  const row = dataset.rows[safeIndex] || {};

  document.title = `VedaKosh — ${VEDAS[veda].title} Verse`;
  document.getElementById('verseTitle').textContent = `${VEDAS[veda].title} · ${getTitle(row, safeIndex)}`;

  const fields = document.getElementById('verseFields');
  fields.innerHTML = '';
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

  const prevLink = document.getElementById('prevLink');
  const nextLink = document.getElementById('nextLink');

  setNavLink(prevLink, `verse.html?veda=${encodeURIComponent(veda)}&idx=${safeIndex - 1}`, safeIndex > 0);
  setNavLink(nextLink, `verse.html?veda=${encodeURIComponent(veda)}&idx=${safeIndex + 1}`, safeIndex < dataset.rows.length - 1);
})();
