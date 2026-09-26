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

test('industry selector has 12 choices and qualification search requires industry',()=>{
 assert.equal(data.industries.industryChoices.length,12);
 assert(engine.queryQualifications(data,{industry:'肉類'}).error);
 assert(engine.queryQualifications(data,{major:'食品科學系'}).error);
 assert(engine.queryQualifications(data,{}).error);
});

test('instant-meal and other-food selections expand configured scenarios',()=>{
 let rows=query({industry:'即食餐食業'});let ids=new Set(rows.map(r=>r.industry.id));
 assert(ids.has('ready-meal'));assert(ids.has('kitchen'));assert(ids.has('meal'));
 rows=query({industry:'其他食品製造業'});ids=new Set(rows.map(r=>r.industry.id));
 assert(ids.has('general'));assert(ids.has('oil'));assert(ids.has('egg'));assert(!ids.has('thermal'));
 assert(rows.filter(r=>r.industry.id==='general').every(r=>!r.scenario.haccp));
 assert(rows.filter(r=>['oil','egg'].includes(r.industry.id)).every(r=>r.scenario.haccp));
});

test('low-acid and acidified HACCP stays under canned food',()=>{
 const rows=query({industry:'罐頭食品製造業'});
 assert(rows.some(r=>r.scenario.haccp&&/低酸性|酸化/.test(r.scenario.condition)));
});

test('article 4 degree and exam routes group into one list row',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const required=groups.filter(g=>g.scenario.haccp&&g.type.name==='專科以上／考試資格');
 assert.equal(required.length,1);
 assert.deepEqual(new Set(required[0].options.map(r=>r.route.id)),new Set(['a4-degree','a4-high-exam','a4-ordinary-exam']));
});

test('advanced education and capital filters are strict AND conditions',()=>{
 const rows=query({industry:'其他食品製造業',education:'高職',capital:'under30m'});
 assert(rows.length);
 assert(rows.every(r=>r.education==='高職'&&r.capital==='under30m'));
 assert(rows.some(r=>r.route.id==='a6-vocational'));
 const highCapital=query({industry:'肉類加工食品業',education:'高職',capital:'atLeast30m'});
 assert(highCapital.length);
 assert(highCapital.every(r=>r.education==='高職'&&r.capital==='atLeast30m'));
 assert(!highCapital.some(r=>r.route.id==='a6-vocational'));
});

test('professional certificate filter narrows to the matching exam and HACCP certificate route',()=>{
 const rows=query({industry:'肉類加工食品業',education:'高職',license:'food-technologist',capital:'atLeast30m'});
 assert(rows.length);
 assert(rows.every(r=>r.education==='高職'&&r.capital==='atLeast30m'&&r.route.id==='a4-high-exam'));
 const required=rows.filter(r=>r.scenario.haccp);
 assert(required.length);assert(required.every(r=>r.supplement?.id==='haccp30'));
 const nonRequired=rows.filter(r=>!r.scenario.haccp);assert(nonRequired.length);
});

test('chinese cook certificate filter only returns article 5 when the industry supports it',()=>{
 assert.equal(query({industry:'食品添加物製造業',license:'chinese-cook-b'}).length,0);
 const rows=query({industry:'即食餐食業（中央廚房食品工廠）',education:'高職',license:'chinese-cook-b',capital:'atLeast30m'});
 assert(rows.length);
 assert(rows.every(r=>r.route.id==='a5-cook'&&!r.scenario.haccp&&r.education==='高職'&&r.capital==='atLeast30m'));
});

test('HACCP results never use article 6 and capital-neutral rows remain merged without a capital filter',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const haccp=groups.filter(g=>g.scenario.haccp);assert(haccp.length);
 assert(haccp.every(g=>g.capitalLabel==='不限'));
 assert(haccp.every(g=>g.options.every(r=>r.route.id!=='a6-vocational')));
 assert(groups.some(g=>!g.scenario.haccp&&g.type.name==='高職'&&g.capitalLabel==='未達3,000萬'));
});

test('group documents show article 4 and article 7 alternatives without route selectors',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const group=groups.find(g=>g.scenario.haccp&&g.type.id==='article4');assert(group);
 const docs=engine.requiredDocumentsForGroup(data,group);
 assert.deepEqual(docs.map(x=>x.id),['application','card','qualifications','identity','employment','factory']);
 const qualification=docs.find(x=>x.id==='qualifications');assert.equal(qualification.sections.length,2);
 const a4=qualification.sections.find(x=>x.label.includes('第4條'));assert.equal(a4.alternatives.length,3);
 const a7=qualification.sections.find(x=>x.label.includes('第7條'));assert.equal(a7.alternatives.length,2);
 assert(a7.alternatives.some(x=>x.items.some(i=>i.includes('30小時'))));
});

test('vocational qualification lists majors in conditions but not in the document name',()=>{
 const groups=engine.groupQualifications(data,query({industry:'其他食品製造業',education:'高職',capital:'under30m'}));
 const group=groups.find(g=>g.type.id==='vocational'&&!g.scenario.haccp);assert(group);
 const docs=engine.requiredDocumentsForGroup(data,group);
 const proofs=docs.find(x=>x.id==='qualifications').items;
 assert(proofs.includes('高職指定科別畢業證書'));
 assert(!proofs.some(x=>x.includes('食品科、')));
 assert(proofs.some(x=>x.includes('4年以上')));assert(proofs.some(x=>x.includes('60小時')));
});

test('major-code search behavior remains unchanged',()=>{
 const rows=engine.searchMajors(data,{major:'食品科學系',school:'海洋',className:'食品科學',code:'0721'});assert(rows.length);
 for(const r of rows){assert.equal(r.classCode,'0721');assert.equal(r.status,'符合');}
 const vocational=engine.classify({education:'高職',major:'資訊科'},data.majorPolicy);assert.equal(vocational.status,'不符合');
});
