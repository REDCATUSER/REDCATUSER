// End-to-end checks. Only the served test bundle receives the controlled
// checkpoint-placement hook; no test controls are shipped in production.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
const executable=process.env.RALLY_BROWSER||['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].find(p=>fs.existsSync(p));
const hook=`
window.__raceCheck={
 skipCountdown(){countdown=0;changeMode('race')},
 gate(index){const gate=world.gates[index];resetDynamics(state);state.x=gate.point.x;state.z=gate.point.z;state.yaw=gate.yaw;tick(.001)},
 finish(seconds){countdown=0;changeMode('race');elapsed=seconds;while(!race.finished){const gate=world.gates[race.nextGate];resetDynamics(state);state.x=gate.point.x;state.z=gate.point.z;state.yaw=gate.yaw;race.resetPosition(state.x,state.z);tick(.001)}},
 placeOnRoad(index){const p=world.samples[index],q=world.samples[index+1];resetDynamics(state);state.x=p.x;state.z=p.z;state.yaw=Math.atan2(-(q.x-p.x),-(q.z-p.z));race.resetPosition(state.x,state.z)},
 gates(){return world.gates.length},
 voiceReady(){return copilot.voiceReady}
};`;
(async()=>{
 const built=await esbuild.build({stdin:{contents:fs.readFileSync(path.join(root,'app/game.js'),'utf8')+hook,resolveDir:path.join(root,'app')},bundle:true,write:false});
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/game.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].text);return;}
  const file=path.resolve(root,'src','.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(path.join(root,'src')+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.ogg':'audio/ogg','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({...(executable?{executablePath:executable}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const wait=fn=>page.waitForFunction(fn,null,{timeout:45000});
  await wait(()=>window.rallyState);
  assert.equal(await page.evaluate(()=>rallyState.mode),'menu');
  assert.equal(await page.locator('#hud').isVisible(),false);
  assert.equal(await page.locator('#championships button').count(),5);
  assert.equal(await page.locator('#cars button:disabled').count(),5);
  await page.locator('[data-tab=options]').click();
  await page.locator('#manual').check();await page.selectOption('#quality','low');await page.selectOption('#cameraSetting','2');
  await page.locator('[data-tab=garage]').click();await page.selectOption('#tires','snow');
  assert.equal(await page.locator('#game').isVisible(),true);
  await page.locator('[data-tab=free]').click();await page.click('#start');
  await page.keyboard.down('ArrowUp');await wait(()=>rallyState.mode==='race'&&rallyState.speed>2);await page.keyboard.up('ArrowUp');
  await wait(()=>rallyState.audio&&rallyState.audioLevel>.001&&__raceCheck.voiceReady());
  const local=await page.evaluate(()=>rallyState.cameraLocal);
  await page.evaluate(()=>__raceCheck.placeOnRoad(80));await page.waitForTimeout(100);
  const moved=await page.evaluate(()=>rallyState.cameraLocal);
  for(let i=0;i<3;i++)assert.ok(Math.abs(local[i]-moved[i])<.001,'rigid cockpit anchor');
  await page.keyboard.press('ShiftLeft');await wait(()=>rallyState.gear===2);await wait(()=>rallyState.shift===0);
  await page.keyboard.press('ControlLeft');await wait(()=>rallyState.gear===1);
  await page.keyboard.press('KeyH');assert.equal(await page.evaluate(()=>rallyState.headlights),true);
  await page.keyboard.press('Digit2');await wait(()=>rallyState.cameraMode===1);
  await page.keyboard.press('Digit1');await wait(()=>rallyState.cameraMode===0);
  await page.keyboard.press('Escape');const time=await page.evaluate(()=>rallyState.elapsed);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>rallyState.elapsed),time);
  await page.click('#quit');await page.locator('[data-tab=championship]').click();await page.click('#startChampionship');
  await page.evaluate(()=>{__raceCheck.skipCountdown();__raceCheck.gate(__raceCheck.gates()-1)});
  assert.equal(await page.evaluate(()=>rallyState.completed),0);
  await page.keyboard.press('KeyR');assert.ok((await page.evaluate(()=>rallyState.elapsed))>=5);
  await page.evaluate(()=>__raceCheck.finish(120));assert.equal(await page.locator('#standings tbody tr').count(),7);
  await page.click('#continue');assert.equal(await page.evaluate(()=>rallyState.career.active.stageIndex),1);
  await page.keyboard.press('Escape');await page.click('#quit');
  const active=await page.evaluate(()=>JSON.stringify(rallyState.career.active));
  await page.locator('[data-tab=free]').click();await page.locator('[data-stage=romania-1]').click();await page.click('#start');await page.evaluate(()=>__raceCheck.finish(125));await page.click('#home');
  assert.equal(await page.evaluate(()=>JSON.stringify(rallyState.career.active)),active,'free stage preserves career');
  await page.reload();await wait(()=>window.rallyState);await page.click('#startChampionship');await page.evaluate(()=>__raceCheck.finish(120));await page.click('#continue');await page.evaluate(()=>__raceCheck.finish(120));await page.click('#home');
  for(const id of ['dakar','france','monte','usa']){
   await page.locator(`[data-championship=${id}]`).click();await page.click('#startChampionship');
   for(let i=0;i<3;i++){await page.evaluate(()=>__raceCheck.finish(120));await page.click(i<2?'#continue':'#home');}
  }
  assert.equal(await page.evaluate(()=>rallyState.career.completedChampionships.length),5);
  assert.equal(await page.evaluate(()=>rallyState.career.unlockedCars.length),6);
  await page.locator('[data-tab=garage]').click();await page.locator('[data-car=quattro]').click();
  assert.equal(await page.evaluate(()=>rallyState.career.selectedCar),'quattro');
  await page.reload();await wait(()=>window.rallyState);assert.equal(await page.evaluate(()=>rallyState.career.selectedCar),'quattro');
  assert.deepEqual(errors,[]);
  console.log('PASS browser: main menu, garage/settings, countdown, rigid cameras, Shift/Ctrl, lights, audio/voice, checkpoints, pause, free/career resume, all rewards.');
  console.log('Career finish checks use controlled checkpoint placements, not a complete physical driving test.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS)console.error('::error::'+String(e.message).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exit(1)});
