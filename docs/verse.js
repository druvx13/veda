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

const FILTER_PREFS_KEY = 'vedakosh_advanced_filters_v1';
const EMPTY_FIELD_PLACEHOLDER = '—';

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

function loadFilterPrefs() {
  try {
    const raw = localStorage.getItem(FILTER_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveFilterPrefs(prefs) {
  try {
    localStorage.setItem(FILTER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    return;
  }
}

function ensureFilterState(prefs, veda, headers) {
  const current = prefs[veda] || { enabled: false, fields: [] };
  const cleanedFields = Array.isArray(current.fields) ? current.fields.filter((f) => headers.includes(f)) : [];
  prefs[veda] = {
    enabled: Boolean(current.enabled),
    fields: cleanedFields
  };
}

function getDisplayKeys(prefs, veda, headers) {
  ensureFilterState(prefs, veda, headers);
  const state = prefs[veda];
  if (!state.enabled || state.fields.length === 0) return headers;
  return state.fields;
}

function renderAdvancedFilter(dataset, veda, prefs, onChange) {
  const panel = document.getElementById('advancedFilterPanel');
  const summary = document.getElementById('advancedFilterSummary');
  if (!panel || !summary) return;

  const headers = Array.isArray(dataset.headers) ? dataset.headers : [];
  ensureFilterState(prefs, veda, headers);
  const state = prefs[veda];

  panel.innerHTML = '';

  const toggleWrap = document.createElement('label');
  toggleWrap.className = 'advanced-toggle';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = state.enabled;
  toggle.onchange = () => {
    prefs[veda] = {
      enabled: toggle.checked,
      fields: state.fields.slice()
    };
    saveFilterPrefs(prefs);
    onChange();
  };
  const toggleText = document.createElement('span');
  toggleText.textContent = 'Enable advanced content filter';
  toggleWrap.append(toggle, toggleText);
  panel.appendChild(toggleWrap);

  const actions = document.createElement('div');
  actions.className = 'advanced-actions';
  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.textContent = 'Select all';
  selectAll.disabled = !state.enabled;
  selectAll.onclick = () => {
    prefs[veda] = {
      enabled: state.enabled,
      fields: headers.slice()
    };
    saveFilterPrefs(prefs);
    onChange();
  };
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.textContent = 'Clear all';
  clearAll.disabled = !state.enabled;
  clearAll.onclick = () => {
    prefs[veda] = {
      enabled: state.enabled,
      fields: []
    };
    saveFilterPrefs(prefs);
    onChange();
  };
  actions.append(selectAll, clearAll);
  panel.appendChild(actions);

  const list = document.createElement('div');
  list.className = 'advanced-list';

  headers.forEach((key) => {
    const item = document.createElement('label');
    item.className = 'advanced-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.fields.includes(key);
    input.disabled = !state.enabled;
    input.onchange = () => {
      const next = new Set(state.fields);
      if (input.checked) next.add(key);
      else next.delete(key);
      prefs[veda] = {
        enabled: state.enabled,
        fields: headers.filter((h) => next.has(h))
      };
      saveFilterPrefs(prefs);
      onChange();
    };
    const text = document.createElement('span');
    text.textContent = key;
    item.append(input, text);
    list.appendChild(item);
  });

  panel.appendChild(list);

  if (!state.enabled) {
    summary.textContent = 'Advanced filter disabled: loading all content (default).';
  } else if (state.fields.length === 0) {
    summary.textContent = 'Advanced filter enabled with no fields selected: loading all content.';
  } else {
    summary.textContent = `Advanced filter enabled: showing ${state.fields.length} selected fields.`;
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
  const headers = Array.isArray(dataset.headers) ? dataset.headers : Object.keys(row);
  const prefs = loadFilterPrefs();

  const fields = document.getElementById('verseFields');

  function renderVerseFields() {
    const displayKeys = getDisplayKeys(prefs, veda, headers);

    fields.innerHTML = '';
    displayKeys.forEach((k) => {
      const text = normalizeValue(row[k]);
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = text || EMPTY_FIELD_PLACEHOLDER;
      wrap.append(dt, dd);
      fields.appendChild(wrap);
    });
  }

  document.title = `VedaKosh — ${VEDAS[veda].title} Verse`;
  document.getElementById('verseTitle').textContent = `${VEDAS[veda].title} · ${getTitle(row, safeIndex)}`;

  function rerenderAll() {
    renderAdvancedFilter(dataset, veda, prefs, rerenderAll);
    renderVerseFields();
  }

  rerenderAll();

  const prevLink = document.getElementById('prevLink');
  const nextLink = document.getElementById('nextLink');

  setNavLink(prevLink, `verse.html?veda=${encodeURIComponent(veda)}&idx=${safeIndex - 1}`, safeIndex > 0);
  setNavLink(nextLink, `verse.html?veda=${encodeURIComponent(veda)}&idx=${safeIndex + 1}`, safeIndex < dataset.rows.length - 1);
})();
