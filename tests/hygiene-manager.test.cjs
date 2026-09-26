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

test('industry selector has 12 choices including central kitchen and meal-box variants',()=>{
 assert.deepEqual(data.industries.managerCategories,[
  '乳品製造業','罐頭食品製造業','冷凍食品製造業','即食餐食業',
  '即食餐食業（中央廚房食品工廠）','即食餐食業（餐盒食品工廠）',
  '特殊營養食品製造業','食品添加物製造業','水產食品業','肉類加工食品業','健康食品製造業','其他食品製造業'
 ]);
 assert.equal(data.industries.industryChoices.length,12);
 assert(engine.queryQualifications(data,{industry:'肉類'}).error);
 assert(engine.queryQualifications(data,{major:'食品科學系'}).error);
 assert(engine.queryQualifications(data,{}).error);
});

test('generic instant-meal selection expands ordinary, central-kitchen and meal-box profiles',()=>{
 const rows=query({industry:'即食餐食業'});
 const ids=new Set(rows.map(r=>r.industry.id));
 assert(ids.has('ready-meal'));assert(ids.has('kitchen'));assert(ids.has('meal'));
 const central=query({industry:'即食餐食業（中央廚房食品工廠）'});assert(central.length);assert(central.every(r=>r.industry.id==='kitchen'));
 const meal=query({industry:'即食餐食業（餐盒食品工廠）'});assert(meal.length);assert(meal.every(r=>r.industry.id==='meal'));assert(meal.every(r=>r.scenario.haccp));
});

test('central kitchen article 5 route applies only to non-HACCP scenario',()=>{
 const rows=query({industry:'即食餐食業（中央廚房食品工廠）'});
 assert(rows.some(r=>!r.scenario.haccp&&r.route.id==='a5-cook'));
 assert(!rows.some(r=>r.scenario.haccp&&r.route.id==='a5-cook'));
 for(const r of rows.filter(r=>r.scenario.haccp)){assert(r.route.article.startsWith('第4'));assert(r.basis.includes('第7'));}
});

test('other food selection expands general plus HACCP oil and egg situations only',()=>{
 const rows=query({industry:'其他食品製造業'});const ids=new Set(rows.map(r=>r.industry.id));
 assert(ids.has('general'));assert(ids.has('oil'));assert(ids.has('egg'));assert(!ids.has('thermal'));
 assert(rows.filter(r=>r.industry.id==='general').every(r=>!r.scenario.haccp));
 assert(rows.filter(r=>['oil','egg'].includes(r.industry.id)).every(r=>r.scenario.haccp));
 const thermalProfile=data.industries.industries.find(r=>r.id==='thermal');assert.equal(thermalProfile,undefined);
});

test('low-acid and acidified HACCP conditions remain under canned food',()=>{
 const rows=query({industry:'罐頭食品製造業'});
 assert(rows.some(r=>r.scenario.haccp&&/低酸性|酸化/.test(r.scenario.condition)));
 assert(rows.some(r=>!r.scenario.haccp));
});

test('article 4 degree and exam paths are grouped into one row label',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const required=groups.filter(g=>g.scenario.haccp&&g.type.name==='專科以上／考試資格');
 assert.equal(required.length,1);
 assert.deepEqual(new Set(required[0].options.map(r=>r.route.id)),new Set(['a4-degree','a4-high-exam','a4-ordinary-exam']));
 assert(!groups.some(g=>['專科以上','考試資格','一般資格','相關科系／考試資格'].includes(g.type.name)));
});

test('meat HACCP capital-neutral result stays merged and article 6 is non-HACCP only',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const haccp=groups.filter(g=>g.scenario.haccp);assert(haccp.length);
 assert(haccp.every(g=>g.capitalLabel==='不限'));
 assert(haccp.every(g=>g.options.every(r=>r.route.id!=='a6-vocational')));
 assert(groups.some(g=>!g.scenario.haccp&&g.type.name==='高職'&&g.capitalLabel==='未達3,000萬'));
});

test('article 7 certificates appear together and files remain explicit',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const g=groups.find(x=>x.scenario.haccp&&x.type.name==='專科以上／考試資格');assert(g);
 const thirty=g.options.find(r=>r.route.id==='a4-degree'&&r.supplement?.id==='haccp30');assert(thirty);
 const docs=engine.requiredDocuments(data,thirty);
 assert.deepEqual(docs.map(x=>x.id),['application','card','qualifications','identity','employment','factory']);
 const proofs=docs[2].items;
 assert(proofs.includes('專科以上符合科系資格畢業證書'));
 assert(proofs.some(x=>['食品技師','畜牧技師','獸醫師','水產養殖技師','營養師'].every(n=>x.includes(n))));
 assert(proofs.some(x=>x.includes('30小時')));
});

test('article 6 vocational path remains available only under 30m and non-HACCP',()=>{
 const rows=query({industry:'其他食品製造業',education:'高職',capital:'under30m'});
 const row=rows.find(r=>r.route.id==='a6-vocational');assert(row);
 const docs=engine.requiredDocuments(data,row);assert(docs[2].items.some(x=>x.includes('高職指定科別畢業證書')));assert(docs[2].items.some(x=>x.includes('4年以上')));assert(docs[2].items.some(x=>x.includes('60小時')));
 assert(!query({industry:'肉類加工食品業',education:'高職',capital:'atLeast30m'}).some(r=>r.route.id==='a6-vocational'));
});

test('major-code search behavior is unchanged',()=>{
 const rows=engine.searchMajors(data,{major:'食品科學系',school:'海洋',className:'食品科學',code:'0721'});assert(rows.length);
 for(const r of rows){assert.equal(r.classCode,'0721');assert.equal(r.status,'符合');assert(r.sourceIds.length);assert.equal(r.lastConfirmed,'2026-09-06');}
 assert.equal(engine.searchMajors(data,{school:'不存在的学校'}).length,0);
 const fake=engine.classify({education:'專科以上',major:'食品科學系',classCode:'0613'},data.majorPolicy);assert.equal(fake.status,'需確認');
 const vocational=engine.classify({education:'高職',major:'資訊科'},data.majorPolicy);assert.equal(vocational.status,'不符合');
});
