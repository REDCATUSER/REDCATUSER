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
 voiceReady(){return copilot.voiceReady},
 async seedGhost(){const frames=Array.from({length:121},(_,i)=>{const n=Math.min(world.samples.length-2,Math.floor(i/120*(world.samples.length-1))),p=world.samples[n],q=world.samples[n+1];return[i*.5,p.x,p.z,Math.atan2(-(q.x-p.x),-(q.z-p.z)),world.length*i/120]});await saveGhost({version:5,key:runKey,time:60,car:carSpec().id,frames,splits:Array.from({length:9},(_,i)=>(i+1)*60/9),created:Date.now()})},
 impact(critical=false){const o=world.barriers[0],near=world.nearest(o.x,o.z),d=Math.hypot(o.x-near.point.x,o.z-near.point.z),nx=(o.x-near.point.x)/d,nz=(o.z-near.point.z)/d;resetDynamics(state);state.x=o.x-nx*.80;state.z=o.z-nz*.80;state.vx=nx*(critical?45:25);state.vz=nz*(critical?45:25);tick(.001)},
 diagnostics(){return {keys:[...keys],countdown,audioReady:audio.ready,musicReady:music.ready,engineGain:audio.engineBus?.gain.value,effectsGain:audio.effectsBus?.gain.value,voice:copilot.language}}
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
  const wait=fn=>page.waitForFunction(fn,null,{timeout:45000}).catch(async e=>{console.error('Browser diagnostics',await page.evaluate(()=>({state:window.rallyState,details:window.__raceCheck?.diagnostics()})),errors);await page.screenshot({path:'/tmp/rally-browser-failure.png'}).catch(()=>{});throw e});
  const start=async selector=>{await page.click(selector);if(await page.locator('#setupOverlay').isVisible()){assert.equal(await page.evaluate(()=>rallyState.mode),'menu');await page.click('#confirmStart')}};
  await wait(()=>window.rallyState);
  assert.equal(await page.evaluate(()=>rallyState.mode),'menu');
  await page.waitForTimeout(300);const idleFrames=await page.evaluate(()=>rallyState.renderFrames);await page.waitForTimeout(400);assert.ok(await page.evaluate(()=>rallyState.renderFrames)<=idleFrames+1,'idle menu must stop rendering');
  if(process.env.RALLY_CAPTURE)await page.screenshot({path:'/tmp/rally-v6-menu.png'});
  assert.equal(await page.locator('#hud').isVisible(),false);
  assert.equal(await page.locator('#heroPreview #game').count(),1);await page.click('#helpButton');assert.equal(await page.locator('#helpOverlay').isVisible(),true);await page.click('#closeHelp');
  assert.equal(await page.locator('#championships button').count(),5);
  assert.equal(await page.locator('#cars button:disabled').count(),5);
  await page.locator('[data-tab=options]').click();
  await page.locator('#manual').check();await page.selectOption('#quality','low');await page.selectOption('#cameraSetting','2');
  await page.locator('[data-tab=garage]').click();await page.selectOption('#tires','snow');
  assert.equal(await page.locator('#game').isVisible(),true);
  await page.locator('[data-tab=free]').click();await start('#start');
  assert.equal(await page.evaluate(()=>rallyState.mode),'countdown');assert.equal(await page.evaluate(()=>rallyState.startPhase),'red');await page.keyboard.down('ArrowUp');await wait(()=>rallyState.startPhase==='amber');assert.equal(await page.evaluate(()=>rallyState.speed),0);await wait(()=>rallyState.mode==='race'&&rallyState.speed>2);await page.keyboard.up('ArrowUp');assert.equal(await page.evaluate(()=>rallyState.startPhase),'green');
  await wait(()=>rallyState.audio&&rallyState.audioLevel>.001&&__raceCheck.voiceReady());
  assert.equal(await page.evaluate(()=>rallyState.visibleWheels),0);assert.equal(await page.evaluate(()=>rallyState.fov),82);
  await wait(()=>rallyState.musicReady);assert.equal(await page.evaluate(()=>rallyState.musicLevel),0,'no music during driving');
  if(process.env.RALLY_CAPTURE)await page.screenshot({path:'/tmp/rally-v6-cockpit.png'});
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
  await page.click('#pauseSettings');assert.equal(await page.evaluate(()=>rallyState.settingsOpen),true);
  const pausedTime=await page.evaluate(()=>rallyState.elapsed);
  const range=async(id,value)=>page.locator('#'+id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}))},value);
  await range('musicVolume',0);await range('engineVolume',31);await range('effectsVolume',0);await range('copilotVolume',0);
  await page.selectOption('#resolution','1280x720');await page.selectOption('#textureQuality','high');
  assert.deepEqual(await page.evaluate(()=>rallyState.renderSize),[1280,720]);assert.equal(await page.evaluate(()=>rallyState.textureSize),1024);
  await page.selectOption('#windowMode','fullscreen');await wait(()=>!!document.fullscreenElement);
  await page.selectOption('#windowMode','windowed');await wait(()=>!document.fullscreenElement);
  await page.selectOption('#language','en');await wait(()=>rallyState.voiceLanguage==='en'&&__raceCheck.voiceReady());
  await page.selectOption('#language','de');await wait(()=>rallyState.voiceLanguage==='de'&&__raceCheck.voiceReady());
  const {NOTE_AUDIO}=await import('../src/audio/notes-data.js');
  const clips=Object.fromEntries([...['left','right'].flatMap(side=>Array.from({length:6},(_,i)=>side+(i+1))),'finish'].map(code=>[code,NOTE_AUDIO[code].url]));
  await page.setInputFiles('#voiceImport',{name:'test-voice.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({language:'fr',name:'Pack de test',author:'Test',license:'MIT',clips}))});
  await wait(()=>rallyState.voiceKind==='imported'&&rallyState.voiceLanguage==='fr'&&__raceCheck.voiceReady());
  await page.click('#clearVoice');await wait(()=>rallyState.voiceKind==='neural'&&__raceCheck.voiceReady());
  const binding=(action,slot=0)=>page.locator(`[data-action=${action}][data-slot="${slot}"]`);
  await binding('shiftDown').click();await page.keyboard.press('KeyH');assert.match(await page.locator('#bindingStatus').textContent(),/déjà affectée/);await page.keyboard.press('Escape');
  await binding('shiftUp').click();await page.keyboard.press('PageUp');assert.deepEqual(await page.evaluate(()=>rallyState.career.settings.bindings.shiftUp),['PageUp','ShiftRight']);
  await binding('headlights').click();await page.keyboard.press('KeyL');
  assert.equal(await page.evaluate(()=>rallyState.elapsed),pausedTime);
  await page.click('#closeSettings');assert.equal(await page.evaluate(()=>rallyState.mode),'paused');
  await page.click('#resume');await wait(()=>Math.abs(__raceCheck.diagnostics().engineGain-.31)<.002&&__raceCheck.diagnostics().effectsGain<.002);
  await page.keyboard.press('ShiftLeft');assert.equal(await page.evaluate(()=>rallyState.gear),1);
  await page.keyboard.press('PageUp');await wait(()=>rallyState.gear===2);
  await page.keyboard.press('KeyH');assert.equal(await page.evaluate(()=>rallyState.headlights),true);
  await page.keyboard.press('KeyL');assert.equal(await page.evaluate(()=>rallyState.headlights),false);
  assert.equal(await page.evaluate(()=>rallyState.musicLevel),0);assert.equal(await page.evaluate(()=>rallyState.mix.copilot),0);
  await page.keyboard.press('Escape');await page.click('#pauseSettings');await range('engineVolume',0);await page.click('#closeSettings');await page.click('#resume');await wait(()=>rallyState.audioLevel<.0001);
  await page.keyboard.press('Escape');await page.click('#restart');assert.equal(await page.evaluate(()=>rallyState.mode),'countdown');assert.equal(await page.evaluate(()=>rallyState.elapsed),0);assert.equal(await page.evaluate(()=>rallyState.completed),0);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>rallyState.damage),0);
  await page.click('#resume');await page.evaluate(()=>__raceCheck.skipCountdown());
  await page.evaluate(()=>__raceCheck.impact());assert.ok(await page.evaluate(()=>rallyState.damage>0));
  if(process.env.RALLY_CAPTURE)await page.screenshot({path:'/tmp/rally-v6-damaged.png'});await page.evaluate(()=>__raceCheck.impact(true));assert.equal(await page.evaluate(()=>rallyState.mode),'wrecked');assert.equal(await page.locator('#wreckedMenu').isVisible(),true);const wreckTime=await page.evaluate(()=>rallyState.elapsed);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>rallyState.elapsed),wreckTime);await page.click('#wreckRestart');assert.equal(await page.evaluate(()=>rallyState.damage),0);
  await page.keyboard.press('Escape');await page.click('#restart');await page.evaluate(()=>__raceCheck.seedGhost());
  await page.keyboard.press('Escape');await page.click('#restart');await wait(()=>rallyState.ghostReady);
  await page.evaluate(()=>{__raceCheck.skipCountdown();window.testPad={connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.testPad]})});
  await wait(()=>rallyState.controller);await page.evaluate(()=>{testPad.axes[0]=.45;testPad.buttons[7].value=.7});
  await wait(()=>rallyState.controller&&rallyState.speed>1&&rallyState.steer>.1);await wait(()=>rallyState.ghostVisible);
  await page.evaluate(()=>testPad.connected=false);await wait(()=>rallyState.mode==='paused');await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));
  await page.click('#quit');await page.locator('[data-tab=championship]').click();await start('#startChampionship');
  await page.evaluate(()=>{__raceCheck.skipCountdown();__raceCheck.gate(__raceCheck.gates()-1)});
  assert.equal(await page.evaluate(()=>rallyState.completed),0);
  await page.keyboard.press('KeyR');assert.ok((await page.evaluate(()=>rallyState.elapsed))>=5);
  await page.evaluate(()=>__raceCheck.finish(120));assert.equal(await page.locator('#standings tbody tr').count(),7);assert.match(await page.locator('#resultMedal').textContent(),/OR/);assert.equal(await page.locator('.sector-grid>div').count(),9);
  await start('#continue');assert.equal(await page.evaluate(()=>rallyState.career.active.stageIndex),1);
  await page.keyboard.press('Escape');await page.click('#quit');
  const active=await page.evaluate(()=>JSON.stringify(rallyState.career.active));
  await page.locator('[data-tab=free]').click();await page.locator('[data-stage=romania-1]').click();await start('#start');await page.evaluate(()=>__raceCheck.finish(125));await page.click('#home');
  assert.equal(await page.evaluate(()=>JSON.stringify(rallyState.career.active)),active,'free stage preserves career');
  await page.reload();await wait(()=>window.rallyState);await start('#startChampionship');await page.evaluate(()=>__raceCheck.finish(120));await start('#continue');await page.evaluate(()=>__raceCheck.finish(120));await page.click('#home');
  for(const id of ['dakar','france','monte','usa']){
   await page.locator(`[data-championship=${id}]`).click();await start('#startChampionship');
   for(let i=0;i<3;i++){await page.evaluate(()=>__raceCheck.finish(120));await start(i<2?'#continue':'#home');}
  }
  assert.equal(await page.evaluate(()=>rallyState.career.completedChampionships.length),5);
  assert.equal(await page.evaluate(()=>rallyState.career.unlockedCars.length),6);
  await page.locator('[data-tab=garage]').click();await page.locator('[data-car=quattro]').click();
  assert.equal(await page.evaluate(()=>rallyState.career.selectedCar),'quattro');
  if(process.env.RALLY_CAPTURE){await page.locator('[data-tab=options]').click();await page.selectOption('#quality','medium');await page.locator('[data-tab=garage]').click();await page.screenshot({path:'/tmp/rally-v6-garage.png'})}
  await page.reload();await wait(()=>window.rallyState);assert.equal(await page.evaluate(()=>rallyState.career.selectedCar),'quattro');
  assert.equal(await page.evaluate(()=>rallyState.career.settings.bindings.shiftUp[0]),'PageUp');assert.equal(await page.evaluate(()=>rallyState.career.settings.textureQuality),'high');
  assert.deepEqual(errors,[]);
  console.log('PASS browser: idle menu, pre-race preparation, garage/settings, countdown lights, rigid cameras, Shift/Ctrl, lights, audio/voice, checkpoints, pause, free/career resume, all rewards, pause settings/restart, independent audio buses, render resolution, fullscreen, high textures, key conflicts/remapping, FR/EN/DE and voice import, medals/sectors, ghost storage/playback, visible collision damage and critical retirement, silent racing music bus, analog gamepad and safe disconnect.');
  console.log('Career finish checks use controlled checkpoint placements, not a complete physical driving test.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS)console.error('::error::'+String(e.message).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exit(1)});
