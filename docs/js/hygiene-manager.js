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

function industryMatches(industry,query){
  const values=[industry.name,...(industry.aliases||[])].filter(Boolean);
  const nq=normalize(query);
  return values.some(v=>{const nv=normalize(v);return nv.includes(nq)||nq.includes(nv);});
}

function resolveIndustries(data,industryName){
  if(!industryName) return [data.industries.unspecified];
  const choice=data.industries.industryChoices?.find(x=>x.value===industryName);
  if(!choice) return [];
  return choice.profileIds.map(id=>data.industries.industries.find(i=>i.id===id)).filter(Boolean);
}

function queryQualifications(data,query={}){
  const q=Object.fromEntries(Object.entries(query).map(([k,v])=>[k,String(v??'').trim()]));
  if(!q.industry) return {error:'請先選擇業別。',rows:[],majors:[]};
  const majors=[];
  const knownEducation=new Set();
  const industries=resolveIndustries(data,q.industry);
  if(q.industry&&!industries.length) return {error:'請由業別選單選擇應置衛生管理人員的業別。',rows:[],majors};
  const rows=[];

  for(const currentIndustry of industries) for(const scenario of currentIndustry.scenarios) for(const route of data.qualifications.routes){
    if(!route.haccp.includes(scenario.haccp)) continue;
    if(route.industryTag&&!currentIndustry.tags.includes(route.industryTag)) continue;
    if(route.licenseId&&q.license&&route.licenseId!==q.license) continue;

    let relevant=[];
    if(route.kind==='degree'||route.kind==='vocational'){
      const education=route.education[0];
      relevant=majors.filter(m=>m.education===education&&m.status!=='不符合');

    }

    for(const education of route.education){
      if(q.education&&q.education!==education) continue;


      for(const capital of route.capital){
        if(!scenario.capital.includes(capital)||(q.capital&&capital!==q.capital)) continue;
        const licenses=data.qualifications.licenses;
        const baseLicense=licenses.find(l=>l.id===(route.licenseId||q.license))||null;
        const supplements=scenario.haccp
          ? data.qualifications.supplements.filter(s=>!q.license||!s.licenseIds?.length||s.licenseIds.includes(q.license))
          : [null];

        for(const supplement of supplements){
          const basis=[route.article,supplement?.article].filter(Boolean).join('；');
          const degreePath=route.kind==='degree'||route.kind==='vocational';
          const majorStatus='';
          rows.push({
            id:[currentIndustry.id,scenario.id,route.id,education,capital,supplement?.id||'none'].join(':'),
            industry:currentIndustry,scenario,route,education,capital,license:baseLicense,supplement,basis,majorStatus,majors:relevant,query:{...q},
            haccpLabel:data.qualifications.haccpLabels[scenario.haccp?'required':'notRequired'],
            capitalLabel:data.qualifications.capitalOptions.find(c=>c.id===capital).name,
            summary:route.summary+(supplement?'；'+supplement.name:''),
            qualificationLabel:route.label
          });
        }
      }
    }
  }
  return {rows,majors,error:'',unknownIndustry:false};
}

function groupQualifications(data,rows){
  const groups=new Map();
  for(const row of rows){
    const type=data.qualifications.resultGroups.find(g=>g.routeIds.includes(row.route.id));
    const mergeCapital=row.route.kind!=='vocational'&&row.scenario.capital.length>1;
    const id=[row.industry.id,row.scenario.id,mergeCapital?'all-capital':row.capital,type.id].join(':');
    if(!groups.has(id)) groups.set(id,{
      ...row,id,type,
      summary:type.summaries[row.scenario.haccp?'required':'notRequired'],
      basis:type.basis[row.scenario.haccp?'required':'notRequired'],
      options:[],capitalValues:new Set()
    });
    const group=groups.get(id);
    group.capitalValues.add(row.capital);
    const key=r=>[r.route.id,r.supplement?.id].join(':');
    if(!group.options.some(r=>key(r)===key(row))) group.options.push(row);
  }
  return [...groups.values()].map(group=>{
    const values=[...group.capitalValues];
    const capitalLabel=values.length>1?'不限':data.qualifications.capitalOptions.find(c=>c.id===values[0])?.name||group.capitalLabel;
    const {capitalValues,...rest}=group;
    return {...rest,capitalLabel};
  });
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

return {normalize,classify,searchMajors,industryMatches,resolveIndustries,queryQualifications,groupQualifications,requiredDocuments};
});
