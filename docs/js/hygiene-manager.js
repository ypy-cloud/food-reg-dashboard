(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.HygieneManager=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/臺/g,'台').replace(/\s+/g,'').trim();
const includes=(value,query)=>normalize(value).includes(normalize(query));
function classify(record,policy){
  let status,reason,article;
  if(record.education==='高職'){
    const match=policy.vocationalMajors.includes(record.major);
    status=match?'符合':'不符合';reason=policy.statusNotes[match?'vocational':'notVocational'];article=match?'第6條':'第6條（未列入）';
  }else{
    const direct=policy.directClassCodes.includes(record.classCode);
    const related=policy.recognizedClassCodes.includes(record.classCode);
    status=direct?'符合':related?'可能符合':'需確認';
    reason=policy.statusNotes[direct?'direct':related?'related':'unknown'];article='第4條第1款';
  }
  return {...record,status,reason,article};
}
function searchMajors(data,query={}){
  return data.majors.records.filter(r=>(!query.major||includes(r.major,query.major))&&
    (!query.school||(!r.statutory&&includes(r.school,query.school)))&&
    (!query.className||includes([r.className,r.detailName].join(' '),query.className))&&
    (!query.code||includes([r.classCode,r.detailCode,r.departmentCode].join(' '),query.code))&&
    (!query.education||r.education===query.education))
    .map(r=>classify(r,data.majorPolicy));
}
function queryQualifications(data,query={}){
  const q=Object.fromEntries(Object.entries(query).map(([k,v])=>[k,String(v??'').trim()]));
  if(!q.industry&&!q.major) return {error:'請至少輸入業別或科系其中一項。',rows:[],majors:[]};
  const majors=q.major?searchMajors(data,{major:q.major,school:q.school,education:q.education}):[];
  const knownEducation=new Set(majors.map(m=>m.education));
  let industries=q.industry?data.industries.industries.filter(i=>[i.name,...i.aliases].some(x=>includes(x,q.industry))):data.industries.industries;
  if(!industries.length) industries=[{...data.industries.unknown,name:q.industry+'（業別待確認）'}];
  const rows=[];
  for(const industry of industries) for(const scenario of industry.scenarios) for(const route of data.qualifications.routes){
    if(!route.haccp.includes(scenario.haccp)) continue;
    if(route.industryTag&&!industry.tags.includes(route.industryTag)) continue;
    if(route.licenseId&&q.license&&route.licenseId!==q.license) continue;
    let relevant=[];
    if(route.kind==='degree'||route.kind==='vocational'){
      const education=route.education[0];
      relevant=majors.filter(m=>m.education===education&&m.status!=='不符合');
      if(q.major&&majors.length&&!relevant.length) continue;
      if(q.major&&knownEducation.size&&!knownEducation.has(education)) continue;
    }
    for(const education of route.education){
      if(q.education&&q.education!==education) continue;
      if(q.major&&!q.education&&knownEducation.size&&!knownEducation.has(education)) continue;
      for(const capital of route.capital){
        if(!scenario.capital.includes(capital)||(q.capital&&capital!==q.capital)) continue;
        const licenses=data.qualifications.licenses;
        const baseLicense=licenses.find(l=>l.id===(route.licenseId||q.license));
        const options=scenario.haccp?data.qualifications.supplements.flatMap(s=>s.licenseRequired?
          licenses.filter(l=>l.article7&&(!q.license||q.license===l.id)).map(license=>({supplement:s,license})):
          [{supplement:s,license:baseLicense?.article7?baseLicense:null}]):[{supplement:null,license:baseLicense||null}];
        for(const {supplement,license} of options){
          const basis=[route.article,supplement?.article].filter(Boolean).join('；');
          const degreePath=route.kind==='degree'||route.kind==='vocational';
          const majorStatus=degreePath&&q.major?(relevant.length?(relevant.every(x=>x.status==='符合')?'符合':relevant.some(x=>x.status==='需確認')?'需確認':'可能符合'):'需確認'):'';
          rows.push({id:[industry.id,scenario.id,route.id,education,capital,supplement?.id||'none',license?.id||'none'].join(':'),industry,scenario,route,education,capital,license,supplement,basis,majorStatus,majors:relevant,query:{...q},haccpLabel:data.qualifications.haccpLabels[scenario.haccp?'required':'notRequired'],capitalLabel:data.qualifications.capitalOptions.find(c=>c.id===capital).name,
            summary:route.summary+(supplement?'；'+supplement.name:''),
            qualificationLabel:route.label+(license&&((route.kind==='exam'&&license.examName)||route.kind==='license')?'／'+license.name:'')});
        }
      }
    }
  }
  return {rows,majors,error:'',unknownIndustry:industries.some(i=>i.id==='unknown')};
}
function requiredDocuments(data,row){
  const names=row.majors.filter(m=>m.education==='高職'&&data.majorPolicy.vocationalMajors.includes(m.major)).map(m=>m.major);
  const majors=[...new Set(names.length?names:data.majorPolicy.vocationalMajors)];
  const proofIds=[...new Set([...row.route.documentIds,...(row.supplement?.documentIds||[])])];
  const proofs=proofIds.map(id=>{
    if(id==='highExam'&&row.license?.examName) return row.license.examName+'（或'+row.license.name+'）';
    return data.documents.proofs[id].replace('{majors}',majors.join('、')).replace('{license}',row.license?.name||'');
  });
  return data.documents.base.map(doc=>({...doc,items:doc.dynamic?proofs:[]}));
}
return {normalize,classify,searchMajors,queryQualifications,requiredDocuments};
});
