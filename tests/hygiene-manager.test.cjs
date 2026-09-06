'use strict';
const fs=require('node:fs');const path=require('node:path');const test=require('node:test');const assert=require('node:assert/strict');
const root=path.join(__dirname,'../docs');const json=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const manifest=json('data/manifest.json');const data=Object.fromEntries(Object.entries(manifest.tools.hygieneManager.files).map(([k,v])=>[k,json(v)]));
const engine=require('../docs/js/hygiene-manager.js');const query=q=>engine.queryQualifications(data,q).rows;
test('all JSON, manifest module names, IDs, current and future separation',()=>{
 for(const file of fs.readdirSync(path.join(root,'data')).filter(f=>f.endsWith('.json'))) json('data/'+file);
 const ids=new Set();
 for(const m of manifest.modules){const d=json(m.file);assert.equal(d.name,m.name);for(const r of d.rules){assert(!ids.has(r.id),`${m.id} duplicate ${r.id}`);ids.add(r.id);assert(Array.isArray(r.areas));}for(const r of (d.current||d.rules.filter(r=>r.status!=='未來實施'))){assert.notEqual(r.status,'未來實施');if(/^\d{4}-/.test(r.start))assert(r.start<='2026-09-06');}}
 const sourceIds=new Set(json(manifest.sources).map(s=>s.id).filter(Boolean));
 for(const d of Object.values(data))for(const id of d.sourceIds||[])assert(sourceIds.has(id),id);
 for(const i of data.industries.industries)for(const id of i.sourceIds)assert(sourceIds.has(id));
 assert.equal(data.majors.classes.length,93);assert(data.majors.records.length>7000);
 assert.equal(new Set(data.majors.records.map(r=>r.id)).size,data.majors.records.length);
});
test('industry OR major required; school and dropdowns alone do not bypass',()=>{
 for(const q of [{},{school:'海洋'},{education:'高職',capital:'under30m'}])assert(engine.queryQualifications(data,q).error);
});
test('meat enumerates all capital and HACCP cases; never independent article7 or invalid vocational HACCP',()=>{
 const rows=query({industry:'肉類'});assert(rows.length>10);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
 assert.deepEqual(new Set(rows.map(r=>r.capital)),new Set(['under30m','atLeast30m']));
 assert.deepEqual(new Set(rows.map(r=>r.scenario.haccp)),new Set([true,false]));
 assert(rows.some(r=>r.route.id==='a6-vocational'));
 for(const r of rows){assert(!r.route.article.startsWith('第7'));if(r.scenario.haccp){assert(r.route.article.startsWith('第4'));assert(r.basis.includes('第7'));assert(r.scenario.condition.includes('50%'));}}
});
test('food science shares MOE classifications and reduces degree paths',()=>{
 const all=query({industry:'肉類'}),rows=query({industry:'肉類',major:'食品科學系'});
 assert(rows.length<all.length);const degree=rows.find(r=>r.route.kind==='degree');assert(degree);assert.equal(degree.education,'專科以上');assert(degree.majors.some(m=>m.classCode==='0721'));
 assert(engine.requiredDocuments(data,degree)[2].items.includes('專科以上符合科系資格畢業證書'));
});
test('specified vocational names and article6 documents',()=>{
 for(const name of data.majorPolicy.vocationalMajors){const rows=query({major:name,education:'高職',capital:'under30m'});const row=rows.find(r=>r.route.id==='a6-vocational');assert(row,name);assert.equal(row.summary,'符合第6條');assert(!row.scenario.haccp);const docs=engine.requiredDocuments(data,row);assert(docs[2].items.some(x=>x.includes(name)));assert(docs[2].items.some(x=>x.includes('4年以上')));assert(docs[2].items.some(x=>x.includes('60小時')));}
 assert(!query({industry:'肉類',education:'高職',capital:'atLeast30m'}).some(r=>r.route.id==='a6-vocational'));
});
test('documents have stable order, named licenses and correct 30/60/120-hour proofs',()=>{
 for(const r of query({industry:'肉類'})){
  const docs=engine.requiredDocuments(data,r);assert.deepEqual(docs.map(x=>x.id),['application','card','qualifications','identity','employment','factory']);
  const proofs=docs[2].items;assert(proofs.every(x=>x&&!x.includes('{')));
  if(r.supplement?.licenseRequired){assert(proofs.includes(r.license.name));assert(proofs.some(x=>x.includes('30小時')));assert(!proofs.some(x=>x.includes('60小時')));}
 }
 const cook=query({industry:'中央廚房',license:'chinese-cook-b'}).find(r=>r.route.id==='a5-cook');assert(cook);const proofs=engine.requiredDocuments(data,cook)[2].items;assert(proofs.includes('中餐烹調乙級技術士證'));assert(proofs.some(x=>x.includes('120小時')));
 for(const r of query({industry:'肉類',license:'food-technologist'}).filter(r=>r.supplement?.licenseRequired))assert.equal(r.license.id,'food-technologist');
});
test('unconditional industries merge article7; scaled industry at 30m cannot choose non-HACCP',()=>{
 for(const industry of ['乳品','餐盒'])assert(query({industry}).every(r=>r.scenario.haccp&&r.route.article.startsWith('第4')));
 assert(query({industry:'食用油脂',capital:'atLeast30m'}).every(r=>r.scenario.haccp));
 assert(query({industry:'熱殺菌',capital:'under30m'}).some(r=>!r.scenario.haccp));
});
test('school, class name and code search combine and preserve status/source/date',()=>{
 const rows=engine.searchMajors(data,{major:'食品科學系',school:'海洋',className:'食品科學',code:'0721'});assert(rows.length);
 for(const r of rows){assert.equal(r.classCode,'0721');assert.equal(r.status,'符合');assert(r.sourceIds.length);assert.equal(r.lastConfirmed,'2026-09-06');}
 assert.equal(engine.searchMajors(data,{school:'不存在的学校'}).length,0);
 const unknown=query({major:'未收錄的食品名稱',school:'未知學校'});assert(unknown.some(r=>r.majorStatus==='需確認'));
 const fake=engine.classify({education:'專科以上',major:'食品科學系',classCode:'0613'},data.majorPolicy);assert.equal(fake.status,'需確認');
 const vocational=engine.classify({education:'高職',major:'資訊科'},data.majorPolicy);assert.equal(vocational.status,'不符合');
});


test('grouped scenarios preserve routes and documents without duplicate education/license rows',()=>{
 const raw=query({industry:'肉類'}),groups=engine.groupQualifications(data,raw);
 assert.equal(groups.length,5);
 const small=engine.groupQualifications(data,query({industry:'肉類',capital:'under30m'}));assert.equal(small.length,3);
 const required=small.find(g=>g.scenario.haccp);
 assert.equal(required.options.length,18);
 assert.deepEqual(new Set(required.options.map(r=>r.route.id)),new Set(['a4-degree','a4-high-exam','a4-ordinary-exam']));
 assert.equal(small.find(g=>g.type.id==='vocational').summary,'符合第6條');
 // Every underlying document combination remains reachable after presentation grouping.
 const signature=r=>JSON.stringify([r.industry.id,r.scenario.id,r.capital,r.route.id,engine.requiredDocuments(data,r)]);
 assert.deepEqual(new Set(groups.flatMap(g=>g.options).map(signature)),new Set(raw.map(signature)));
 for(const g of engine.groupQualifications(data,query({industry:'肉類',education:'高職'})))assert(g.options.every(r=>r.route.kind!=='degree'));
 const cook=engine.groupQualifications(data,query({industry:'中央廚房'})).find(g=>g.type.id==='cook');assert(cook);assert(cook.options.every(r=>!r.scenario.haccp));
});
