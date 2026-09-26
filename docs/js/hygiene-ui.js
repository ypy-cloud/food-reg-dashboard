(() => {
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const engine=window.HygieneManager;
const state={data:null,sources:[],rows:[],majors:[],page:1,majorPage:1,selected:'',size:20};

function sourcesHtml(ids){
  return [...new Set(ids)].map(id=>state.sources.find(s=>s.id===id)).filter(Boolean).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join('<br>');
}
function openSection(hygiene){
  $('#regulationsSection').hidden=hygiene;
  $('#hygieneSection').hidden=!hygiene;
  for(const [id,on] of [['hygieneNav',hygiene],['regulationsNav',!hygiene]]){
    $('#'+id).classList.toggle('on',on);$('#'+id).setAttribute('aria-pressed',String(on));
  }
}
function switchTab(major,focus=false){
  $('#qualificationPanel').hidden=major;$('#majorPanel').hidden=!major;
  for(const [id,on] of [['majorTab',major],['qualificationTab',!major]]){
    const el=$('#'+id);el.classList.toggle('on',on);el.setAttribute('aria-selected',String(on));el.tabIndex=on?0:-1;
    if(on&&focus) el.focus();
  }
}
function paginate(rows,page,target){
  const pages=Math.max(1,Math.ceil(rows.length/state.size));
  const start=(page-1)*state.size;
  $('#'+target+'PageInfo').textContent=rows.length?`${start+1}–${Math.min(start+state.size,rows.length)} / ${rows.length} 筆`:'0 筆';
  $('#'+target+'Pager').innerHTML=`<button class="page-btn" type="button" data-step="-1" ${page===1?'disabled':''} aria-label="上一頁">‹</button><span class="tool-note">${page} / ${pages}</span><button class="page-btn" type="button" data-step="1" ${page===pages?'disabled':''} aria-label="下一頁">›</button>`;
  return rows.slice(start,start+state.size);
}
function cell(label,html){return `<td data-label="${esc(label)}"><div>${html}</div></td>`;}
function industryHtml(r){
  const primary=r.industry.managerCategory||r.industry.name;
  const secondary=r.industry.name!==primary?r.industry.name:'';
  return `<strong>${esc(primary)}</strong>${secondary?`<br><span class="tool-note">${esc(secondary)}</span>`:''}`;
}
function renderQualifications(){
  $('#hmCount').textContent=`（共 ${state.rows.length} 筆情境）`;
  $('#hmRows').innerHTML=paginate(state.rows,state.page,'hm').map(r=>`<tr class="${r.id===state.selected?'selected':''}">`+
    cell('業別',industryHtml(r))+
    cell('學歷／資格',`<strong>${esc(r.type.name)}</strong>${r.majorStatus?`<br><span class="status active">科系：${esc(r.majorStatus)}</span>`:''}`)+
    cell('資本額條件',esc(r.capitalLabel))+
    cell('HACCP 情境',`<strong>${esc(r.haccpLabel)}</strong>`)+
    cell('法源',esc(r.basis))+
    cell('操作',`<button type="button" class="btn document-btn" data-result="${esc(r.id)}">應備文件</button>`)+
    '</tr>').join('')||'<tr><td class="empty-cell" colspan="6">沒有符合條件的情境</td></tr>';
}
function clearDetail(){state.selected='';$('#hmDetail').className='detail-empty';$('#hmDetail').textContent='請點選任一結果的「應備文件」。';}
function qualificationsQuery(){
  return {
    industry:$('#hmIndustry').value,
    qualificationType:$('#hmQualification').value,
    license:$('#hmLicense').value,
    capital:$('#hmCapital').value
  };
}
function renderActiveConditions(){
  const q=qualificationsQuery();
  const labels={industry:'業別',qualificationType:'學歷／資格',license:'證照',capital:'資本額'};
  const values={...q};
  if(q.qualificationType) values.qualificationType=state.data.qualifications.qualificationOptions.find(x=>x.id===q.qualificationType)?.name||q.qualificationType;
  if(q.license) values.license=state.data.qualifications.licenses.find(x=>x.id===q.license)?.name||q.license;
  if(q.capital) values.capital=state.data.qualifications.capitalOptions.find(x=>x.id===q.capital)?.name||q.capital;
  const entries=Object.entries(values).filter(([,v])=>v);
  const box=$('#hmActiveConditions');
  box.hidden=!entries.length;
  box.innerHTML=entries.length?`<strong>目前查詢條件</strong><div class="active-query-chips">${entries.map(([k,v])=>`<button type="button" class="query-chip" data-clear="${k}" title="移除${esc(labels[k])}條件">${esc(labels[k])}：${esc(v)} ×</button>`).join('')}</div><button type="button" class="text-link clear-all-query" data-clear-all>清除全部</button>`:'';
}
function buildIndustryOptions(){
  $('#hmIndustry').insertAdjacentHTML('beforeend',state.data.industries.managerCategories.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''));
}
function selectedQualification(group,choice={}){
  const unique=(items,key)=>[...new Map(items.map(item=>[key(item),item])).values()];
  const routes=unique(group.options,r=>r.route.id);
  const routeId=choice.route||routes[0]?.route.id;
  const routeOptions=group.options.filter(r=>r.route.id===routeId);
  const supplements=unique(routeOptions.filter(r=>r.supplement),r=>r.supplement.id);
  const supplementId=choice.supplement||supplements[0]?.supplement.id;
  const row=routeOptions.find(r=>!r.supplement||r.supplement.id===supplementId)||routeOptions[0]||group.options[0]||group;
  return {routes,routeId,routeOptions,supplements,supplementId,row};
}
function qualificationControlsHtml(group,selection,data){
  const {routes,routeId,supplements,supplementId,row}=selection;
  if(group.type.id==='article4'){
    const routeChoices=`<fieldset class="qualification-options"><legend>第4條資格路徑（擇一）</legend>${routes.map(r=>`<label class="qualification-choice"><input type="radio" name="detailRoute" value="${esc(r.route.id)}" ${r.route.id===routeId?'checked':''}><span>${esc(r.route.label)}</span></label>`).join('')}</fieldset>`;
    const supplementChoices=supplements.length?`<fieldset class="qualification-options"><legend>第7條附加資格（擇一）</legend>${supplements.map(r=>`<label class="qualification-choice"><input type="radio" name="detailSupplement" value="${esc(r.supplement.id)}" ${r.supplement.id===supplementId?'checked':''}><span>${esc(r.supplement.name)}</span></label>`).join('')}</fieldset>`:'';
    const conditions=[...row.route.conditions];
    if(row.supplement) conditions.push(data.qualifications.article7Note);
    return routeChoices+supplementChoices+`<details class="selected-conditions"><summary>目前選擇的資格條件</summary><ul>${conditions.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details>`;
  }

  if(row.route.kind==='vocational'){
    const conditions=row.route.conditions.filter(item=>!item.includes('指定科別畢業'));
    const interpretations=data.majorPolicy.vocationalInterpretations||[];
    const interpretationHtml=interpretations.length
      ?`<div class="qualification-group vocational-interpretations">${interpretations.map(item=>`<div class="vocational-interpretation-line"><span class="status active">函釋認定</span><strong>${esc(item.major)}</strong></div><div class="tool-note vocational-interpretation-basis">${esc(item.basis)}</div>`).join('')}</div>`
      :'';
    return `<div class="qualification-group"><strong>第6條原列舉高職科別（15科）</strong><p class="vocational-major-list">${esc(data.majorPolicy.vocationalMajors.join('、'))}</p></div>${interpretationHtml}<div class="qualification-group"><strong>其他資格條件</strong><ul>${conditions.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>`;
  }

  return `<div class="qualification-group"><strong>${esc(row.route.label)}</strong><ul>${row.route.conditions.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>`;
}
function documentsHtml(docList){
  return docList.map(doc=>{
    const items=(doc.items||[]).length?`<ul>${doc.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:'';
    return `<li>${esc(doc.name)}${items}</li>`;
  }).join('');
}
function showDetail(group,choice={},focus=true){
  state.selected=group.id;
  const data=state.data;
  const selection=selectedQualification(group,choice);
  const row=selection.row;
  const docList=engine.requiredDocuments(data,row);

  const primary=row.industry.managerCategory||row.industry.name;
  const specific=row.industry.name!==primary?row.industry.name:'';
  const industrySituation=specific?`${primary}／${specific}`:primary;
  const situation=`<dl class="detail-situation">
    <div><dt>業別／情境</dt><dd>${esc(industrySituation)}</dd></div>
    <div><dt>學歷／資格</dt><dd>${esc(group.type.name)}</dd></div>
    <div><dt>資本額條件</dt><dd>${esc(group.capitalLabel)}</dd></div>
    <div><dt>HACCP 情境</dt><dd>${esc(row.haccpLabel)}</dd></div>
    <div><dt>法源</dt><dd>${esc(group.basis)}</dd></div>
  </dl>`;

  const managerRule=row.industry.managerCondition&&!/^具工廠登記即屬/.test(row.industry.managerCondition)
    ?`<section><h3>衛生管理人員設置條件</h3><p>${esc(row.industry.managerCondition)}</p></section>`:'';
  const haccpRule=row.query.industry&&row.scenario.haccp
    ?`<section><h3>HACCP 判定條件</h3>${specific?`<p><strong>相關情境：</strong>${esc(specific)}</p>`:''}<p>${esc(row.scenario.condition)}</p></section>`:'';
  const qualificationHtml=qualificationControlsHtml(group,selection,data);
  const majorSources=row.route.kind==='vocational'?['hm-vocational-guidance','hm-vocational-interpretation-1090019307','moe-vocational']:[];

  $('#hmDetail').className='hygiene-detail';
  $('#hmDetail').innerHTML=
    `<section><h3>適用情境</h3>${situation}</section>`+
    managerRule+haccpRule+
    `<section><h3>資格條件</h3>${qualificationHtml}</section>`+
    `<section><h3>應備文件</h3><ol class="document-list" aria-live="polite">${documentsHtml(docList)}</ol></section>`+
    `<section><h3>法源依據／官方來源</h3><p>食品製造工廠衛生管理人員設置辦法 ${esc(group.basis)}；第8條。</p>${sourcesHtml([...data.qualifications.sourceIds,...data.industries.sourceIds,...row.industry.sourceIds,...majorSources])}<p class="tool-note">最後確認：${esc(data.qualifications.lastReviewed)}</p></section>`;

  renderQualifications();
  $('#hmDetail').onchange=e=>{
    const target=e.target;
    if(!target.matches('[name="detailRoute"],[name="detailSupplement"]')) return;
    const next={
      route:$('[name="detailRoute"]:checked')?.value||selection.routeId,
      supplement:$('[name="detailSupplement"]:checked')?.value
    };
    showDetail(group,next,false);
    const selector=`[name="${target.name}"][value="${target.value}"]`;
    $(selector)?.focus({preventScroll:true});
  };
  if(focus){
    $('#hmDetailPanel').focus({preventScroll:true});
    if(window.matchMedia('(max-width:1120px)').matches) $('#hmDetailPanel').scrollIntoView({behavior:'smooth',block:'start'});
  }
}
function runQualifications(){
  const result=engine.queryQualifications(state.data,qualificationsQuery());
  state.rows=engine.groupQualifications(state.data,result.rows);state.page=1;clearDetail();renderQualifications();renderActiveConditions();
  $('#hmMessage').textContent=result.error||(!result.rows.length?'未找到適用情境。請核對業別或其他條件。':'已依目前條件列出可能情境；點「應備文件」查看資格細節與文件。');
}

function majorLevelText(levels){
  return (levels||[]).map(level=>String(level).replace(/^[0-9A-Z]+\s*/,'').trim()).filter(Boolean).join('、');
}
function compactMajorSources(){
  const links=[
    ['moe-students','教育部校系'],
    ['moe-bcode','教育部學類'],
    ['hm-major-guidance','TFDA']
  ].map(([id,label])=>{
    const source=state.sources.find(s=>s.id===id);
    return source?`<a href="${esc(source.url)}" target="_blank" rel="noopener">${label}</a>`:'';
  }).filter(Boolean);
  return links.join('｜');
}
function tfdaClassHtml(r){
  const classLabel=[r.tfdaCode||r.classCode,r.className].filter(Boolean).join(' ');
  if(r.tfdaMajorMatched){
    return `<span class="status verified">TFDA資料有列舉</span><strong class="tfda-major-name">${esc(r.tfdaMajorName)}</strong><span class="tool-note">${esc(classLabel)}</span>`;
  }
  if(r.tfdaListed){
    return `<span class="status review">需核對實際科系</span><strong class="tfda-major-name review-text">未找到完全相同科系名稱</strong><span class="tool-note">${esc(classLabel)}</span>`;
  }
  return `<span class="status unconfirmed">請核對實際科系</span><span class="tool-note">${esc(r.reason)}</span>`;
}
function renderMajors(){
  $('#mcCount').textContent=`（共 ${state.majors.length} 筆）`;
  $('#mcRows').innerHTML=paginate(state.majors,state.majorPage,'mc').map(r=>'<tr>'+
    cell('學校',esc(r.school))+
    cell('科系名稱',`<strong>${esc(r.major)}</strong><br><span class="tool-note">${esc(majorLevelText(r.levels))}</span>`)+
    cell('學類名稱',esc(r.className)+(r.detailName?'<br><span class="tool-note">'+esc(r.detailName)+'</span>':''))+
    cell('學類代碼',`${esc(r.classCode||'—')}${r.detailCode?'<br>細學類 '+esc(r.detailCode):''}<br><span class="tool-note">科系 ${esc(r.departmentCode||'未收錄代碼')}</span>`)+
    cell('TFDA列舉學類',tfdaClassHtml(r))+
    cell('資料來源',compactMajorSources())+
    cell('最後確認日期',esc(r.lastConfirmed))+'</tr>').join('')||'<tr><td class="empty-cell" colspan="7">查無已收錄的專科以上校系。請核對學校、科系、學歷或學類條件。</td></tr>';
}
function runMajors(){
  state.majors=engine.searchMajors(state.data,{
    major:$('#mcMajor').value,
    school:$('#mcSchool').value,
    level:$('#mcLevel').value,
    className:$('#mcClass').value,
    code:$('#mcCode').value,
    education:'專科以上'
  });
  state.majorPage=1;renderMajors();
  $('#mcMessage').textContent=state.majors.length?'以下僅顯示專科以上校系；TFDA資料有列舉完全對應名稱時以綠色標示，僅學類對應但科系名稱未完全相同時以橘色提示核對。':'查無已收錄的專科以上校系；請核對查詢條件。';
}

async function init({manifest,sources,loadJson}){
  state.sources=sources;
  $('#hygieneNav').addEventListener('click',()=>openSection(true));$('#regulationsNav').addEventListener('click',()=>openSection(false));
  $('#moduleCatalog').addEventListener('click',e=>{if(e.target.closest('[data-module]'))openSection(false);},true);
  $('#majorTab').addEventListener('click',()=>switchTab(true));$('#qualificationTab').addEventListener('click',()=>switchTab(false));
  $('.tool-tabs').addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();switchTab(event.key==='End'||(event.key!=='Home'&&$('#majorPanel').hidden),true);}
  });
  try{
    const config=manifest.tools.hygieneManager;
    state.data=Object.fromEntries(await Promise.all(Object.entries(config.files).map(async([key,url])=>[key,await loadJson(url)])));
    const data=state.data;
    $('#hmScope').textContent=data.qualifications.scopeNote;$('#hmReviewed').textContent=config.lastReviewed;
    $('#mcCoverage').textContent=`資料學年：${data.majors.schoolYear}。本頁僅顯示專科以上校系資料；高職科別不納入此查詢。`;
    for(const value of data.majorPolicy.higherEducationLevels||[]) $('#mcLevel').insertAdjacentHTML('beforeend',`<option value="${esc(value)}">${esc(value)}</option>`);
    buildIndustryOptions();
    for(const value of data.qualifications.qualificationOptions) $('#hmQualification').insertAdjacentHTML('beforeend',`<option value="${esc(value.id)}">${esc(value.name)}</option>`);
    for(const value of data.qualifications.licenses) $('#hmLicense').insertAdjacentHTML('beforeend',`<option value="${esc(value.id)}">${esc(value.name)}</option>`);
    for(const value of data.qualifications.capitalOptions) $('#hmCapital').insertAdjacentHTML('beforeend',`<option value="${esc(value.id)}">${esc(value.name)}</option>`);
    $('#hmSearch').disabled=false;$('#mcSearch').disabled=false;

    $('#qualificationForm').addEventListener('submit',e=>{e.preventDefault();runQualifications();});
    $('#qualificationForm').addEventListener('reset',()=>{setTimeout(()=>{
      state.rows=[];state.page=1;clearDetail();renderQualifications();
      $('#hmMessage').textContent='請選擇業別開始查詢。';
      $('#hmActiveConditions').hidden=true;$('#hmActiveConditions').innerHTML='';
    },0);});
    $('#qualificationForm').addEventListener('input',()=>{
      if(state.rows.length){state.rows=[];state.page=1;clearDetail();renderQualifications();$('#hmActiveConditions').hidden=true;$('#hmMessage').textContent='條件已變更，請重新查詢。';}
    });

    $('#hmActiveConditions').addEventListener('click',e=>{
      const b=e.target.closest('[data-clear],[data-clear-all]');if(!b)return;
      if(b.hasAttribute('data-clear-all')) $('#qualificationForm').reset();
      else{
        const map={industry:'#hmIndustry',qualificationType:'#hmQualification',license:'#hmLicense',capital:'#hmCapital'};
        $(map[b.dataset.clear]).value='';
        if($('#hmIndustry').value) runQualifications(); else $('#qualificationForm').reset();
      }
    });

    $('#majorForm').addEventListener('submit',e=>{e.preventDefault();runMajors();});
    $('#majorForm').addEventListener('reset',()=>{state.majors=[];state.majorPage=1;renderMajors();$('#mcMessage').textContent='請重新輸入條件查詢。';});
    $('#majorForm').addEventListener('input',()=>{if(state.majors.length){state.majors=[];state.majorPage=1;renderMajors();$('#mcMessage').textContent='條件已變更，請重新查詢。';}});

    $('#hmRows').addEventListener('click',e=>{const button=e.target.closest('[data-result]');if(button){const row=state.rows.find(r=>r.id===button.dataset.result);if(row)showDetail(row,{},true);}});
    for(const prefix of ['hm','mc']) $('#'+prefix+'Pager').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(!b||b.disabled)return;state[prefix==='hm'?'page':'majorPage']+=Number(b.dataset.step);(prefix==='hm'?renderQualifications:renderMajors)();});
  }catch(error){
    $('#hmLoadError').hidden=false;$('#hmLoadError').textContent='衛生管理人員資料載入失敗：'+error.message;console.error(error);
  }
}
window.HygieneManagerUI={init};
})();