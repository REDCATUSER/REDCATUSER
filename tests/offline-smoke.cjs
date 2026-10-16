const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const executable=process.env.RALLY_BROWSER||['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].find(p=>fs.existsSync(p));
(async()=>{
 const browser=await chromium.launch({...(executable?{executablePath:executable}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:820}});await context.setOffline(true);
  let page=await context.newPage();const errors=[],remote=[];
  const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url())})};watch(page);
  const file=path.resolve(__dirname,'../dist/Rally-Horizon-3D.html');let fileNavigation=true;
  try{await page.goto(pathToFileURL(file).href)}catch(error){
   if(!String(error).includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;
   fileNavigation=false;await page.close();page=await context.newPage();watch(page);await page.setContent(fs.readFileSync(file,'utf8'));
   console.log('Browser policy blocks file:// navigation here; checking the exact HTML in memory with networking disabled.');
  }
  await page.waitForFunction(()=>window.rallyState);
  const sources=await page.evaluate(()=>JSON.parse(document.getElementById('recordingSources').textContent));
  assert.equal(sources.license,'GPL-2.0-or-later');assert.equal(Object.keys(sources.clips).length,15);
  for(const url of Object.values(sources.clips))assert.equal(Buffer.from(url.split(',')[1],'base64').subarray(0,4).toString(),'RIFF');
  await page.locator('[data-tab=options]').click();await page.selectOption('#quality','low');await page.selectOption('#cameraSetting','2');await page.selectOption('#language','en');
  await page.locator('[data-tab=free]').click();await page.click('#start');
  await page.waitForFunction(()=>rallyState.audio&&rallyState.voiceReady&&rallyState.musicReady&&rallyState.audioLevel>.001,null,{timeout:45000});
  assert.equal(await page.evaluate(()=>rallyState.voiceKind),'mixed');assert.equal(await page.evaluate(()=>rallyState.visibleWheels),0);
  await page.screenshot({path:path.join(os.tmpdir(),'rally-v4-cockpit.png')});
  await page.keyboard.press('Escape');await page.click('#pauseSettings');
  assert.equal(await page.locator('#optionsForm').isVisible(),true);await page.screenshot({path:path.join(os.tmpdir(),'rally-v4-settings.png')});
  await page.click('#closeSettings');await page.click('#quit');await page.locator('[data-tab=garage]').click();await page.screenshot({path:path.join(os.tmpdir(),'rally-v4-garage.png')});
  assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  console.log(`PASS offline HTML (${fileNavigation?'file://':'in-memory HTML'}): no network requests, cockpit, garage, pause settings, engine, House music, English copilot and included GPL audio source WAVs.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
