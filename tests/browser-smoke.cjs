'use strict';
const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');
(async()=>{
 const root=path.join(__dirname,'../docs');const out=process.env.QA_OUTPUT||path.join(__dirname,'../../.work/qa');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403);return res.end();}let file=p===root?path.join(root,'index.html'):p;if(!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});}catch(error){server.close();throw error;}
 const base=`http://127.0.0.1:${server.address().port}/`;const errors=[];
 try{
  const page=await browser.newPage({viewport:{width:1536,height:1024}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.url()+': '+r.status());});
  await page.goto(base);await page.locator('#hmSearch:not([disabled])').waitFor({state:'attached'});

  assert(await page.locator('#rows tr[data-id]').count()>0);
  const downloadPromise=page.waitForEvent('download');await page.locator('#csvBtn').click();const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.csv'));

  await page.locator('#hygieneNav').click();
  assert.equal(await page.locator('#hmAdvanced').count(),0);
  for(const id of ['hmIndustry','hmQualification','hmLicense','hmCapital'])assert(await page.locator('#'+id).isVisible());
  assert.equal(await page.locator('#hmQualification option').count(),3);

  await page.locator('#hmIndustry').selectOption({label:'肉類加工食品業'});await page.locator('#hmSearch').click();
  const required=page.locator('#hmRows tr').filter({hasText:'專科以上／考試資格'}).filter({hasText:'應實施 HACCP'});
  assert.equal(await required.count(),1);
  await required.getByRole('button',{name:'應備文件',exact:true}).click();
  let detail=await page.locator('#hmDetail').innerText();
  for(const label of ['業別／情境','學歷／資格','資本額條件','HACCP 情境','法源'])assert(detail.includes(label));
  assert.equal(await page.locator('[name="detailRoute"]').count(),3);
  assert((await page.locator('#hmDetail').innerText()).includes('專科以上相關科系畢業'));
  assert.equal(await page.locator('[name="detailSupplement"]').count(),2);
  const selectedConditions=page.locator('#hmDetail details.selected-conditions');
  assert.equal(await selectedConditions.count(),1);assert.equal(await selectedConditions.evaluate(el=>el.open),false);
  let proofs=await page.locator('.document-list').innerText();
  assert(proofs.includes('專科以上符合科系資格畢業證書'));assert(proofs.includes('60小時'));

  await page.locator('[name="detailRoute"][value="a4-ordinary-exam"]').check();
  proofs=await page.locator('.document-list').innerText();
  assert(proofs.includes('普通考試')&&proofs.includes('3年以上'));assert(!proofs.includes('專科以上符合科系資格畢業證書'));

  await page.locator('[name="detailSupplement"][value="haccp30"]').check();
  proofs=await page.locator('.document-list').innerText();
  assert(proofs.includes('30小時')&&!proofs.includes('60小時'));
  for(const name of ['食品技師','畜牧技師','獸醫師','水產養殖技師','營養師'])assert(proofs.includes(name));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'其他食品製造業'});
  await page.locator('#hmQualification').selectOption('vocational');
  await page.locator('#hmCapital').selectOption('under30m');
  await page.locator('#hmSearch').click();
  const highText=await page.locator('#hmRows').innerText();
  assert(highText.includes('高職'));assert(!highText.includes('專科以上／考試資格'));
  const vocationalRow=page.locator('#hmRows tr').filter({hasText:'高職'}).first();
  await vocationalRow.getByRole('button',{name:'應備文件',exact:true}).click();
  detail=await page.locator('#hmDetail').innerText();
  assert.equal(await page.locator('#detailVocational').count(),0);
  assert(detail.includes('第6條指定高職科別')&&detail.includes('食品加工科')&&detail.includes('餐飲管理科'));
  proofs=await page.locator('.document-list').innerText();assert(proofs.includes('高職指定科別畢業證書'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'肉類加工食品業'});
  await page.locator('#hmQualification').selectOption('article4');
  await page.locator('#hmLicense').selectOption('food-technologist');
  await page.locator('#hmCapital').selectOption('atLeast30m');
  await page.locator('#hmSearch').click();
  const filtered=await page.locator('#hmRows').innerText();
  assert(filtered.includes('專科以上／考試資格'));assert(!filtered.includes('高職'));assert(!filtered.includes('未達3,000萬'));
  const filteredRow=page.locator('#hmRows tr').filter({hasText:'專科以上／考試資格'}).filter({hasText:'應實施 HACCP'}).first();
  await filteredRow.getByRole('button',{name:'應備文件',exact:true}).click();
  assert.equal(await page.locator('[name="detailRoute"]').count(),3);
  assert((await page.locator('#hmDetail').innerText()).includes('專科以上相關科系畢業'));
  assert.equal(await page.locator('[name="detailSupplement"]').count(),1);
  await page.locator('[name="detailRoute"][value="a4-high-exam"]').check();
  proofs=await page.locator('.document-list').innerText();
  assert(proofs.includes('第4條第1款相關類科高等考試或相當特種考試及格證明'));
  assert(!proofs.includes('食品技師高等考試及格證明（或食品技師證書）'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'肉類加工食品業'});
  await page.locator('#hmQualification').selectOption('vocational');
  await page.locator('#hmLicense').selectOption('food-technologist');
  await page.locator('#hmCapital').selectOption('under30m');
  await page.locator('#hmSearch').click();
  assert((await page.locator('#hmMessage').innerText()).includes('未找到適用情境'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'即食餐食業（中央廚房食品工廠）'});await page.locator('#hmSearch').click();
  const article5=page.locator('#hmRows tr').filter({hasText:'中餐烹調乙級技術士'}).first();await article5.getByRole('button',{name:'應備文件',exact:true}).click();
  proofs=await page.locator('.document-list').innerText();
  assert(proofs.includes('中餐烹調乙級技術士證')&&proofs.includes('120小時'));
  assert.equal(await page.locator('.document-list li').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()).length),0);

  await page.locator('#majorTab').click();assert(await page.locator('#majorPanel').isVisible());
  await page.locator('#mcMajor').fill('食品科學系');await page.locator('#mcSearch').click();
  assert((await page.locator('#mcRows').innerText()).includes('食品科學系'));

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(base);await mobile.locator('#hmSearch:not([disabled])').waitFor({state:'attached'});await mobile.locator('#hygieneNav').click();
  for(const id of ['hmIndustry','hmQualification','hmLicense','hmCapital'])assert(await mobile.locator('#'+id).isVisible());
  await mobile.locator('#hmIndustry').selectOption({label:'肉類加工食品業'});await mobile.locator('#hmSearch').click();await mobile.locator('#hmRows button').first().click();
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));

  await page.locator('#modulesBtn').click();await page.locator('#moduleCatalog [data-module]').first().click();assert(await page.locator('#regulationsSection').isVisible());
  assert.deepEqual(errors,[]);console.log('PASS: hygiene route selection, AND filters, documents, major lookup and mobile layout.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
