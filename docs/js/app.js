(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let manifest = null;
let MODULES = [];
let SOURCES = [];
let RULES = [];
let CURRENT_RULES = [];
let filtered = [];
let selectedKey = '';
let currentPage = 1;
let pageSize = 10;

const normalizeArea = a => a === '零售' ? '販售' : a;
const normalizedAreas = r => [...new Set((r.areas || []).map(normalizeArea))];
const displayArea = r => normalizedAreas(r).join('／');
const hasArea = (r, area) => !area || normalizedAreas(r).includes(area);
const attachModule = (name, rows) => rows.map(r => ({...r, areas: normalizedAreas(r), module:name}));
const ruleKey = r => `${r.module}::${r.id}`;
const viewMode = () => document.querySelector('input[name="viewMode"]:checked')?.value || 'current';

async function loadJson(url){
  const sep = url.includes('?') ? '&' : '?';
  const r = await fetch(url + sep + 'v=20260823-ui2', {cache:'no-store'});
  if(!r.ok) throw new Error(`${url} 載入失敗：HTTP ${r.status}`);
  return r.json();
}

async function loadData(){
  manifest = await loadJson('data/manifest.json');
  const datasets = await Promise.all(manifest.modules.map(m => loadJson(m.file)));
  SOURCES = await loadJson(manifest.sources);
  MODULES = manifest.modules;
  RULES = datasets.flatMap(d => attachModule(d.name, d.rules || []));
  CURRENT_RULES = datasets.flatMap(d => attachModule(d.name, d.current || (d.rules || []).filter(r => r.status !== '未來實施')));
  $('#lastReviewed').textContent = manifest.lastReviewed || manifest.version;
  $('#dataVersion').textContent = manifest.version;
}

function activeData(){
  const mode = viewMode();
  if(mode === 'history') return RULES.filter(r => r.status !== '未來實施');
  if(mode === 'future') return RULES.filter(r => r.status === '未來實施');
  return CURRENT_RULES;
}

function moduleLabel(name){
  if(name === '食品安全管制系統 HACCP') return 'HACCP';
  return name;
}

function populateControls(){
  MODULES.forEach(m => $('#module').insertAdjacentHTML('beforeend', `<option value="${esc(m.name)}">${esc(m.name)}</option>`));
  const areas = [...new Set(RULES.flatMap(r => normalizedAreas(r)))].sort((a,b) => a.localeCompare(b,'zh-Hant'));
  areas.forEach(a => $('#area').insertAdjacentHTML('beforeend', `<option value="${esc(a)}">${esc(a)}</option>`));
  $('#quickChips').innerHTML = `<button class="module-tab on" type="button" data-v="">全部模組</button>` + MODULES.map(m => `<button class="module-tab" type="button" data-v="${esc(m.name)}">${esc(moduleLabel(m.name))}</button>`).join('');
  $('#quickChips').addEventListener('click', e => {
    const b = e.target.closest('.module-tab');
    if(!b) return;
    $('#module').value = b.dataset.v || '';
    syncModuleTabs();
    currentPage = 1;
    clearDetail();
    render();
  });
}

function syncModuleTabs(){
  const value = $('#module').value;
  document.querySelectorAll('.module-tab').forEach(x => x.classList.toggle('on', (x.dataset.v || '') === value));
}

function applyFilters(){
  const data = activeData();
  const q = $('#q').value.trim().toLowerCase();
  const m = $('#module').value;
  const a = $('#area').value;
  filtered = data.filter(r => {
    const hay = [r.module, displayArea(r), r.category, r.scale, r.start, r.note, r.basis, r.sourceName].join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (!m || r.module === m) && hasArea(r,a);
  });
}

function render(){
  applyFilters();
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(Math.max(1,currentPage), totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  $('#count').textContent = `（共 ${filtered.length} 筆）`;

  $('#rows').innerHTML = pageRows.length ? pageRows.map(r => {
    const key = ruleKey(r);
    return `<tr data-id="${r.id}" data-module="${esc(r.module)}" class="${key===selectedKey?'selected':''}">
      <td class="module-cell">${esc(r.module)}</td>
      <td>${esc(displayArea(r))}</td>
      <td>${esc(r.category)}</td>
      <td>${esc(r.scale)}</td>
      <td>${esc(r.start)}</td>
      <td><span class="status ${r.status==='未來實施'?'future':'active'}">${esc(r.status)}</span></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-cell">沒有符合條件的規則</td></tr>';

  document.querySelectorAll('#rows tr[data-id]').forEach(tr => tr.addEventListener('click', () => showDetail(Number(tr.dataset.id), tr.dataset.module)));
  renderPagination(totalPages);
}

function renderPagination(totalPages){
  const total = filtered.length;
  const start = total ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, total);
  $('#pageInfo').textContent = total ? `${start}–${end} / ${total} 筆` : '0 筆';
  const pages = [];
  const add = p => { if(p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p); };
  add(1); add(currentPage - 2); add(currentPage - 1); add(currentPage); add(currentPage + 1); add(currentPage + 2); add(totalPages);
  pages.sort((a,b)=>a-b);
  let html = `<button class="page-btn" type="button" data-page="${currentPage-1}" ${currentPage===1?'disabled':''} aria-label="上一頁">‹</button>`;
  let prev = 0;
  for(const p of pages){
    if(prev && p - prev > 1) html += '<span class="page-ellipsis">…</span>';
    html += `<button class="page-btn ${p===currentPage?'on':''}" type="button" data-page="${p}">${p}</button>`;
    prev = p;
  }
  html += `<button class="page-btn" type="button" data-page="${currentPage+1}" ${currentPage===totalPages?'disabled':''} aria-label="下一頁">›</button>`;
  $('#pager').innerHTML = html;
}

function showDetail(id,module){
  const r = activeData().find(x => x.id === id && x.module === module);
  if(!r) return;
  selectedKey = ruleKey(r);
  $('#detailEmpty').hidden = true;
  $('#detailBox').hidden = false;
  $('#dTitle').textContent = r.category;
  $('#dModule').textContent = r.module;
  $('#dArea').textContent = displayArea(r);
  $('#dCategory').textContent = r.category;
  $('#dScale').textContent = r.scale;
  $('#dStart').textContent = r.start;
  $('#dBasis').textContent = r.basis || '—';
  $('#dNote').textContent = r.note || '—';
  const st = $('#dStatus');
  st.textContent = r.status;
  st.className = 'status ' + (r.status === '未來實施' ? 'future' : 'active');
  const src = $('#dSource');
  src.textContent = r.sourceName || '官方來源';
  src.href = r.sourceUrl || '#';
  src.style.display = r.sourceUrl ? '' : 'none';
  render();
}

function clearDetail(){
  selectedKey = '';
  $('#detailEmpty').hidden = false;
  $('#detailBox').hidden = true;
}

function reset(){
  $('#q').value = '';
  $('#module').value = '';
  $('#area').value = '';
  document.querySelector('input[name="viewMode"][value="current"]').checked = true;
  currentPage = 1;
  syncModuleTabs();
  clearDetail();
  render();
}

function downloadCsv(){
  const cols = ['法規模組','業態','產品／業別','規模／條件','實施日期','狀態','法源','備註','官方來源'];
  const lines = [cols, ...filtered.map(r => [r.module,displayArea(r),r.category,r.scale,r.start,r.status,r.basis,r.note,r.sourceUrl])];
  const csv = '\ufeff' + lines.map(row => row.map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '食品法規目前查詢結果.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function openModal(modal){
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
}
function closeModal(modal){
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  if(!document.querySelector('.drawer-modal.open')) document.body.style.overflow = '';
}

function setupSources(){
  $('#sources').innerHTML = SOURCES.map(s => `<div class="source"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a><div class="source-desc">${esc(s.desc)}</div></div>`).join('');
  const modal = $('#sourceModal');
  $('#sourcesBtn').addEventListener('click', () => openModal(modal));
  $('#sourcesCloseBtn').addEventListener('click', () => closeModal(modal));
  modal.querySelectorAll('[data-close-sources]').forEach(el => el.addEventListener('click', () => closeModal(modal)));
}

function setupModules(){
  const modal = $('#modulesModal');
  const list = $('#moduleCatalog');
  $('#moduleCount').textContent = MODULES.length;
  list.innerHTML = MODULES.map(m => {
    const n = CURRENT_RULES.filter(r => r.module === m.name).length;
    return `<button type="button" class="module-catalog-item" data-module="${esc(m.name)}"><span class="module-catalog-name">${esc(m.name)}</span><span class="module-catalog-count">${n} 筆現行規則</span></button>`;
  }).join('');
  $('#modulesBtn').addEventListener('click', () => openModal(modal));
  $('#modulesCloseBtn').addEventListener('click', () => closeModal(modal));
  modal.querySelectorAll('[data-close-modules]').forEach(el => el.addEventListener('click', () => closeModal(modal)));
  list.addEventListener('click', e => {
    const item = e.target.closest('[data-module]');
    if(!item) return;
    $('#module').value = item.dataset.module;
    syncModuleTabs();
    currentPage = 1;
    clearDetail();
    closeModal(modal);
    $('#querySection').scrollIntoView({behavior:'smooth',block:'start'});
    render();
  });
}

function setupHelp(){
  const modal = $('#helpModal');
  $('#helpBtn').addEventListener('click', () => openModal(modal));
  $('#helpCloseBtn').addEventListener('click', () => closeModal(modal));
  modal.querySelectorAll('[data-close-help]').forEach(el => el.addEventListener('click', () => closeModal(modal)));
}

function setupEvents(){
  $('#module').addEventListener('change', () => { currentPage = 1; syncModuleTabs(); clearDetail(); render(); });
  $('#area').addEventListener('change', () => { currentPage = 1; clearDetail(); render(); });
  document.querySelectorAll('input[name="viewMode"]').forEach(el => el.addEventListener('change', () => { currentPage = 1; clearDetail(); render(); }));
  $('#q').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); currentPage = 1; clearDetail(); render(); } });
  $('#searchBtn').addEventListener('click', () => { currentPage = 1; clearDetail(); render(); });
  $('#resetBtn').addEventListener('click', reset);
  $('#csvBtn').addEventListener('click', downloadCsv);
  $('#pageSize').addEventListener('change', () => { pageSize = Number($('#pageSize').value) || 10; currentPage = 1; render(); });
  $('#pager').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if(!b || b.disabled) return;
    currentPage = Number(b.dataset.page) || 1;
    render();
    $('.results-panel').scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape') document.querySelectorAll('.drawer-modal.open').forEach(closeModal);
  });
}

async function init(){
  try{
    await loadData();
    populateControls();
    setupSources();
    setupModules();
    setupHelp();
    setupEvents();
    render();
  }catch(err){
    console.error(err);
    $('#rows').innerHTML = `<tr><td colspan="6"><div class="load-error">法規資料載入失敗：${esc(err.message || err)}</div></td></tr>`;
  }
}

init();
})();
