import * as T from 'three';
import { STAGES, CARS, CHAMPIONSHIPS } from './content.js';
import { makeWorld } from './world.js';
import { createCar } from './car.js';
import { RallyAudio } from './audio.js';
import { Copilot } from './copilot.js';
import { createState, integrate, shift, clamp, resetDynamics } from './physics.js';
import { createCareer } from './career.js';
import { createRaceProgress } from './race.js';

const $ = id => document.getElementById(id);
const canvas = $('game'), mapContext = $('map').getContext('2d');
const career = createCareer(), state = createState(), audio = new RallyAudio(), copilot = new Copilot();
const scene = new T.Scene(), camera = new T.PerspectiveCamera(62, 1, .035, 1400);
let renderer;
try { renderer = new T.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'}); }
catch(error) { $('status').textContent = 'WebGL 2 indisponible. Activez l’accélération graphique dans Edge ou Chrome.'; $('start').disabled=true; $('startChampionship').disabled=true; throw error; }
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
renderer.shadowMap.type=T.PCFSoftShadowMap;
const ambient = new T.HemisphereLight(0xe4f0ff,0x454d3d,2.1);
const sun = new T.DirectionalLight(0xffedcf,3.1);
sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:180});
sun.shadow.bias=-.0006; sun.shadow.normalBias=.045;
scene.add(ambient,sun,sun.target);
let mode='menu', tab='championship', world=null, car=null, race=null, selectedStage=STAGES[0].id;
let selectedChampionship=career.data.active?.championshipId||CHAMPIONSHIPS[0].id, stage=STAGES[0], elapsed=0, penalties=0, countdown=3;
let cameraMode=Number(career.data.settings.camera)||0, headlights=false, practice=false, lastTime=0, accumulator=0;
let sessionMode='free',collisionObjects=[];
let cameraSnap=true, uiTimer=0, visualPitch=0, smoothedGround=0, courseDistance=0, lastEvent=null, lastChampResult=null;
const keys=new Set(), targetCamera=new T.Vector3(), cameraLook=new T.Vector3(), smoothedLook=new T.Vector3();
const carSpec=()=>CARS.find(c=>c.id===career.data.selectedCar)||CARS[0];
const formatTime=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;
const formatDistance=m=>`${(m/1000).toFixed(2)} km`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isDriving=()=>['race','countdown','paused','finished'].includes(mode);
function resize(){
  const preview=mode==='menu'&&tab==='garage';
  const box=preview?$('garagePreview'):document.body;
  if(canvas.parentElement!==box)box.appendChild(canvas);
  Object.assign(canvas.style,preview?{position:'relative',inset:'auto',width:'100%',height:'100%'}:{position:'fixed',inset:'0',width:'100vw',height:'100vh'});
  const width=preview?box.clientWidth:innerWidth, height=preview?box.clientHeight:innerHeight;
  renderer.setSize(Math.max(width,1),Math.max(height,1),false); camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();
}
function applyQuality(){const q=career.data.settings.quality;renderer.setPixelRatio(Math.min(devicePixelRatio,q==='low'?1:q==='high'?1.75:1.3));renderer.shadowMap.enabled=q!=='low';resize();}
function changeMode(next){
  mode=next;document.body.dataset.mode=next;
  $('menu').classList.toggle('hidden',next!=='menu');
  $('result').classList.toggle('hidden',next!=='finished');
  $('pauseMenu').classList.toggle('hidden',next!=='paused');
  for(const id of ['raceHeader','hud','telemetry','map','raceControls','paceNote'])$(id)?.classList.toggle('hidden',!isDriving());
  $('countdown').classList.toggle('hidden',next!=='countdown');
  if(next!=='race')keys.clear();if(next!=='race')copilot.stop();resize();
}
function refreshCar(){
  if(car)car.dispose();
  const spec=carSpec();car=createCar(scene,{...spec,id:spec.id,color:career.data.tuning.color,tuning:career.data.tuning});
  car.setHeadlights(headlights);audio.setCar?.(spec);cameraSnap=true;
}
function cameraView(i,save=true){cameraMode=(Number(i)+3)%3;camera.fov=[62,69,82][cameraMode];camera.updateProjectionMatrix();cameraSnap=true;
  $('camera').textContent=`VUE : ${['POURSUITE','CAPOT','PILOTE'][cameraMode]} · C`;
  $('cameraSetting').value=String(cameraMode);if(save)career.setSettings({camera:cameraMode});}
function setTab(next){
  tab=next;for(const p of document.querySelectorAll('[id^="panel-"]'))p.classList.toggle('hidden',p.id!==`panel-${next}`);
  document.querySelectorAll('#menuNav [data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===next);b.classList.toggle('active',b.dataset.tab===next)});
  if(next==='garage'){camera.fov=32;camera.updateProjectionMatrix();if(!car)refreshCar();if(world)world.root.visible=false;scene.background=new T.Color(0x172128);scene.fog=null;car.root.position.set(0,0,0);car.root.rotation.set(0,0,0);car.exterior.visible=true;}
  resize();
}
function renderMenus(){
  $('championships').innerHTML=CHAMPIONSHIPS.map((c,i)=>{
    const unlocked=career.data.unlockedChampionships.includes(c.id),won=career.data.completedChampionships.includes(c.id);
    return `<button data-championship="${c.id}" class="event-card ${selectedChampionship===c.id?'selected':''}" ${unlocked?'':'disabled'}><span class="eyebrow">CHAMPIONNAT ${String(i+1).padStart(2,'0')} ${won?'· GAGNÉ':unlocked?'':'· VERROUILLÉ'}</span><strong>${esc(c.name)}</strong><small>${c.stageIds.length} spéciales · ${esc(CARS.find(a=>a.id===c.rewardCar)?.name||c.rewardCar)}</small></button>`;
  }).join('');
  const chosen=CHAMPIONSHIPS.find(c=>c.id===selectedChampionship)||CHAMPIONSHIPS[0];
  const active=career.data.active;
  $('championshipInfo').innerHTML=`<h3>${esc(chosen.name)}</h3><p>${chosen.stageIds.map(id=>esc(STAGES.find(s=>s.id===id)?.name)).join(' → ')}</p><p>Remportez le classement cumulé face à six pilotes pour débloquer <b>${esc(CARS.find(c=>c.id===chosen.rewardCar)?.name)}</b>.</p>`;
  $('startChampionship').textContent=active?.championshipId===chosen.id&&!active.finished?'REPRENDRE LE CHAMPIONNAT →':'DÉMARRER LE CHAMPIONNAT →';
  $('startChampionship').disabled=!career.data.unlockedChampionships.includes(chosen.id);
  $('tracks').innerHTML=STAGES.map(s=>`<button data-stage="${s.id}" class="stage-card ${s.id===selectedStage?'selected':''}"><span class="eyebrow">${esc(s.regionLabel||s.region)}</span><strong>${esc(s.name)}</strong><small>${formatDistance(s.length)} · ${esc(s.surfaceLabel||s.surface)} · ≈ ${Math.round(s.parTime/60*10)/10} min</small></button>`).join('');
  const free=STAGES.find(s=>s.id===selectedStage)||STAGES[0];$('stageInfo').textContent=free.description||`${free.name} · Spéciale de point à point · ${formatDistance(free.length)}`;
  $('cars').innerHTML=CARS.map(c=>{const unlocked=career.data.unlockedCars.includes(c.id);return `<button data-car="${c.id}" class="car-card ${c.id===career.data.selectedCar?'selected':''}" ${unlocked?'':'disabled'}><strong>${esc(c.name)}</strong><small>${c.power} ch · ${c.mass} kg ${unlocked?'':'· À DÉBLOQUER'}</small></button>`}).join('');
  $('carInfo').innerHTML=`<h3>${esc(carSpec().name)}</h3><p>${esc(carSpec().description)}</p>`;
  for(const [id,key] of [['carColor','color'],['tires','tires'],['suspension','suspension'],['gearing','gearing']])$(id).value=career.data.tuning[key];
  const settings=career.data.settings;
  $('manual').checked=settings.manual;$('copilot').checked=settings.copilot;$('volume').value=settings.volume;$('quality').value=settings.quality;$('cameraSetting').value=String(cameraMode);
  $('status').textContent=`${career.data.completedChampionships.length} / 5 championnats gagnés · ${career.data.unlockedCars.length} / ${CARS.length} voitures · Sauvegarde locale`;
}
function persistOptions(){
  career.setSettings({manual:$('manual').checked,copilot:$('copilot').checked,volume:Number($('volume').value),quality:$('quality').value,camera:Number($('cameraSetting').value)});
  state.manual=career.data.settings.manual;audio.volume=career.data.settings.volume/100;copilot.volume=audio.volume;copilot.enabled=career.data.settings.copilot&&audio.enabled;cameraView(career.data.settings.camera,false);applyQuality();
}
$('menuNav').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)};
$('championships').onclick=e=>{const b=e.target.closest('[data-championship]');if(b&&!b.disabled){selectedChampionship=b.dataset.championship;renderMenus()}};
$('tracks').onclick=e=>{const b=e.target.closest('[data-stage]');if(b){selectedStage=b.dataset.stage;renderMenus()}};
$('cars').onclick=e=>{const b=e.target.closest('[data-car]');if(b&&!b.disabled){career.selectCar(b.dataset.car);refreshCar();renderMenus()}};
for(const id of ['carColor','tires','suspension','gearing'])$(id).addEventListener('input',()=>{career.setTuning({color:$('carColor').value,tires:$('tires').value,suspension:$('suspension').value,gearing:$('gearing').value});refreshCar();});
for(const id of ['manual','copilot','volume','quality','cameraSetting'])$(id).addEventListener('change',persistOptions);
$('volume').addEventListener('input',persistOptions);
function unlockAudio(){audio.start().catch(()=>{$('notice').textContent='Le moteur audio n’a pas pu démarrer.'});copilot.start().catch(()=>{$('notice').textContent='Copilote audio indisponible.'})}
function recover(index,charge=true){
  const gate=world.gates[index],forward=new T.Vector3(-Math.sin(gate.yaw),0,-Math.cos(gate.yaw));
  resetDynamics(state);state.x=gate.point.x+forward.x*2;state.z=gate.point.z+forward.z*2;state.yaw=gate.yaw;
  state.gear=1;state.rpm=950;state.collision=0;race.resetPosition(state.x,state.z);courseDistance=gate.distance+2;copilot.reset(world.notes);cameraSnap=true;
  smoothedGround=world.heightAt(state.x,state.z);visualPitch=0;if(charge&&!practice){elapsed+=5;penalties+=5}keys.clear();
}
function beginStage(id){
  stage=STAGES.find(s=>s.id===id)||STAGES[0];if(world)world.dispose();
  world=makeWorld(scene,stage,STAGES.indexOf(stage));collisionObjects=[...(world.obstacles||[]),...(world.barriers||[])];race=createRaceProgress(world.gates,{radius:Math.min(12,world.roadWidth||11)});
  elapsed=0;penalties=0;countdown=3;accumulator=0;courseDistance=0;lastEvent=null;lastChampResult=null;
  state.manual=career.data.settings.manual;refreshCar();recover(0,false);clearEffects();copilot.reset(world.notes);unlockAudio();
  $('stageName').textContent=stage.name;cameraView(career.data.settings.camera,false);changeMode('countdown');$('countdown').textContent='3';updateUI();
}
$('start').onclick=()=>{practice=!!$('practice')?.checked;sessionMode='free';if(!career.data.active)career.startFree(selectedStage);beginStage(selectedStage)};
$('startChampionship').onclick=()=>{practice=false;sessionMode='championship';let id;const active=career.data.active;
  if(active?.championshipId===selectedChampionship&&!active.finished){id=active.stageComplete?career.nextStage():career.currentStageId()}
  else id=career.startChampionship(selectedChampionship);
  if(id)beginStage(id);
};
function goHome(){copilot.stop();changeMode('menu');if(world)world.root.visible=false;renderMenus();setTab(tab)}
$('home').onclick=goHome;$('quit').onclick=goHome;
$('continue').onclick=()=>{const id=career.nextStage();if(id)beginStage(id);else goHome()};
$('again').onclick=()=>{practice=!!$('practice')?.checked;beginStage(stage.id)};
function pause(){if(mode==='race'||mode==='countdown'){changeMode('paused');$('pause').textContent='REPRENDRE · ÉCHAP'}else if(mode==='paused'){changeMode(countdown>0?'countdown':'race');$('pause').textContent='PAUSE · ÉCHAP'}}
$('pause').onclick=pause;$('resume').onclick=pause;$('camera').onclick=()=>cameraView(cameraMode+1);
function toggleLights(){headlights=!headlights;car?.setHeadlights(headlights);$('headlights').textContent=`PHARES : ${headlights?'ON':'OFF'} · H`}
$('headlights').onclick=toggleLights;
$('sound').onclick=()=>{audio.enabled=!audio.enabled;copilot.enabled=career.data.settings.copilot&&audio.enabled;$('sound').textContent=`SON : ${audio.enabled?'ON':'OFF'}`;if(!audio.enabled)copilot.stop();unlockAudio()};
addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(isDriving()&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','ControlLeft','KeyW','KeyZ','KeyS','KeyA','KeyQ','KeyD','KeyR','KeyH','KeyM','KeyC'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;if(e.code==='Escape'){pause();return}if(!isDriving())return;
  if(e.code==='KeyC')cameraView(cameraMode+1);if(['Digit1','Digit2','Digit3'].includes(e.code))cameraView(Number(e.code.slice(-1))-1);
  if(e.code==='KeyH')toggleLights();if(mode!=='race')return;
  if(e.code==='KeyR')recover(race.lastValidIndex);
  if(e.code==='KeyM'){state.manual=!state.manual;career.setSettings({manual:state.manual});$('manual').checked=state.manual}
  if(state.manual){if(e.code==='ShiftLeft'||e.code==='ShiftRight')shift(state,state.gear+1);if(e.code==='ControlLeft')shift(state,state.gear-1)}
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();if(mode==='race'||mode==='countdown')pause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='race'||mode==='countdown'))pause()});
addEventListener('resize',resize);

// Bounded dust and tire-mark pools; no per-frame scene object allocation.
const count=220, positions=new Float32Array(count*3),life=new Float32Array(count),velocities=new Float32Array(count*3);
const dustGeometry=new T.BufferGeometry();dustGeometry.setAttribute('position',new T.BufferAttribute(positions,3));
const dustCanvas=document.createElement('canvas');dustCanvas.width=dustCanvas.height=32;const dc=dustCanvas.getContext('2d'),gr=dc.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,255,255,.6)');gr.addColorStop(1,'rgba(255,255,255,0)');dc.fillStyle=gr;dc.fillRect(0,0,32,32);
const dustMaterial=new T.PointsMaterial({size:1.2,map:new T.CanvasTexture(dustCanvas),transparent:true,depthWrite:false,color:0xc6b69d});
const dust=new T.Points(dustGeometry,dustMaterial);dust.frustumCulled=false;scene.add(dust);
const marks=new T.InstancedMesh(new T.PlaneGeometry(.20,.65).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:0x45413a,transparent:true,opacity:.28,depthWrite:false}),800);
marks.frustumCulled=false;scene.add(marks);const markDummy=new T.Object3D();let dustCursor=0,markCursor=0,dustTime=0;
function clearEffects(){positions.fill(-9999);life.fill(0);dustGeometry.attributes.position.needsUpdate=true;markCursor=0;for(let i=0;i<800;i++){markDummy.position.set(0,-9999,0);markDummy.scale.setScalar(0);markDummy.updateMatrix();marks.setMatrixAt(i,markDummy.matrix)}marks.instanceMatrix.needsUpdate=true;}
function effects(dt){
  dust.visible=marks.visible=isDriving();if(!world||mode!=='race')return;
  for(let i=0;i<count;i++)if(life[i]>0){life[i]-=dt;const k=i*3;positions[k]+=velocities[k]*dt;positions[k+1]+=velocities[k+1]*dt;positions[k+2]+=velocities[k+2]*dt;if(life[i]<=0)positions[k+1]=-9999;}
  const sandy=stage.surface==='sand',snow=stage.surface==='snow',dusty=sandy||snow||stage.surface==='gravel'||state.offroad;
  dustMaterial.color.setHex(snow?0xeaf4fa:sandy?0xd6b780:0xc6b69d);dustMaterial.size=sandy?1.8:1.1;
  if(Math.abs(state.speed)>4&&(dusty||Math.abs(state.side)>2)){
    dustTime+=dt;if(dustTime>.045){dustTime=0;const fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),rx=Math.cos(state.yaw),rz=-Math.sin(state.yaw);
      for(const side of [-1,1]){const x=state.x-fx*1.25+rx*side*.9,z=state.z-fz*1.25+rz*side*.9,k=(dustCursor++%count)*3;
        if(dusty){positions[k]=x;positions[k+1]=world.heightAt(x,z)+.3;positions[k+2]=z;life[k/3]=1.3;velocities[k]=-fx+Math.random()-.5;velocities[k+1]=.7;velocities[k+2]=-fz+Math.random()-.5;}
        if(state.handbrake||Math.abs(state.side)>1.8){markDummy.position.set(x,world.heightAt(x,z)+.05,z);markDummy.rotation.set(0,state.yaw,0);markDummy.scale.setScalar(1);markDummy.updateMatrix();marks.setMatrixAt(markCursor++%800,markDummy.matrix);marks.instanceMatrix.needsUpdate=true;}
      }
    }
  }dustGeometry.attributes.position.needsUpdate=true;
}
function finish(){
  if(mode!=='race')return;
  if(!practice)career.recordTime(stage.id,elapsed);
  const championship=sessionMode==='championship'&&!!career.data.active&&!career.data.active.finished;
  if(championship)lastChampResult=career.recordStage(elapsed);
  changeMode('finished');if(audio.enabled)copilot.speak?.('finish');$('resultTime').textContent=formatTime(elapsed);
  $('resultTitle').textContent=lastChampResult?.finished?(lastChampResult.won?'CHAMPIONNAT GAGNÉ':'CHAMPIONNAT TERMINÉ'):'SPÉCIALE TERMINÉE';
  const reward=lastChampResult?.rewardCar;
  $('resultInfo').textContent=`${stage.name} · ${formatDistance(world.length)} · ${race.completed} checkpoints · pénalités ${penalties} s`+(reward?` · Nouvelle voiture : ${CARS.find(c=>c.id===reward)?.name||reward}`:practice?' · Entraînement, temps non enregistré.':'');
  const rows=lastChampResult?.standings||[];
  $('standings').innerHTML=rows.length?`<table><thead><tr><th>POS.</th><th>PILOTE</th><th>TEMPS CUMULÉ</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.isPlayer?'player':''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${formatTime(r.totalTime??r.time)}</td></tr>`).join('')}</tbody></table>`:'';
  $('continue').classList.toggle('hidden',!championship||lastChampResult?.finished);
  $('again').classList.toggle('hidden',championship);updateUI();
}
function tick(dt){
  if(mode==='countdown'){countdown-=dt;$('countdown').textContent=countdown>0?String(Math.ceil(countdown)):'PARTEZ !';if(countdown<=0){changeMode('race');copilot.speak('start');}return}
  if(mode!=='race'||!world)return;elapsed+=dt;
  const near=world.nearest(state.x,state.z),fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw);
  state.surface=near.surface||stage.surface;
  const slope=(world.heightAt(state.x+fx*1.2,state.z+fz*1.2)-world.heightAt(state.x-fx*1.2,state.z-fz*1.2))/2.4;
  integrate(state,{throttle:Number(keys.has('ArrowUp')||keys.has('KeyZ')||keys.has('KeyW')),brake:Number(keys.has('ArrowDown')||keys.has('KeyS')),steer:Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyQ')||keys.has('KeyA')),handbrake:keys.has('Space')},dt,{surface:near.surface||stage.surface,offroad:near.dist>(world.roadWidth||11)/2,wetness:world.weather?.wetness||0,slope,roughness:near.roughness||0,tuning:career.data.tuning,car:carSpec()});
  state.collision=Math.max(0,state.collision-dt);
  if(state.collision===0){const candidates=near.dist>(world.roadWidth||11)/2-1?collisionObjects:[];
    for(const o of candidates){if(o.distance!==undefined&&Math.abs(o.distance-near.distance)>35)continue;const dx=state.x-o.x,dz=state.z-o.z,d=Math.hypot(dx,dz),radius=(o.r||.4)+.85;
      if(d<radius){const nx=d>.01?dx/d:Math.cos(state.yaw),nz=d>.01?dz/d:-Math.sin(state.yaw);state.x=o.x+nx*(radius+.05);state.z=o.z+nz*(radius+.05);const dot=state.vx*nx+state.vz*nz;if(dot<0){state.vx-=dot*1.2*nx;state.vz-=dot*1.2*nz;}state.vx*=.55;state.vz*=.55;state.yawRate*=.35;state.collision=.45;break;}
    }
  }
  const current=world.nearest(state.x,state.z);courseDistance=clamp(current.distance||0,0,world.length);
  if(current.dist>150){recover(race.lastValidIndex);return}
  const event=race.update(state.x,state.z,elapsed);if(event){lastEvent=event;if(event.finished){finish();return;}}
  copilot.update(courseDistance,Math.abs(state.speed),mode==='race');
}
function updateUI(){
  if(!world||!race)return;
  $('time').textContent=formatTime(elapsed);$('speed').textContent=Math.round(Math.abs(state.speed)*3.6);$('gear').textContent=state.speed<-.4?'R':state.gear;$('gearMode').textContent=state.manual?'MANUEL':'AUTO';
  $('rpm').textContent=Math.round(state.rpm/50)*50;$('rpmBar').style.width=clamp(state.rpm/7400*100,0,100)+'%';$('rpmBar').style.background=state.rpm>6500?'#ff754a':'#d8ff59';
  $('best').textContent='RECORD '+(career.data.records[stage.id]?formatTime(career.data.records[stage.id]):'—');
  $('progress').textContent=`CHECKPOINT ${race.completed} / ${world.gates.length-1}`;$('distance').textContent=`${formatDistance(courseDistance)} / ${formatDistance(world.length)}`;
  $('notice').textContent=state.collision>0?'CONTACT · R : REPLACER':state.offroad?'HORS PISTE':`PÉNALITÉS ${penalties} S · ${(stage.surfaceLabel||stage.surface).toUpperCase()}`;
  $('paceNote').textContent=copilot.text||copilot.current?.text||'SUIVEZ LES CHECKPOINTS';
  const p=world.samples,minX=Math.min(...p.map(a=>a.x)),maxX=Math.max(...p.map(a=>a.x)),minZ=Math.min(...p.map(a=>a.z)),maxZ=Math.max(...p.map(a=>a.z));
  const scale=Math.min(145/(maxX-minX||1),115/(maxZ-minZ||1));const point=a=>[18+(a.x-minX)*scale,15+(a.z-minZ)*scale];
  mapContext.clearRect(0,0,180,150);mapContext.lineWidth=3;mapContext.strokeStyle='#a5bda8';mapContext.beginPath();p.forEach((a,i)=>i?mapContext.lineTo(...point(a)):mapContext.moveTo(...point(a)));mapContext.stroke();
  mapContext.fillStyle='#d8ff59';mapContext.beginPath();mapContext.arc(...point(world.gates[Math.min(race.nextGate,world.gates.length-1)].point),4,0,Math.PI*2);mapContext.fill();
  mapContext.fillStyle='#fff';mapContext.beginPath();mapContext.arc(...point(state),3,0,Math.PI*2);mapContext.fill();
}
function visuals(dt,t){
  if(mode==='menu'){
    if(tab!=='garage'||!car)return;
    car.root.rotation.set(0,t*.00016,0);car.root.position.set(0,0,0);ambient.intensity=2.1;sun.intensity=3.1;camera.up.set(0,1,0);
    car.update({steer:0,speed:0,dt:0,shift:0,rpm:950,gear:1,brake:0,cameraMode:0});
    camera.position.set(3.2,1.8,4.3);camera.lookAt(0,.85,0);sun.position.set(8,12,5);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld();return;
  }
  if(!car||!world)return;world.root.visible=true;
  const fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),ground=world.heightAt(state.x,state.z);
  const desiredPitch=Math.atan2(world.heightAt(state.x+fx*1.3,state.z+fz*1.3)-world.heightAt(state.x-fx*1.3,state.z-fz*1.3),2.6);
  smoothedGround=mode==='countdown'?ground:smoothedGround+(ground-smoothedGround)*(1-Math.exp(-dt*20));
  visualPitch+=(desiredPitch-visualPitch)*(1-Math.exp(-dt*5));
  car.root.position.set(state.x,smoothedGround+.04,state.z);car.root.rotation.set(visualPitch,state.yaw,0,'YXZ');
  const shiftProgress=state.shiftRemaining>0?1-state.shiftRemaining/state.shiftDuration:0;
  car.update({steer:state.steer,speed:state.speed,dt:mode==='race'?dt:0,shift:shiftProgress,rpm:state.rpm,gear:state.speed<-.4?'R':state.gear,brake:state.brake,cameraMode,wheels:state.wheels,suspension:state.suspension});
  car.root.updateMatrixWorld(true);
  const a=car.cameraAnchors;
  const position=cameraMode===0?a.chasePosition:cameraMode===1?a.hoodPosition:a.cockpitPosition;
  const target=cameraMode===0?a.chaseTarget:cameraMode===1?a.hoodTarget:a.cockpitTarget;
  targetCamera.copy(car.root.localToWorld(position.clone()));cameraLook.copy(car.root.localToWorld(target.clone()));
  if(cameraMode===0){camera.up.set(0,1,0);targetCamera.y=Math.max(targetCamera.y,world.heightAt(targetCamera.x,targetCamera.z)+1);const smooth=1-Math.exp(-dt*7);if(cameraSnap){camera.position.copy(targetCamera);smoothedLook.copy(cameraLook)}else{camera.position.lerp(targetCamera,smooth);smoothedLook.lerp(cameraLook,smooth)}camera.lookAt(smoothedLook)}
  else{
    // Both onboard cameras are rigid in the same coordinate system as the car.
    // No independent interpolation, shake or asynchronous target smoothing.
    camera.position.copy(targetCamera);camera.up.set(0,1,0).applyQuaternion(car.root.quaternion);camera.lookAt(cameraLook);
  }
  cameraSnap=false;
  sun.position.set(state.x+45,ground+70,state.z+25);sun.target.position.set(state.x,ground,state.z);sun.target.updateMatrixWorld();
  const wet=world.weather?.wetness||0,night=stage.weather==='night';ambient.intensity=night?.15:wet>.25?1.25:1.85;sun.intensity=night?.08:stage.weather==='fog'?1.0:wet>.25?1.6:3.0;
  world.update?.(dt,car.root.position,elapsed);
  const activeGate=Math.min(race.nextGate,world.gates.length-1);world.gates.forEach((g,i)=>{g.material?.color?.setHex(i===activeGate?0xd8ff59:0x9cab9a);if(g.material)g.material.emissiveIntensity=i===activeGate?.35:0;});
  audio.duck=copilot.speaking ? .55 : 1;audio.update(state,mode==='race'||mode==='countdown',cameraMode);
}
function frame(t){
  const dt=Math.min((t-lastTime)/1000||0,.08);lastTime=t;
  if(mode==='race'||mode==='countdown'){accumulator+=dt;while(accumulator>=1/120){tick(1/120);accumulator-=1/120;}}
  else accumulator=0;
  effects(dt);visuals(dt,t);if((uiTimer+=dt)>.075){updateUI();uiTimer=0;}
  if(mode!=='menu'||tab==='garage')renderer.render(scene,camera);
  else if(audio.ready)audio.update(state,false,cameraMode);
  requestAnimationFrame(frame);
}
refreshCar();renderMenus();cameraView(cameraMode,false);persistOptions();clearEffects();changeMode('menu');setTab('championship');requestAnimationFrame(frame);
Object.defineProperty(window,'rallyState',{get:()=>({mode,tab,sessionMode,stageId:stage.id,cameraMode,headlights,gear:state.gear,rpm:state.rpm,speed:state.speed,steer:state.steer,shift:state.shiftRemaining,wheel:car?.wheelSpin?.rotation.z,hand:car?.hands?.[1]?.hand?.position.toArray(),position:[state.x,state.z],camera:camera.position.toArray(),cameraLocal:car?car.root.worldToLocal(camera.position.clone()).toArray():null,elapsed,nextGate:race?.nextGate,completed:race?.completed,manual:state.manual,audio:audio.ready,audioLevel:audio.level(),paceNote:copilot.text,career:JSON.parse(JSON.stringify(career.data)),distance:courseDistance,length:world?.length,drawCalls:renderer.info.render.calls})});
