(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.HygieneManager=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/臺/g,'台').replace(/\s+/g,'').trim();
const includes=(value,query)=>normalize(value).includes(normalize(query));
const normalizeMajorName=value=>normalize(value).replace(/(學位學程|研究所|學系|科系|系|所)$/,'');
function tfdaMajorMatch(major,policy){
  const key=normalizeMajorName(major);
  if(!key) return '';
  return (policy.tfdaListedMajorNames||[]).find(name=>normalizeMajorName(name)===key)||'';
}

function classify(record,policy){
  let status,reason,article;
  if(record.education==='高職'){
    const match=policy.vocationalMajors.includes(record.major);
    status=match?'符合':'不符合';reason=policy.statusNotes[match?'vocational':'notVocational'];article=match?'第6條':'第6條（未列入）';
  }else{
    const direct=policy.directClassCodes.includes(record.classCode);
    const related=policy.recognizedClassCodes.includes(record.classCode);
    const tfdaMajorName=tfdaMajorMatch(record.major,policy);
    status=direct?'符合':related?'可能符合':'需確認';
    reason=policy.statusNotes[direct?'direct':related?'related':'unknown'];article='第4條第1款';
    return {...record,status,reason,article,tfdaListed:direct||related||!!tfdaMajorName,tfdaDirect:direct,tfdaCode:(direct||related)?record.classCode:'',tfdaMajorName,tfdaMajorMatched:!!tfdaMajorName};
  }
  return {...record,status,reason,article,tfdaListed:false,tfdaDirect:false,tfdaCode:''};
}

function searchMajors(data,query={}){
  return data.majors.records.filter(r=>(!query.major||includes(r.major,query.major))&&
    (!query.school||(!r.statutory&&includes(r.school,query.school)))&&
    (!query.className||includes([r.className,r.detailName].join(' '),query.className))&&
    (!query.code||includes([r.classCode,r.detailCode,r.departmentCode].join(' '),query.code))&&
    (!query.education||r.education===query.education)&&
    (!query.level||(r.levels||[]).some(level=>includes(level,query.level))))
    .map(r=>classify(r,data.majorPolicy));
}

function industryMatches(industry,query){
  const values=[industry.name,...(industry.aliases||[])].filter(Boolean);
  const nq=normalize(query);
  return values.some(v=>{const nv=normalize(v);return nv.includes(nq)||nq.includes(nv);});
}

function resolveIndustries(data,industryName){
  if(!industryName) return [];
  const choice=data.industries.industryChoices?.find(x=>x.value===industryName);
  if(!choice) return [];
  return choice.profileIds.map(id=>data.industries.industries.find(i=>i.id===id)).filter(Boolean);
}

function routeMatchesQualification(route,qualificationType,data){
  if(!qualificationType) return true;
  const group=data.qualifications.resultGroups.find(g=>g.routeIds.includes(route.id));
  return group?.id===qualificationType;
}

function routeMatchesLicense(route,scenario,licenseId,data){
  if(!licenseId) return true;
  const license=data.qualifications.licenses.find(l=>l.id===licenseId);
  if(!license) return false;
  if(licenseId==='chinese-cook-b') return !scenario.haccp&&route.licenseId===licenseId;
  if(license.article7){
    const article4=data.qualifications.resultGroups.find(g=>g.id==='article4');
    return !!article4?.routeIds.includes(route.id);
  }
  return route.licenseId===licenseId;
}

function queryQualifications(data,query={}){
  const q=Object.fromEntries(Object.entries(query).map(([k,v])=>[k,String(v??'').trim()]));
  if(!q.industry) return {error:'請先選擇業別。',rows:[],majors:[]};
  const industries=resolveIndustries(data,q.industry);
  if(!industries.length) return {error:'請由業別選單選擇應置衛生管理人員的業別。',rows:[],majors:[]};
  const rows=[];

  for(const currentIndustry of industries) for(const scenario of currentIndustry.scenarios) for(const route of data.qualifications.routes){
    if(!route.haccp.includes(scenario.haccp)) continue;
    if(route.industryTag&&!currentIndustry.tags.includes(route.industryTag)) continue;
    if(!routeMatchesQualification(route,q.qualificationType,data)) continue;
    if(!routeMatchesLicense(route,scenario,q.license,data)) continue;

    for(const education of route.education){
      for(const capital of route.capital){
        if(!scenario.capital.includes(capital)||(q.capital&&capital!==q.capital)) continue;

        const selectedLicense=data.qualifications.licenses.find(l=>l.id===q.license)||null;
        const supplements=scenario.haccp
          ? data.qualifications.supplements.filter(s=>!q.license||(selectedLicense?.article7&&s.licenseIds?.includes(q.license)))
          : [null];
        if(scenario.haccp&&!supplements.length) continue;

        for(const supplement of supplements){
          const basis=[route.article,supplement?.article].filter(Boolean).join('；');
          rows.push({
            id:[currentIndustry.id,scenario.id,route.id,education,capital,supplement?.id||'none',q.license||'none'].join(':'),
            industry:currentIndustry,scenario,route,education,capital,
            license:selectedLicense,supplement,basis,majorStatus:'',majors:[],query:{...q},
            haccpLabel:data.qualifications.haccpLabels[scenario.haccp?'required':'notRequired'],
            capitalLabel:data.qualifications.capitalOptions.find(c=>c.id===capital).name,
            summary:route.summary+(supplement?'；'+supplement.name:''),
            qualificationLabel:route.label
          });
        }
      }
    }
  }
  return {rows,majors:[],error:'',unknownIndustry:false};
}

function groupQualifications(data,rows){
  const groups=new Map();
  for(const row of rows){
    const type=data.qualifications.resultGroups.find(g=>g.routeIds.includes(row.route.id));
    const mergeCapital=row.route.kind!=='vocational'&&row.scenario.capital.length>1&&!row.query.capital;
    const id=[row.industry.id,row.scenario.id,mergeCapital?'all-capital':row.capital,type.id].join(':');
    if(!groups.has(id)) groups.set(id,{
      ...row,id,type,
      summary:type.summaries[row.scenario.haccp?'required':'notRequired'],
      basis:type.basis[row.scenario.haccp?'required':'notRequired'],
      options:[],capitalValues:new Set()
    });
    const group=groups.get(id);
    group.capitalValues.add(row.capital);
    const key=r=>[r.route.id,r.supplement?.id,r.license?.id||'none'].join(':');
    if(!group.options.some(r=>key(r)===key(row))) group.options.push(row);
  }
  return [...groups.values()].map(group=>{
    const values=[...group.capitalValues];
    const capitalLabel=values.length>1?'不限':data.qualifications.capitalOptions.find(c=>c.id===values[0])?.name||group.capitalLabel;
    const {capitalValues,...rest}=group;
    return {...rest,capitalLabel};
  });
}

function proofItemsForRow(data,row,{includeSupplement=true}={}){
  const ids=[...row.route.documentIds,...(includeSupplement?(row.supplement?.documentIds||[]):[])];
  const routeLicense=data.qualifications.licenses.find(l=>l.id===row.route.licenseId)||null;
  return [...new Set(ids)].map(id=>{
    if(id==='highExam') return data.documents.proofs[id];
    return data.documents.proofs[id].replace('{majors}',data.majorPolicy.vocationalMajors.join('、')).replace('{license}',routeLicense?.name||'');
  }).filter(Boolean);
}

function requiredDocuments(data,row){
  const proofs=proofItemsForRow(data,row);
  return data.documents.base.map(doc=>({...doc,items:doc.dynamic?proofs:[]}));
}

function requiredDocumentsForGroup(data,group){
  if(group.type.id!=='article4') return requiredDocuments(data,group.options[0]||group);

  const routeRows=[...new Map(group.options.map(r=>[r.route.id,r])).values()];
  const routeAlternatives=routeRows.map(row=>({
    label:row.route.label,
    items:proofItemsForRow(data,row,{includeSupplement:false})
  }));
  const supplementRows=[...new Map(group.options.filter(r=>r.supplement).map(r=>[r.supplement.id,r])).values()];
  const supplementAlternatives=supplementRows.map(row=>({
    label:row.supplement.name,
    items:[...new Set((row.supplement.documentIds||[]).map(id=>
      data.documents.proofs[id].replace('{majors}',data.majorPolicy.vocationalMajors.join('、')).replace('{license}',row.license?.name||'')
    ))]
  }));

  return data.documents.base.map(doc=>{
    if(!doc.dynamic) return {...doc,items:[]};
    return {
      ...doc,
      items:[],
      sections:[
        {label:'第4條資格證明（擇一）',alternatives:routeAlternatives},
        ...(supplementAlternatives.length?[{label:'第7條附加資格證明（擇一）',alternatives:supplementAlternatives}]:[])
      ]
    };
  });
}

return {
  normalize,normalizeMajorName,tfdaMajorMatch,classify,searchMajors,industryMatches,resolveIndustries,routeMatchesQualification,routeMatchesLicense,
  queryQualifications,groupQualifications,requiredDocuments,requiredDocumentsForGroup
};
});
