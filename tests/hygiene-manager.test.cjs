'use strict';
const fs=require('node:fs');const path=require('node:path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'../docs');const json=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const manifest=json('data/manifest.json');const data=Object.fromEntries(Object.entries(manifest.tools.hygieneManager.files).map(([k,v])=>[k,json(v)]));
const engine=require('../docs/js/hygiene-manager.js');const query=q=>engine.queryQualifications(data,q).rows;

test('all JSON, manifest module names, IDs, current and future separation',()=>{
 for(const file of fs.readdirSync(path.join(root,'data')).filter(f=>f.endsWith('.json'))) json('data/'+file);
 const ids=new Set();
 for(const m of manifest.modules){const d=json(m.file);assert.equal(d.name,m.name);for(const r of d.rules){assert(!ids.has(r.id),`${m.id} duplicate ${r.id}`);ids.add(r.id);assert(Array.isArray(r.areas));}for(const r of (d.current||d.rules.filter(r=>r.status!=='未來實施'))){assert.notEqual(r.status,'未來實施');if(/^\d{4}-/.test(r.start))assert(r.start<='2026-09-26');}}
 const sourceIds=new Set(json(manifest.sources).map(s=>s.id).filter(Boolean));
 for(const d of Object.values(data))for(const id of d.sourceIds||[])assert(sourceIds.has(id),id);
 for(const i of data.industries.industries)for(const id of i.sourceIds)assert(sourceIds.has(id));
 assert.equal(data.majors.classes.length,93);assert(data.majors.records.length>7000);
 assert.equal(new Set(data.majors.records.map(r=>r.id)).size,data.majors.records.length);
});

test('industry is fixed to the ten announced manager categories; major can be queried alone',()=>{
 assert.deepEqual(data.industries.managerCategories,[
  '乳品製造業','罐頭食品製造業','冷凍食品製造業','即食餐食業','特殊營養食品製造業',
  '食品添加物製造業','水產食品業','肉類加工食品業','健康食品製造業','其他食品製造業'
 ]);
 for(const q of [{},{product:'烘焙'},{school:'海洋'},{education:'高職',capital:'under30m'}])assert(engine.queryQualifications(data,q).error);
 assert(engine.queryQualifications(data,{industry:'肉類'}).error);
 const majorOnly=query({major:'食品科學系'});assert(majorOnly.length);assert(majorOnly.every(r=>r.industry.id==='unspecified'));assert(majorOnly.every(r=>!r.scenario.haccp));
});

test('other food products never become unknown; specific products can trigger a HACCP profile',()=>{
 for(const product of ['烘焙','飲料','菜餚','炊蒸']){
  const rows=query({industry:'其他食品製造業',product});assert(rows.length,product);assert(rows.every(r=>r.industry.id==='general'),product);
 }
 const oil=query({industry:'其他食品製造業',product:'食用油脂'});assert(oil.length);assert(oil.every(r=>r.industry.managerCategory==='其他食品製造業'));assert(oil.some(r=>r.scenario.haccp));
 const meal=query({industry:'即食餐食業',product:'餐盒'});assert(meal.length);assert(meal.every(r=>r.industry.id==='meal'));assert(meal.every(r=>r.scenario.haccp));
 const kitchen=query({industry:'即食餐食業',product:'中央廚房'});assert(kitchen.some(r=>r.route.id==='a5-cook'&&!r.scenario.haccp));
});

test('article 4 presentation uses degree and exam labels, not general qualification',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 assert(groups.some(g=>g.type.name==='專科以上'));assert(groups.some(g=>g.type.name==='考試資格'));
 assert(!groups.some(g=>/一般資格|相關科系／考試資格/.test(g.type.name)));
});

test('meat HACCP capital-neutral results merge; article 6 remains non-HACCP only',()=>{
 const raw=query({industry:'肉類加工食品業'}),groups=engine.groupQualifications(data,raw);
 const haccp=groups.filter(g=>g.scenario.haccp);
 assert(haccp.length);assert(haccp.every(g=>g.capitalLabel==='不限'));
 assert(haccp.every(g=>g.options.every(r=>r.route.article.startsWith('第4'))));
 assert(haccp.every(g=>g.basis.includes('第7')));
 assert(!haccp.some(g=>g.options.some(r=>r.route.id==='a6-vocational')));
 const non=groups.filter(g=>!g.scenario.haccp);
 assert(non.some(g=>g.type.name==='高職'&&g.capitalLabel==='未達3,000萬'));
 assert(groups.every(g=>!('summary' in g)||g.summary));
});

test('food science degree path and documents remain explicit',()=>{
 const rows=query({industry:'肉類加工食品業',major:'食品科學系'});
 const degree=rows.find(r=>r.route.kind==='degree');assert(degree);assert.equal(degree.education,'專科以上');assert(degree.majors.some(m=>m.classCode==='0721'));
 assert(engine.requiredDocuments(data,degree)[2].items.includes('專科以上符合科系資格畢業證書'));
});

test('article 7 certificates are shown together rather than one option per certificate',()=>{
 const rows=query({industry:'肉類加工食品業'}).filter(r=>r.scenario.haccp&&r.route.id==='a4-degree');
 const thirty=rows.find(r=>r.supplement?.id==='haccp30');assert(thirty);
 const proofs=engine.requiredDocuments(data,thirty)[2].items;
 assert(proofs.some(x=>x.includes('食品技師')&&x.includes('畜牧技師')&&x.includes('獸醫師')&&x.includes('水產養殖技師')&&x.includes('營養師')&&x.includes('其中之一')));
 assert(proofs.some(x=>x.includes('30小時')));
 assert.equal(rows.filter(r=>r.supplement?.id==='haccp30').length,2);
});

test('specified vocational names and article 6 documents',()=>{
 for(const name of data.majorPolicy.vocationalMajors){
  const rows=query({major:name,education:'高職',capital:'under30m'});
  const row=rows.find(r=>r.route.id==='a6-vocational');assert(row,name);
  const docs=engine.requiredDocuments(data,row);assert(docs[2].items.some(x=>x.includes(name)));assert(docs[2].items.some(x=>x.includes('4年以上')));assert(docs[2].items.some(x=>x.includes('60小時')));
 }
 assert(!query({industry:'肉類加工食品業',education:'高職',capital:'atLeast30m'}).some(r=>r.route.id==='a6-vocational'));
});

test('documents keep stable base order and article 5 retains its named certificate',()=>{
 const row=query({industry:'肉類加工食品業'}).find(r=>r.route.id==='a4-degree'&&r.supplement?.id==='haccp60');
 const docs=engine.requiredDocuments(data,row);assert.deepEqual(docs.map(x=>x.id),['application','card','qualifications','identity','employment','factory']);
 const cook=query({industry:'即食餐食業',product:'中央廚房',license:'chinese-cook-b'}).find(r=>r.route.id==='a5-cook');assert(cook);
 const proofs=engine.requiredDocuments(data,cook)[2].items;assert(proofs.includes('中餐烹調乙級技術士證'));assert(proofs.some(x=>x.includes('120小時')));
});

test('HACCP appears only for the configured specific industry or product situations',()=>{
 assert(query({industry:'乳品製造業'}).every(r=>r.scenario.haccp));
 assert(query({industry:'冷凍食品製造業'}).every(r=>!r.scenario.haccp));
 assert(query({industry:'特殊營養食品製造業'}).every(r=>!r.scenario.haccp));
 assert(query({industry:'其他食品製造業',product:'食用油脂',capital:'atLeast30m'}).every(r=>r.scenario.haccp));
});

test('major-code search behavior is unchanged',()=>{
 const rows=engine.searchMajors(data,{major:'食品科學系',school:'海洋',className:'食品科學',code:'0721'});assert(rows.length);
 for(const r of rows){assert.equal(r.classCode,'0721');assert.equal(r.status,'符合');assert(r.sourceIds.length);assert.equal(r.lastConfirmed,'2026-09-06');}
 assert.equal(engine.searchMajors(data,{school:'不存在的学校'}).length,0);
 const fake=engine.classify({education:'專科以上',major:'食品科學系',classCode:'0613'},data.majorPolicy);assert.equal(fake.status,'需確認');
 const vocational=engine.classify({education:'高職',major:'資訊科'},data.majorPolicy);assert.equal(vocational.status,'不符合');
});
