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
function renderQualifications(){
  $('#hmCount').textContent=`（共 ${state.rows.length} 筆情境）`;
  $('#hmRows').innerHTML=paginate(state.rows,state.page,'hm').map(r=>`<tr class="${r.id===state.selected?'selected':''}">`+
    cell('業別',esc(r.industry.name))+
    cell('資格類型',`<strong>${esc(r.type.name)}</strong>${r.majorStatus?`<br><span class="status active">科系：${esc(r.majorStatus)}</span>`:''}`)+
    cell('資本額條件',esc(r.capitalLabel))+
    cell('HACCP 情境',`<strong>${esc(r.haccpLabel)}</strong>`)+
    cell('主要資格條件摘要',esc(r.summary))+
    cell('法源',esc(r.basis))+
    cell('操作',`<button type="button" class="btn document-btn" data-result="${esc(r.id)}">應備文件</button>`)+ '</tr>').join('')||'<tr><td class="empty-cell" colspan="7">沒有符合條件的情境</td></tr>';
}
function clearDetail(){state.selected='';$('#hmDetail').className='detail-empty';$('#hmDetail').textContent='請點選任一結果的「應備文件」。';}
function showDetail(group,choice={},focus=true){
  state.selected=group.id;
  const unique=(items,key)=>[...new Map(items.map(item=>[key(item),item])).values()];
  const routes=unique(group.options,r=>r.route.id);
  const routeId=choice.route||routes[0].route.id;
  const routeOptions=group.options.filter(r=>r.route.id===routeId);
  const supplements=unique(routeOptions.filter(r=>r.supplement),r=>r.supplement.id);
  const supplementId=choice.supplement||supplements[0]?.supplement.id;
  const options=routeOptions.filter(r=>!r.supplement||r.supplement.id===supplementId);
  const row=options.find(r=>r.license?.id===choice.license)||options[0];
  const data=state.data;
  const vocationalNames=[...new Set(row.majors.map(m=>m.major).filter(m=>data.majorPolicy.vocationalMajors.includes(m)))];
  const vocationalOptions=vocationalNames.length?vocationalNames:data.majorPolicy.vocationalMajors;
  const vocational=choice.vocational||(vocationalNames.length===1?vocationalNames[0]:'');
  const documentRow=vocational?{...row,majors:[{education:'高職',major:vocational}]}:row;
  const docList=engine.requiredDocuments(data,documentRow);
  const selectors=`<fieldset class="qualification-options"><legend>符合下列任一資格</legend>${routes.map(r=>`<label class="qualification-choice"><input type="radio" name="detailRoute" value="${esc(r.route.id)}" ${r.route.id===row.route.id?'checked':''}><span>${r.route.kind==='degree'?esc(r.education)+' ':''}${esc(r.route.label)}</span></label>`).join('')}</fieldset>`+
    (supplements.length?`<fieldset class="qualification-options"><legend>HACCP 附加資格（擇一）</legend>${supplements.map(r=>`<label class="qualification-choice"><input type="radio" name="detailSupplement" value="${esc(r.supplement.id)}" ${r.supplement.id===row.supplement.id?'checked':''}><span>${esc(r.supplement.name)}</span></label>`).join('')}</fieldset>`:'')+
    (row.supplement?.licenseRequired?`<label class="field detail-select"><span>證照名稱</span><select id="detailLicense">${options.map(r=>`<option value="${esc(r.license.id)}" ${r.license.id===row.license.id?'selected':''}>${esc(r.license.name)}</option>`).join('')}</select></label>`:'')+
    (row.route.kind==='vocational'?`<label class="field detail-select"><span>高職指定科別</span><select id="detailVocational"><option value="">請選擇指定科別</option>${vocationalOptions.map(name=>`<option ${name===vocational?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`:'');
  const majorSources=row.majors.flatMap(m=>m.sourceIds);
  const conditions=[...row.route.conditions];
  if(row.supplement){conditions.push(row.supplement.name+(row.supplement.licenseRequired?'：'+row.license.name:''));conditions.push(data.qualifications.article7Note);}
  if(row.route.kind==='exam'||row.route.kind==='license') conditions.push(data.qualifications.educationNote);
  const majorNote=row.query.major?`<p>輸入科系：${esc(row.query.major)}${row.query.school?'／'+esc(row.query.school):''}。${row.majorStatus?'科系判讀：'+esc(row.majorStatus)+'。':'此為考試／證照路徑，科系輸入不能代替考試或證照證明。'}</p>`:'';
  const matches=row.majors.slice(0,6).map(m=>`<li>${esc(m.school)}／${esc(m.major)}：${esc(m.classCode||m.departmentCode||'法定科別')} ${esc(m.className)}（${esc(m.status)}）</li>`).join('');
  const missing=row.query.major&&!row.majors.length&&(row.route.kind==='degree'||row.route.kind==='vocational')?'<p class="tool-caution">未找到可核對的校系紀錄；以下為待確認的資格路徑與文件，不表示輸入科系已符合。</p>':'';
  $('#hmDetail').className='hygiene-detail';
  $('#hmDetail').innerHTML=`<section><h3>適用情境</h3><p><strong>${esc(row.industry.name)}</strong><br>${esc(group.type.name)}／${esc(row.capitalLabel)}<br>${esc(row.haccpLabel)}</p><p>${esc(row.scenario.condition)}</p>${row.industry.note?`<p class="tool-caution">${esc(row.industry.note)}</p>`:''}${majorNote}${missing}</section>`+
    `<section><h3>資格條件</h3>${selectors}<details class="selected-conditions"><summary>所選路徑的完整資格條件</summary><ul>${conditions.map(c=>`<li>${esc(c)}</li>`).join('')}</ul></details>${matches?`<details><summary>符合搜尋條件的科系紀錄（${row.majors.length} 筆）</summary><ul>${matches}</ul>${row.majors.length>6?'<p>完整紀錄可於學類代碼頁籤查詢。</p>':''}</details>`:''}</section>`+
    `<section><h3>應備文件</h3><ol class="document-list" aria-live="polite">${docList.map(d=>`<li>${esc(d.name)}${d.items.length?`<ul>${d.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</li>`).join('')}</ol></section>`+
    `<section><h3>法源依據／官方來源</h3><p>食品製造工廠衛生管理人員設置辦法 ${esc(row.basis)}；第8條。</p>${sourcesHtml([...data.qualifications.sourceIds,...row.industry.sourceIds,...majorSources,...(row.route.kind==='vocational'?['hm-vocational-guidance','moe-vocational']:[])])}<p class="tool-note">最後確認：${esc(data.qualifications.lastReviewed)}</p></section>`;
  renderQualifications();
  $('#hmDetail').onchange=e=>{
    const target=e.target;
    const next={route:$('[name="detailRoute"]:checked').value,supplement:$('[name="detailSupplement"]:checked')?.value,license:$('#detailLicense')?.value,vocational:$('#detailVocational')?.value};
    const selector=target.id?'#'+target.id:`[name="${target.name}"][value="${target.value}"]`;
    showDetail(group,next,false);$(selector)?.focus({preventScroll:true});
  };
  if(focus){$('#hmDetailPanel').focus({preventScroll:true});
    if(window.matchMedia('(max-width:1120px)').matches) $('#hmDetailPanel').scrollIntoView({behavior:'smooth',block:'start'});}
}
function qualificationsQuery(){return {industry:$('#hmIndustry').value,major:$('#hmMajor').value,school:$('#hmSchool').value,education:$('#hmEducation').value,license:$('#hmLicense').value,capital:$('#hmCapital').value};}
function runQualifications(){
  const result=engine.queryQualifications(state.data,qualificationsQuery());state.rows=engine.groupQualifications(state.data,result.rows);state.page=1;clearDetail();renderQualifications();
  $('#hmMessage').textContent=result.error||(!result.rows.length?'未找到適用情境。請核對學歷、科系、證照或資本額條件。':result.unknownIndustry?'業別尚待確認；請逐筆核對適用範圍後再選擇情境。':'請點「應備文件」核對產品及人數門檻，再於詳細內容選擇個人資格與訓練方式；文件隨選擇更新。');
}
function renderMajors(){
  $('#mcCount').textContent=`（共 ${state.majors.length} 筆）`;
  $('#mcRows').innerHTML=paginate(state.majors,state.majorPage,'mc').map(r=>'<tr>'+
    cell('學校',esc(r.school))+
    cell('科系名稱',`<strong>${esc(r.major)}</strong><br><span class="tool-note">${esc(r.education)}／${esc(r.levels.join('、'))}</span>`)+
    cell('學類名稱',esc(r.className)+(r.detailName?'<br><span class="tool-note">'+esc(r.detailName)+'</span>':''))+
    cell('學類代碼',`${esc(r.classCode||'—')}${r.detailCode?'<br>細學類 '+esc(r.detailCode):''}<br><span class="tool-note">科系 ${esc(r.departmentCode||'未收錄代碼')}</span>`)+
    cell('相關科系判讀',`<span class="status ${r.status==='符合'?'active':'future'}">${esc(r.status)}</span><p class="tool-note">${esc(r.reason)}</p>`)+
    cell('對應資格條文',esc(r.article))+
    cell('資料來源',sourcesHtml([...r.sourceIds,r.education==='高職'?'hm-law':'hm-major-guidance']))+
    cell('最後確認日期',esc(r.lastConfirmed))+'</tr>').join('')||'<tr><td class="empty-cell" colspan="8">需確認：快照中沒有符合條件的紀錄，不代表科系不符合資格。請由官方來源確認畢業年度及相關分類。</td></tr>';
}
function runMajors(){
  state.majors=engine.searchMajors(state.data,{major:$('#mcMajor').value,school:$('#mcSchool').value,className:$('#mcClass').value,code:$('#mcCode').value});state.majorPage=1;renderMajors();
  $('#mcMessage').textContent=state.majors.length?'以下為已收錄紀錄。分類碼為判讀依據；「可能符合／需確認」請核對實際學籍與相關細學類。':'查無紀錄時須確認，不能直接認定不符合。';
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
    $('#mcCoverage').textContent=`資料學年：${data.majors.schoolYear}。${data.majors.coverage}`;
    for(const value of data.qualifications.educationOptions) $('#hmEducation').insertAdjacentHTML('beforeend',`<option value="${esc(value)}">${esc(value)}</option>`);
    for(const value of data.qualifications.licenses) $('#hmLicense').insertAdjacentHTML('beforeend',`<option value="${esc(value.id)}">${esc(value.name)}</option>`);
    for(const value of data.qualifications.capitalOptions) $('#hmCapital').insertAdjacentHTML('beforeend',`<option value="${esc(value.id)}">${esc(value.name)}</option>`);
    $('#hmSearch').disabled=false;$('#mcSearch').disabled=false;
    $('#qualificationForm').addEventListener('submit',e=>{e.preventDefault();runQualifications();});
    $('#qualificationForm').addEventListener('reset',()=>{state.rows=[];state.page=1;clearDetail();renderQualifications();$('#hmMessage').textContent='請輸入業別或科系開始查詢。';});
    $('#qualificationForm').addEventListener('input',()=>{if(state.rows.length){state.rows=[];state.page=1;clearDetail();renderQualifications();$('#hmMessage').textContent='條件已變更，請重新查詢。';}});
    $('#majorForm').addEventListener('submit',e=>{e.preventDefault();runMajors();});
    $('#majorForm').addEventListener('reset',()=>{state.majors=[];state.majorPage=1;renderMajors();$('#mcMessage').textContent='請重新輸入條件查詢。';});
    $('#majorForm').addEventListener('input',()=>{if(state.majors.length){state.majors=[];state.majorPage=1;renderMajors();$('#mcMessage').textContent='條件已變更，請重新查詢。';}});
    $('#majorShortcut').addEventListener('click',()=>{$('#mcMajor').value=$('#hmMajor').value;$('#mcSchool').value=$('#hmSchool').value;$('#mcClass').value='';$('#mcCode').value='';switchTab(true);runMajors();$('#mcMajor').focus();});
    $('#hmRows').addEventListener('click',e=>{const button=e.target.closest('[data-result]');if(button){const row=state.rows.find(r=>r.id===button.dataset.result);if(row)showDetail(row);}});
    for(const prefix of ['hm','mc']) $('#'+prefix+'Pager').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(!b||b.disabled)return;state[prefix==='hm'?'page':'majorPage']+=Number(b.dataset.step);(prefix==='hm'?renderQualifications:renderMajors)();});
  }catch(error){$('#hmLoadError').hidden=false;$('#hmLoadError').textContent='衛生管理人員資料載入失敗：'+error.message;console.error(error);}
}
window.HygieneManagerUI={init};
})();
