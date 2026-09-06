'use strict';
const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');
(async()=>{
 const root=path.join(__dirname,'../docs');const out=process.env.QA_OUTPUT||path.join(__dirname,'../../.work/qa');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(root+path.sep)&&p!==root){res.writeHead(403);return res.end();}let file=p===root?path.join(root,'index.html'):p;if(!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;try{browser=await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});}catch(error){server.close();throw error;}const base=`http://127.0.0.1:${server.address().port}/`;const errors=[];
 try{
 const page=await browser.newPage({viewport:{width:1536,height:1024}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});page.on('response',r=>{if(r.status()>=400)errors.push(r.url()+': '+r.status());});
 await page.goto(base);await page.locator('#hmSearch:not([disabled])').waitFor({state:'attached'});
 // Original current/history/future and CSV remain usable.
 assert(await page.locator('#rows tr[data-id]').count()>0);
 await page.locator('input[value="future"]').check();assert((await page.locator('#rows').innerText()).includes('未來實施'));
 await page.locator('input[value="history"]').check();assert(!(await page.locator('#rows').innerText()).includes('未來實施'));
 await page.locator('input[value="current"]').check();
 const downloadPromise=page.waitForEvent('download');await page.locator('#csvBtn').click();const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.csv'));
 await page.locator('#hygieneNav').click();await page.locator('#hmSearch').click();assert((await page.locator('#hmMessage').innerText()).includes('至少'));
 await page.locator('#hmIndustry').fill('肉類');await page.locator('#hmSearch').click();assert((await page.locator('#hmCount').innerText()).includes('筆情境'));
 await page.locator('#hmRows button').first().click();assert.equal(await page.locator('#hmDetail .document-list>li').count(),6);assert((await page.locator('#hmDetail').innerText()).includes('50%'));
 await page.screenshot({path:path.join(out,'desktop-meat.png'),fullPage:true});
 await page.locator('#hmMajor').fill('食品科學系');await page.locator('#hmSearch').click();await page.locator('#hmRows button').first().click();assert((await page.locator('#hmRows').innerText()).includes('專科以上'));assert((await page.locator('#hmDetail').innerText()).includes('專科以上符合科系資格畢業證書'));
 await page.locator('#majorShortcut').click();assert.equal(await page.locator('#mcMajor').inputValue(),'食品科學系');assert(await page.locator('#majorPanel').isVisible());
 await page.locator('#mcSchool').fill('海洋');await page.locator('#mcClass').fill('食品科學');await page.locator('#mcCode').fill('0721');await page.locator('#mcSearch').click();const codeRows=await page.locator('#mcRows').innerText();assert(codeRows.includes('海洋')&&codeRows.includes('0721')&&codeRows.includes('符合')&&codeRows.includes('2026-09-06'));
 await page.screenshot({path:path.join(out,'desktop-majors.png'),fullPage:true});
 await page.locator('#qualificationTab').click();await page.locator('#qualificationForm button[type="reset"]').click();await page.locator('#hmMajor').fill('食品加工科');await page.locator('#hmEducation').selectOption('高職');await page.locator('#hmCapital').selectOption('under30m');await page.locator('#hmSearch').click();
 let a6=page.locator('#hmRows tr').filter({hasText:'符合第6條'});for(let i=0;i<20&&await a6.count()===0;i++)await page.locator('#hmPager [data-step="1"]').click();assert(await a6.count()>0);
 await a6.first().getByRole('button',{name:'應備文件',exact:true}).click();let text=await page.locator('#hmDetail').innerText();assert(text.includes('食品加工科')&&text.includes('4年以上')&&text.includes('60小時'));assert(!(await a6.first().innerText()).includes('小型工廠'));
 // Details are invalidated when search conditions change.
 await page.locator('#hmIndustry').fill('肉類');assert.equal(await page.locator('#hmDetail .document-list').count(),0);await page.locator('#hmSearch').click();
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base);await mobile.locator('#hmSearch:not([disabled])').waitFor({state:'attached'});await mobile.locator('#hygieneNav').click();await mobile.locator('#hmIndustry').fill('肉類');await mobile.locator('#hmEducation').selectOption('高職');await mobile.locator('#hmCapital').selectOption('under30m');await mobile.locator('#hmSearch').click();await mobile.locator('#hmRows button').first().click();
 assert.equal(await mobile.locator('#hmDetail .document-list>li').count(),6);
 assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.equal(await mobile.locator('#hmRows td').first().evaluate(el=>getComputedStyle(el,'::before').content),'"業別"');
 await mobile.locator('#hmDetailPanel').scrollIntoViewIfNeeded();await mobile.screenshot({path:path.join(out,'mobile-detail.png')});
 await mobile.locator('#majorTab').click();await mobile.locator('#mcMajor').fill('食品加工科');await mobile.locator('#mcSearch').click();assert((await mobile.locator('#mcRows').innerText()).includes('第6條'));assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await mobile.locator('#mcRows tr').first().scrollIntoViewIfNeeded();await mobile.screenshot({path:path.join(out,'mobile-majors.png')});
 await page.locator('#modulesBtn').click();await page.locator('#moduleCatalog [data-module]').first().click();assert(await page.locator('#regulationsSection').isVisible());
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile, six requested cases, CSV, current/history/future, no console/HTTP errors. Screenshots: '+out);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


