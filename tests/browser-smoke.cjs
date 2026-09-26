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
  await page.locator('input[value="future"]').check();assert((await page.locator('#rows').innerText()).includes('未來實施'));
  await page.locator('input[value="history"]').check();assert(!(await page.locator('#rows').innerText()).includes('未來實施'));
  await page.locator('input[value="current"]').check();
  const downloadPromise=page.waitForEvent('download');await page.locator('#csvBtn').click();const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.csv'));

  await page.locator('#hygieneNav').click();
  await page.locator('#hmSearch').click();assert((await page.locator('#hmMessage').innerText()).includes('選擇業別'));
  assert.equal(await page.locator('#hmIndustry option').count(),13);
  assert.equal(await page.locator('#hmMajor').count(),0);
  assert.equal(await page.locator('#hmSchool').count(),0);
  assert.equal(await page.locator('#hmAdvanced summary').count(),0);
  assert(await page.locator('#hmEducation').isVisible());
  assert(await page.locator('#hmLicense').isVisible());
  assert(await page.locator('#hmCapital').isVisible());

  await page.locator('#hmIndustry').selectOption({label:'肉類加工食品業'});await page.locator('#hmSearch').click();
  const meatText=await page.locator('#hmRows').innerText();
  assert(meatText.includes('專科以上／考試資格'));assert(!meatText.includes('考試資格\n'));assert(!meatText.includes('相關科系／考試資格'));
  assert.equal(await page.locator('.qualification-table thead th').count(),6);
  const required=page.locator('#hmRows tr').filter({hasText:'專科以上／考試資格'}).filter({hasText:'應實施 HACCP'});
  assert.equal(await required.count(),1);assert((await required.innerText()).includes('不限'));
  await required.getByRole('button',{name:'應備文件',exact:true}).click();
  let detail=await page.locator('#hmDetail').innerText();assert(detail.includes('HACCP 判定條件')&&detail.includes('50%'));
  await page.locator('[name="detailSupplement"][value="haccp30"]').check();
  assert.equal(await page.locator('#detailLicense').count(),0);
  let proofs=await page.locator('.document-list').innerText();
  for(const name of ['食品技師','畜牧技師','獸醫師','水產養殖技師','營養師'])assert(proofs.includes(name));

  const nonRequired=page.locator('#hmRows tr').filter({hasText:'專科以上／考試資格'}).filter({hasText:'非屬應實施 HACCP'}).first();
  await nonRequired.getByRole('button',{name:'應備文件',exact:true}).click();
  detail=await page.locator('#hmDetail').innerText();assert(!detail.includes('HACCP 判定條件'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'即食餐食業'});await page.locator('#hmSearch').click();
  const instant=await page.locator('#hmRows').innerText();
  assert(instant.includes('即食餐食業'));assert(instant.includes('中央廚房食品工廠'));assert(instant.includes('餐盒食品工廠'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'即食餐食業（中央廚房食品工廠）'});await page.locator('#hmSearch').click();
  const central=await page.locator('#hmRows').innerText();assert(central.includes('中央廚房食品工廠'));assert(!central.includes('餐盒食品工廠'));
  const article5=page.locator('#hmRows tr').filter({hasText:'中餐烹調乙級技術士'});assert(await article5.count()>0);
  await article5.first().getByRole('button',{name:'應備文件',exact:true}).click();detail=await page.locator('#hmDetail').innerText();assert(detail.includes('120小時'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'即食餐食業（餐盒食品工廠）'});await page.locator('#hmSearch').click();
  const meal=await page.locator('#hmRows').innerText();assert(meal.includes('餐盒食品工廠'));assert(!meal.includes('中餐烹調乙級技術士'));assert(meal.includes('應實施 HACCP'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'其他食品製造業'});await page.locator('#hmSearch').click();
  const other=await page.locator('#hmRows').innerText();
  assert(other.includes('其他食品製造業'));assert(other.includes('食用油脂工廠'));assert(other.includes('蛋製品工廠'));
  assert(!other.includes('低酸性'));assert(!other.includes('酸化食品'));

  await page.locator('#qualificationForm button[type="reset"]').click();
  await page.locator('#hmIndustry').selectOption({label:'罐頭食品製造業'});await page.locator('#hmSearch').click();
  const cannedHaccp=page.locator('#hmRows tr').filter({hasText:'應實施 HACCP'}).first();await cannedHaccp.getByRole('button',{name:'應備文件',exact:true}).click();
  detail=await page.locator('#hmDetail').innerText();assert(/低酸性|酸化/.test(detail));

  await page.locator('#majorTab').click();assert(await page.locator('#majorPanel').isVisible());
  await page.locator('#mcMajor').fill('食品科學系');await page.locator('#mcSearch').click();
  assert((await page.locator('#mcRows').innerText()).includes('食品科學系'));

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(base);await mobile.locator('#hmSearch:not([disabled])').waitFor({state:'attached'});await mobile.locator('#hygieneNav').click();
  await mobile.locator('#hmIndustry').selectOption({label:'其他食品製造業'});await mobile.locator('#hmSearch').click();await mobile.locator('#hmRows button').first().click();
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.equal(await mobile.locator('#hmRows td').first().evaluate(el=>getComputedStyle(el,'::before').content),'"業別"');

  await page.locator('#modulesBtn').click();await page.locator('#moduleCatalog [data-module]').first().click();assert(await page.locator('#regulationsSection').isVisible());
  assert.deepEqual(errors,[]);console.log('PASS: integrated hygiene industry selector, HACCP scenarios, major lookup, CSV and regulation modes.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
