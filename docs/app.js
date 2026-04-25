const VEDAS = {
  rik: { title: 'ऋग्वेद (Rik)', file: 'data/rik.json' },
  yaju: { title: 'यजुर्वेद (Yaju)', file: 'data/yaju.json' },
  saam: { title: 'सामवेद (Saam)', file: 'data/saam.json' },
  atharva: { title: 'अथर्ववेद (Atharva)', file: 'data/atharva.json' }
};

const REFERENCE_CONFIG = {
  rik: {
    levels: [
      { key: 'मण्डलम्', placeholder: 'Select Mandala...' },
      { key: 'सूक्तम्', placeholder: 'Select Sukta...' },
      { key: 'मन्त्रः', placeholder: 'Select Mantra...' }
    ]
  },
  yaju: {
    levels: [
      { key: 'अध्याय', placeholder: 'Select Adhyaya...' },
      { key: 'मन्त्रसंख्या', placeholder: 'Select Mantra...' }
    ]
  },
  saam: {
    levels: [
      { key: 'आर्चिकः', placeholder: 'Select Archika...' },
      { key: 'आर्चिकः दशति / सूक्त', placeholder: 'Select Dashati / Sukta...' },
      { key: 'आर्चिकः सूक्त मन्त्र', placeholder: 'Select Mantra...' }
    ]
  },
  atharva: {
    levels: [
      { key: 'काण्डः', placeholder: 'Select Kanda...' },
      { key: 'सूक्तम्', placeholder: 'Select Sukta...' },
      { key: 'मन्त्रः', placeholder: 'Select Mantra...' }
    ]
  }
};

const TITLE_KEYS = [
  'अध्याय.मन्त्रसंख्या', 'मन्त्र संख्या', 'मन्त्रसंख्या 1', '#',
  'काण्डः.सूक्तम्.मन्त्रः', 'मण्डलम्', 'सूक्तम्', 'मन्त्रः', 'क्रमसंख्या', 'क्रम संख्या', 'क्रमाङ्कः'
];

const FILTER_PREFS_KEY = 'vedakosh_advanced_filters_v1';
const EMPTY_FIELD_PLACEHOLDER = '—';

const appState = {
  current: 'rik',
  loaded: {},
  search: '',
  page: 1,
  pageSize: 20,
  selectorValues: [],
  filterPrefs: loadFilterPrefs()
};

const vedaSwitch = document.getElementById('vedaSwitch');
const hierarchySelectors = document.getElementById('hierarchySelectors');
const advancedFilterPanel = document.getElementById('advancedFilterPanel');
const advancedFilterSummary = document.getElementById('advancedFilterSummary');
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

function verseUrl(veda, idx) {
  return `verse.html?veda=${encodeURIComponent(veda)}&idx=${encodeURIComponent(idx)}`;
}

function asSortedArray(set) {
  return [...set].sort((a, b) => a.localeCompare(b, 'hi', { numeric: true }));
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

function saveFilterPrefs() {
  try {
    localStorage.setItem(FILTER_PREFS_KEY, JSON.stringify(appState.filterPrefs));
  } catch {
    // Ignore cache write failures.
  }
}

function ensureFilterState(dataset) {
  const headers = Array.isArray(dataset?.headers) ? dataset.headers : [];
  const current = appState.filterPrefs[appState.current] || { enabled: false, fields: [] };
  const cleanedFields = Array.isArray(current.fields) ? current.fields.filter((f) => headers.includes(f)) : [];
  appState.filterPrefs[appState.current] = {
    enabled: Boolean(current.enabled),
    fields: cleanedFields
  };
}

function getCurrentFilterState(dataset) {
  ensureFilterState(dataset);
  return appState.filterPrefs[appState.current];
}

function getDisplayKeys(dataset) {
  const headers = Array.isArray(dataset?.headers) ? dataset.headers : [];
  const state = getCurrentFilterState(dataset);
  if (!state.enabled || state.fields.length === 0) return headers;
  return state.fields;
}

function searchableText(record, keys) {
  return keys.map((k) => normalizeValue(record[k])).join(' ').toLowerCase();
}

function getVisibleRecords(dataset) {
  const s = appState.search.trim().toLowerCase();
  const searchKeys = getDisplayKeys(dataset);
  const scoped = getScopedRecords(dataset);

  if (!s) return scoped;

  const out = [];
  scoped.forEach(({ row, idx }) => {
    if (searchableText(row, searchKeys).includes(s)) out.push({ row, idx });
  });
  return out;
}

function getRequiredSelectionIndex() {
  const levels = REFERENCE_CONFIG[appState.current]?.levels || [];
  if (!levels.length) return -1;
  const suktaIndex = levels.findIndex((level) => /सूक्त|sukta/i.test(level.key));
  return suktaIndex >= 0 ? suktaIndex : levels.length - 1;
}

function hasRequiredSelection() {
  const requiredIndex = getRequiredSelectionIndex();
  if (requiredIndex < 0) return false;
  return Boolean(appState.selectorValues[requiredIndex]);
}

function getScopedRecords(dataset) {
  const levels = REFERENCE_CONFIG[appState.current]?.levels || [];
  const out = [];
  dataset.rows.forEach((row, idx) => {
    for (let i = 0; i < levels.length; i += 1) {
      const selected = appState.selectorValues[i] || '';
      if (!selected) continue;
      if (normalizeValue(row[levels[i].key]) !== selected) return;
    }
    out.push({ row, idx });
  });
  return out;
}

function getReferenceRows(dataset, levelIndex) {
  const levels = REFERENCE_CONFIG[appState.current].levels;
  return dataset.rows.filter((row) => {
    for (let i = 0; i < levelIndex; i += 1) {
      const key = levels[i].key;
      const selected = appState.selectorValues[i] || '';
      if (!selected) return false;
      if (normalizeValue(row[key]) !== selected) return false;
    }
    return true;
  });
}

function renderHierarchySelectors() {
  const dataset = appState.loaded[appState.current];
  const config = REFERENCE_CONFIG[appState.current];
  if (!dataset || !config) return;

  const levels = config.levels;
  if (!appState.selectorValues.length || appState.selectorValues.length !== levels.length) {
    appState.selectorValues = levels.map(() => '');
  }

  hierarchySelectors.innerHTML = '';

  levels.forEach((level, i) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = level.key;
    label.className = 'selector-label';

    const select = document.createElement('select');
    select.className = 'selector-input';
    select.dataset.level = String(i);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = i === 0 ? 'वांछित मन्त्र चुनें! / Select reference...' : level.placeholder;
    select.appendChild(placeholder);

    const pool = i === 0 ? dataset.rows : getReferenceRows(dataset, i);
    const values = asSortedArray(new Set(pool.map((r) => normalizeValue(r[level.key])).filter(Boolean)));

    values.forEach((val) => {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = val;
      if (appState.selectorValues[i] === val) option.selected = true;
      select.appendChild(option);
    });

    select.onchange = () => {
      appState.selectorValues[i] = select.value;
      for (let j = i + 1; j < levels.length; j += 1) appState.selectorValues[j] = '';
      appState.page = 1;
      render();
    };

    wrap.append(label, select);
    hierarchySelectors.appendChild(wrap);
  });
}

function renderAdvancedFilter() {
  const dataset = appState.loaded[appState.current];
  if (!dataset || !advancedFilterPanel || !advancedFilterSummary) return;

  const headers = Array.isArray(dataset.headers) ? dataset.headers : [];
  const state = getCurrentFilterState(dataset);

  advancedFilterPanel.innerHTML = '';

  const toggleWrap = document.createElement('label');
  toggleWrap.className = 'advanced-toggle';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = state.enabled;
  toggle.onchange = () => {
    appState.filterPrefs[appState.current] = {
      enabled: toggle.checked,
      fields: state.fields.slice()
    };
    appState.page = 1;
    saveFilterPrefs();
    render();
  };
  const toggleText = document.createElement('span');
  toggleText.textContent = 'Enable advanced content filter';
  toggleWrap.append(toggle, toggleText);
  advancedFilterPanel.appendChild(toggleWrap);

  const actions = document.createElement('div');
  actions.className = 'advanced-actions';
  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.textContent = 'Select all';
  selectAll.disabled = !state.enabled;
  selectAll.onclick = () => {
    appState.filterPrefs[appState.current] = {
      enabled: state.enabled,
      fields: headers.slice()
    };
    appState.page = 1;
    saveFilterPrefs();
    render();
  };
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.textContent = 'Clear all';
  clearAll.disabled = !state.enabled;
  clearAll.onclick = () => {
    appState.filterPrefs[appState.current] = {
      enabled: state.enabled,
      fields: []
    };
    appState.page = 1;
    saveFilterPrefs();
    render();
  };
  actions.append(selectAll, clearAll);
  advancedFilterPanel.appendChild(actions);

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
      appState.filterPrefs[appState.current] = {
        enabled: state.enabled,
        fields: headers.filter((h) => next.has(h))
      };
      appState.page = 1;
      saveFilterPrefs();
      render();
    };
    const text = document.createElement('span');
    text.textContent = key;
    item.append(input, text);
    list.appendChild(item);
  });

  advancedFilterPanel.appendChild(list);

  if (!state.enabled) {
    advancedFilterSummary.textContent = 'Advanced filter disabled: loading all content (default).';
  } else if (state.fields.length === 0) {
    advancedFilterSummary.textContent = 'Advanced filter enabled with no fields selected: loading all content.';
  } else {
    advancedFilterSummary.textContent = `Advanced filter enabled: showing ${state.fields.length} selected fields.`;
  }
}

function render() {
  const dataset = appState.loaded[appState.current];
  if (!dataset) return;

  renderHierarchySelectors();
  renderAdvancedFilter();

  if (!hasRequiredSelection()) {
    const requiredIndex = getRequiredSelectionIndex();
    const levels = REFERENCE_CONFIG[appState.current].levels;
    const requiredName = requiredIndex >= 0 ? levels[requiredIndex].key : 'सूक्तम्';
    meta.textContent = `${VEDAS[appState.current].title} · Select ${requiredName} (or verse) to load results.`;
    results.innerHTML = '';
    pagination.innerHTML = '';
    return;
  }

  const visible = getVisibleRecords(dataset);
  const displayKeys = getDisplayKeys(dataset);
  const totalPages = Math.max(1, Math.ceil(visible.length / appState.pageSize));
  if (appState.page > totalPages) appState.page = totalPages;

  const start = (appState.page - 1) * appState.pageSize;
  const pageRows = visible.slice(start, start + appState.pageSize);

  meta.textContent = `${VEDAS[appState.current].title} · ${visible.length.toLocaleString()} matches of ${dataset.rows.length.toLocaleString()} rows`;

  results.innerHTML = '';
  pageRows.forEach(({ row, idx }, i) => {
    const node = template.content.cloneNode(true);
    node.querySelector('.record-title').textContent = getTitle(row, start + i);
    const link = node.querySelector('.record-link');
    link.href = verseUrl(appState.current, idx);

    const fields = node.querySelector('.record-fields');
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
      appState.selectorValues = [];
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
  const qsVeda = new URLSearchParams(window.location.search).get('veda');
  if (qsVeda && VEDAS[qsVeda]) appState.current = qsVeda;
  renderSwitch();
  await loadVeda(appState.current);
  render();
})();
