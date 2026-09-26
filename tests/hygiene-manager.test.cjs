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

test('qualification filter uses article4 and vocational choices',()=>{
 assert.deepEqual(data.qualifications.qualificationOptions,[
  {id:'article4',name:'專科以上／考試資格'},
  {id:'vocational',name:'高職'}
 ]);
 assert(engine.queryQualifications(data,{}).error);
});

test('industry scenarios remain integrated',()=>{
 let rows=query({industry:'即食餐食業'});let ids=new Set(rows.map(r=>r.industry.id));
 assert(ids.has('ready-meal'));assert(ids.has('kitchen'));assert(ids.has('meal'));
 rows=query({industry:'其他食品製造業'});ids=new Set(rows.map(r=>r.industry.id));
 assert(ids.has('general'));assert(ids.has('oil'));assert(ids.has('egg'));assert(!ids.has('thermal'));
 const canned=query({industry:'罐頭食品製造業'});
 assert(canned.some(r=>r.scenario.haccp&&/低酸性|酸化/.test(r.scenario.condition)));
});

test('article4 degree route uses the explicit degree label',()=>{
 const route=data.qualifications.routes.find(r=>r.id==='a4-degree');assert(route);
 assert.equal(route.label,'專科以上相關科系畢業');
});

test('article4 routes stay grouped into one list row',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const required=groups.filter(g=>g.scenario.haccp&&g.type.id==='article4');
 assert.equal(required.length,1);
 assert.deepEqual(new Set(required[0].options.map(r=>r.route.id)),new Set(['a4-degree','a4-high-exam','a4-ordinary-exam']));
});

test('qualification type, license and capital are strict AND filters',()=>{
 const vocational=query({industry:'其他食品製造業',qualificationType:'vocational',capital:'under30m'});
 assert(vocational.length);
 assert(vocational.every(r=>r.route.id==='a6-vocational'&&r.capital==='under30m'&&!r.scenario.haccp));

 const article4=query({industry:'肉類加工食品業',qualificationType:'article4',capital:'atLeast30m'});
 assert(article4.length);
 assert(article4.every(r=>['a4-degree','a4-high-exam','a4-ordinary-exam'].includes(r.route.id)&&r.capital==='atLeast30m'));

 const licensed=query({industry:'肉類加工食品業',qualificationType:'article4',license:'food-technologist',capital:'atLeast30m'});
 assert(licensed.length);
 assert(licensed.every(r=>['a4-degree','a4-high-exam','a4-ordinary-exam'].includes(r.route.id)&&r.capital==='atLeast30m'));
 assert.deepEqual(new Set(licensed.filter(r=>r.scenario.haccp).map(r=>r.route.id)),new Set(['a4-degree','a4-high-exam','a4-ordinary-exam']));
 assert(licensed.filter(r=>r.scenario.haccp).every(r=>r.supplement?.id==='haccp30'));

 assert.equal(query({industry:'肉類加工食品業',qualificationType:'vocational',license:'food-technologist',capital:'under30m'}).length,0);
});

test('chinese cook certificate only returns article5 for supported non-HACCP situation',()=>{
 assert.equal(query({industry:'食品添加物製造業',license:'chinese-cook-b'}).length,0);
 const rows=query({industry:'即食餐食業（中央廚房食品工廠）',license:'chinese-cook-b',capital:'atLeast30m'});
 assert(rows.length);
 assert(rows.every(r=>r.route.id==='a5-cook'&&!r.scenario.haccp&&r.capital==='atLeast30m'));
});

test('HACCP never uses article6 and unfiltered capital-neutral rows merge',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const haccp=groups.filter(g=>g.scenario.haccp);assert(haccp.length);
 assert(haccp.every(g=>g.capitalLabel==='不限'));
 assert(haccp.every(g=>g.options.every(r=>r.route.id!=='a6-vocational')));
 assert(groups.some(g=>!g.scenario.haccp&&g.type.id==='vocational'&&g.capitalLabel==='未達3,000萬'));
});

test('professional certificate filter does not rewrite article 4 high-exam proof',()=>{
 const rows=query({industry:'肉類加工食品業',qualificationType:'article4',license:'animal-husbandry',capital:'atLeast30m'});
 const group=engine.groupQualifications(data,rows).find(g=>g.scenario.haccp&&g.type.id==='article4');assert(group);
 const highExam=group.options.find(r=>r.route.id==='a4-high-exam'&&r.supplement?.id==='haccp30');assert(highExam);
 const proofs=engine.requiredDocuments(data,highExam).find(x=>x.id==='qualifications').items;
 assert(proofs.includes(data.documents.proofs.highExam));
 assert(!proofs.some(x=>x.includes('畜牧技師高等考試及格證明')));
 assert(proofs.some(x=>x.includes('食品技師')&&x.includes('營養師')));
 assert(proofs.some(x=>x.includes('30小時')));
});

test('selected article4 and article7 route documents are generated independently',()=>{
 const groups=engine.groupQualifications(data,query({industry:'肉類加工食品業'}));
 const group=groups.find(g=>g.scenario.haccp&&g.type.id==='article4');assert(group);

 const degree60=group.options.find(r=>r.route.id==='a4-degree'&&r.supplement?.id==='haccp60');assert(degree60);
 let docs=engine.requiredDocuments(data,degree60);let proofs=docs.find(x=>x.id==='qualifications').items;
 assert(proofs.includes('專科以上符合科系資格畢業證書'));assert(proofs.some(x=>x.includes('60小時')));assert(!proofs.some(x=>x.includes('30小時')));

 const ordinary30=group.options.find(r=>r.route.id==='a4-ordinary-exam'&&r.supplement?.id==='haccp30');assert(ordinary30);
 docs=engine.requiredDocuments(data,ordinary30);proofs=docs.find(x=>x.id==='qualifications').items;
 assert(proofs.some(x=>x.includes('普通考試')));assert(proofs.some(x=>x.includes('3年以上')));
 assert(proofs.some(x=>x.includes('食品技師')&&x.includes('營養師')));assert(proofs.some(x=>x.includes('30小時')));
 assert(!proofs.includes('專科以上符合科系資格畢業證書'));
});

test('vocational conditions use all named majors but document title stays generic',()=>{
 const groups=engine.groupQualifications(data,query({industry:'其他食品製造業',qualificationType:'vocational',capital:'under30m'}));
 const group=groups.find(g=>g.type.id==='vocational');assert(group);
 const docs=engine.requiredDocuments(data,group.options[0]);
 const proofs=docs.find(x=>x.id==='qualifications').items;
 assert(proofs.includes('高職第6條指定或函釋認定科別畢業證書'));assert(!proofs.some(x=>x.includes('食品科、')));
 assert(proofs.some(x=>x.includes('4年以上')));assert(proofs.some(x=>x.includes('60小時')));
});

test('article5 document resolves its required license without an explicit license filter',()=>{
 const groups=engine.groupQualifications(data,query({industry:'即食餐食業（中央廚房食品工廠）'}));
 const group=groups.find(g=>g.type.id==='cook');assert(group);
 const docs=engine.requiredDocuments(data,group.options[0]);
 const proofs=docs.find(x=>x.id==='qualifications').items;
 assert(proofs.includes('中餐烹調乙級技術士證'));
 assert(proofs.some(x=>x.includes('120小時')));
 assert(proofs.every(x=>x.trim().length>0));
});

test('higher-education major lookup excludes vocational records and filters academic levels',()=>{
 const all=engine.searchMajors(data,{education:'專科以上'});assert(all.length);
 assert(all.every(r=>r.education==='專科以上'));
 assert.deepEqual(data.majorPolicy.higherEducationLevels,['二專','五專','二技','四技','學士','碩士','博士']);
 for(const level of data.majorPolicy.higherEducationLevels){
  const rows=engine.searchMajors(data,{education:'專科以上',level});assert(rows.length,level);
  assert(rows.every(r=>(r.levels||[]).some(v=>v.includes(level))),level);
 }
 const vocational=engine.searchMajors(data,{education:'高職'});assert(vocational.length);
});

test('TFDA listed class metadata is exposed for higher-education results',()=>{
 const rows=engine.searchMajors(data,{education:'專科以上',major:'食品科學系',className:'食品科學',code:'0721'});assert(rows.length);
 for(const r of rows){
  assert.equal(r.classCode,'0721');
  assert.equal(r.tfdaListed,true);
  assert.equal(r.tfdaCode,'0721');
  assert.equal(r.tfdaMajorMatched,true);
  assert.equal(r.tfdaMajorName,'食品科學');
 }
 const vocational=engine.classify({education:'高職',major:'資訊科'},data.majorPolicy);assert.equal(vocational.status,'不符合');
});


test('TFDA listed major name matching distinguishes exact-name evidence from class-only review',()=>{
 const matched=engine.classify({education:'專科以上',major:'食品科技系',classCode:'0721',className:'食品科學學類'},data.majorPolicy);
 assert.equal(matched.tfdaMajorMatched,true);assert.equal(matched.tfdaMajorName,'食品科技');
 const review=engine.classify({education:'專科以上',major:'未列名食品創新系',classCode:'0721',className:'食品科學學類'},data.majorPolicy);
 assert.equal(review.tfdaListed,true);assert.equal(review.tfdaMajorMatched,false);
});


test('TFDA major candidates handle department and program suffixes safely',()=>{
 const cases=[
  ['食品科學系','食品科學'],
  ['食品科技科','食品科技'],
  ['食品暨應用生物科技學系','食品暨應用生物科技'],
  ['食品安全管理碩士在職學位學程','食品安全管理'],
  ['食品營養博士學位學程','食品營養'],
  ['食品科學系碩士在職專班','食品科學'],
  ['食品生技碩士學位學程在職專班','食品生技'],
  ['水產食品科學系碩士在職班','水產食品科學'],
  ['食品科學系_食品產業技優專班','食品科學'],
  ['生物與食品科技系_國際專修部','生物與食品科技'],
  ['營養學系','營養'],
  ['保健營養學系','保健營養']
 ];
 for(const [major,name] of cases){
  assert.equal(engine.tfdaMajorMatch(major,data.majorPolicy),name,major);
 }
});

test('TFDA candidate matching does not use loose substring matching',()=>{
 assert.equal(engine.tfdaMajorMatch('生物科技與食品營養學士學位學程',data.majorPolicy),'');
 assert.equal(engine.tfdaMajorMatch('食品創新管理學系',data.majorPolicy),'');
});


test('all current higher-education TFDA names are checked through the candidate matcher',()=>{
 const rows=engine.searchMajors(data,{education:'專科以上'});
 const matched=rows.filter(r=>r.tfdaMajorMatched);
 assert(matched.length>1000);
 assert(matched.some(r=>r.major==='食品暨應用生物科技學系'&&r.tfdaMajorName==='食品暨應用生物科技'));
 assert(matched.some(r=>r.major==='食品安全管理碩士在職學位學程'&&r.tfdaMajorName==='食品安全管理'));
 assert(matched.some(r=>r.major==='食品科技科'&&r.tfdaMajorName==='食品科技'));
 assert(matched.some(r=>r.major==='食品營養博士學位學程'&&r.tfdaMajorName==='食品營養'));
});


test('餐飲技術科函釋認定與原第6條15科分開保存',()=>{
 assert.equal(data.majorPolicy.vocationalMajors.length,15);
 assert(!data.majorPolicy.vocationalMajors.includes('餐飲技術科'));
 const item=data.majorPolicy.vocationalInterpretations.find(x=>x.major==='餐飲技術科');
 assert(item);
 assert.equal(item.basis,'FDA 食字第1090019307號函');
 const classified=engine.classify({education:'高職',major:'餐飲技術科'},data.majorPolicy);
 assert.equal(classified.status,'符合');
 assert.equal(classified.article,'第6條（函釋認定）');
 assert.equal(classified.vocationalInterpretation?.major,'餐飲技術科');
});

test('第6條函釋科別仍使用完整工作經歷與HACCP文件組合',()=>{
 const groups=engine.groupQualifications(data,query({industry:'其他食品製造業',qualificationType:'vocational',capital:'under30m'}));
 const group=groups.find(g=>g.type.id==='vocational');assert(group);
 const docs=engine.requiredDocuments(data,group.options[0]);
 const proofs=docs.find(x=>x.id==='qualifications').items;
 assert(proofs.includes('高職第6條指定或函釋認定科別畢業證書'));
 assert(proofs.some(x=>x.includes('4年以上')));
 assert(proofs.some(x=>x.includes('60小時')));
});
