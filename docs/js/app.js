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
let selectedId = null;

const displayArea = r => (r.areas || []).join('／');
const hasArea = (r, area) => !area || (r.areas || []).includes(area);
const attachModule = (name, rows) => rows.map(r => ({...r, module:name}));

async function loadJson(url){
  const sep = url.includes('?') ? '&' : '?';
  const r = await fetch(url + sep + 'v=20260823-refactor1', {cache:'no-store'});
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
  const mode=$('#viewMode').value;
  if(mode==='history') return RULES.filter(r=>r.status!=='未來實施');
  if(mode==='future') return RULES.filter(r=>r.status==='未來實施');
  return CURRENT_RULES;
}

function populateControls(){
  MODULES.forEach(m => $('#module').insertAdjacentHTML('beforeend', `<option value="${esc(m.name)}">${esc(m.name)}</option>`));
  const areas=[...new Set(RULES.flatMap(r=>r.areas || []))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
  areas.forEach(a => $('#area').insertAdjacentHTML('beforeend', `<option value="${esc(a)}">${esc(a)}</option>`));
  $('#quickChips').innerHTML=MODULES.map(m=>`<button class="chip" type="button" data-v="${esc(m.name)}">${esc(m.name)}</button>`).join('');
  document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{
    const on=b.classList.contains('on');
    document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));
    $('#module').value=on?'':b.dataset.v;
    if(!on)b.classList.add('on');
    selectedId=null; render();
  }));
}

function render(){
  const data=activeData();
  const q=$('#q').value.trim().toLowerCase(),m=$('#module').value,a=$('#area').value,s=$('#status').value;
  filtered=data.filter(r=>{
    const hay=[r.module,displayArea(r),r.category,r.scale,r.start,r.note,r.basis].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!m||r.module===m)&&hasArea(r,a)&&(!s||r.status===s);
  });
  $('#count').textContent=`顯示 ${filtered.length} / ${data.length} 筆規則`;
  const mode=$('#viewMode').value;
  $('#modeBadge').textContent=mode==='history'?'● 歷史沿革':mode==='future'?'● 未來實施':'● 現行規定';
  $('#rows').innerHTML=filtered.length ? filtered.map(r=>`<tr data-id="${r.id}" data-module="${esc(r.module)}">
    <td class="module">${esc(r.module)}</td><td>${esc(displayArea(r))}</td><td>${esc(r.category)}</td>
    <td>${esc(r.scale)}</td><td>${esc(r.start)}</td>
    <td><span class="status ${r.status==='未來實施'?'future':'active'}">${esc(r.status)}</span></td></tr>`).join('') : '<tr><td colspan="6" style="padding:32px;text-align:center;color:#667269">沒有符合條件的規則</td></tr>';
  document.querySelectorAll('#rows tr[data-id]').forEach(tr=>tr.addEventListener('click',()=>showDetail(Number(tr.dataset.id),tr.dataset.module)));
}

function showDetail(id,module){
  const r=activeData().find(x=>x.id===id && x.module===module); if(!r)return; selectedId=id;
  $('#detailEmpty').hidden=true;$('#detailBox').hidden=false;
  $('#dTitle').textContent=r.category;$('#dModule').textContent=r.module;$('#dArea').textContent=displayArea(r);
  $('#dScale').textContent=r.scale;$('#dStart').textContent=r.start;$('#dBasis').textContent=r.basis;$('#dNote').textContent=r.note || '—';
  const st=$('#dStatus');st.textContent=r.status;st.className='status '+(r.status==='未來實施'?'future':'active');
  const src=$('#dSource');src.textContent=r.sourceName || '官方來源';src.href=r.sourceUrl || '#';
}

function reset(){
  $('#viewMode').value='current';$('#q').value='';$('#module').value='';$('#area').value='';$('#status').value='';
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on')); selectedId=null;
  $('#detailEmpty').hidden=false;$('#detailBox').hidden=true; render();
}

function downloadCsv(){
  const cols=['法規模組','業態','產品／業別','規模／條件','實施日','狀態','法源','備註','官方來源'];
  const lines=[cols,...filtered.map(r=>[r.module,displayArea(r),r.category,r.scale,r.start,r.status,r.basis,r.note,r.sourceUrl])];
  const csv='\ufeff'+lines.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='食品法規查詢結果.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
}

function setupSources(){
  $('#sources').innerHTML=SOURCES.map(s=>`<div class="card source"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a><div class="small" style="margin-top:5px">${esc(s.desc)}</div></div>`).join('');
  const modal=$('#sourceModal'); const open=()=>{modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}; const close=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''};
  $('#sourcesBtn').addEventListener('click',open);$('#sourcesCloseBtn').addEventListener('click',close);modal.querySelectorAll('[data-close-sources]').forEach(el=>el.addEventListener('click',close));
}

function setupModules(){
  const modal=$('#modulesModal'), list=$('#moduleCatalog'); $('#moduleCount').textContent=MODULES.length;
  list.innerHTML=MODULES.map(m=>{const n=CURRENT_RULES.filter(r=>r.module===m.name).length;return `<button type="button" class="module-catalog-item" data-module="${esc(m.name)}"><span class="module-catalog-name">${esc(m.name)}</span><span class="module-catalog-count">${n} 筆現行規則</span></button>`}).join('');
  const open=()=>{modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}; const close=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''};
  $('#modulesBtn').addEventListener('click',open);$('#modulesCloseBtn').addEventListener('click',close);modal.querySelectorAll('[data-close-modules]').forEach(el=>el.addEventListener('click',close));
  list.addEventListener('click',e=>{const item=e.target.closest('[data-module]');if(!item)return;$('#module').value=item.dataset.module;document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x.dataset.v===item.dataset.module));close();$('#querySection').scrollIntoView({behavior:'smooth'});render()});
}

function setupEvents(){
  ['q','module','area','status','viewMode'].forEach(id=>$('#'+id).addEventListener(id==='q'?'input':'change',()=>{
    if(id==='viewMode') $('#status').value='';
    if(id==='module') document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('on',x.dataset.v===$('#module').value));
    selectedId=null; render();
  }));
  $('#resetBtn').addEventListener('click',reset);$('#jumpBtn').addEventListener('click',()=>$('#querySection').scrollIntoView({behavior:'smooth'}));$('#csvBtn').addEventListener('click',downloadCsv);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelectorAll('.source-modal.open,.module-modal.open').forEach(modal=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true')});document.body.style.overflow=''}});
}

async function init(){
  try{
    await loadData(); populateControls(); setupSources(); setupModules(); setupEvents(); render();
  }catch(err){
    console.error(err); $('#rows').innerHTML=`<tr><td colspan="6"><div class="load-error">法規資料載入失敗：${esc(err.message || err)}</div></td></tr>`;
  }
}
init();
})();
