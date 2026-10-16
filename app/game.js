import * as T from 'three';
import { STAGES, CARS, CHAMPIONSHIPS } from './content.js';
import { makeWorld, getStagePreview } from './world.js';
import { createCar } from './car.js';
import { RallyAudio } from './audio.js';
import { Copilot } from './copilot.js';
import { createState, integrate, shift, clamp, resetDynamics } from './physics.js';
import { createCareer } from './career.js';
import { createRaceProgress } from './race.js';
import { sampleTerrain } from './terrain.js';
import { held, matches, keyLabel } from './settings.js';
import { SettingsPanel } from './settings-ui.js';
import { HouseMusic } from './music.js';
import { validateVoicePack, loadVoicePacks, saveVoicePack, deleteVoicePack } from './voices.js';
import {makePresentation} from './presentation.js';
import {GamepadInput} from './gamepad.js';
import {medalFor,medalTargets,MEDAL_LABELS,applyImpact,ghostKey,RunRecorder,loadGhost,saveGhost,sampleGhost,ghostTimeAt} from './performance.js';
import {makeGhost} from './ghost.js';

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
const presentation=makePresentation(renderer,scene),controller=new GamepadInput(),replay=makeGhost(scene);
let ghostRun=null,recorder=null,runKey='',runSerial=0,damage=0,sectorTTL=0,pbSplits=[],lastCountdown=4;
let mapBase=null,mapPoint=null,previewYaw=0,previewZoom=1,drag=null,lastMenuDraw=0,helpOpen=false;
let mode='menu', tab='championship', world=null, car=null, race=null, selectedStage=STAGES[0].id;
let selectedChampionship=career.data.active?.championshipId||CHAMPIONSHIPS[0].id, stage=STAGES[0], elapsed=0, penalties=0, countdown=3;
let cameraMode=Number(career.data.settings.camera)||0, headlights=false, practice=false, lastTime=0, accumulator=0;
const music=new HouseMusic();let settingsPanel;
let sessionMode='free',collisionObjects=[];
let cameraSnap=true, uiTimer=0, visualPitch=0, visualRoll=0, smoothedGround=0, courseDistance=0, lastEvent=null, lastChampResult=null;
const keys=new Set(), targetCamera=new T.Vector3(), cameraLook=new T.Vector3(), smoothedLook=new T.Vector3();
const carSpec=()=>CARS.find(c=>c.id===career.data.selectedCar)||CARS[0];
const formatTime=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;
const formatDistance=m=>`${(m/1000).toFixed(2)} km`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isDriving=()=>['race','countdown','paused','finished'].includes(mode);
function resize(){
  const preview=mode==='menu';
  const box=preview?(tab==='garage'?$('garagePreview'):$('heroPreview')):document.body;
  if(canvas.parentElement!==box)box.appendChild(canvas);
  Object.assign(canvas.style,preview?{position:'relative',inset:'auto',width:'100%',height:'100%'}:{position:'fixed',inset:'0',width:'100vw',height:'100vh'});
  const width=preview?box.clientWidth:innerWidth, height=preview?box.clientHeight:innerHeight;
  const settings=career.data.settings,fixed=!preview&&settings.resolution!=='native';
  const [rw,rh]=fixed?settings.resolution.split('x').map(Number):[Math.max(width,1),Math.max(height,1)];
  renderer.setPixelRatio(fixed?1:Math.min(devicePixelRatio,settings.quality==='low'?.85:settings.quality==='high'?1.75:1.3));
  renderer.setSize(rw,rh,false); camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();
}
function applyQuality(){
  const q=career.data.settings.quality;renderer.shadowMap.enabled=q!=='low'&&mode!=='menu';
  const shadowSize=q==='high'?2048:1024;if(sun.shadow.mapSize.x!==shadowSize){sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null}
  world?.setTextureQuality(career.data.settings.textureQuality);car?.setConfig({textureQuality:career.data.settings.textureQuality});resize();
  const materials=new Set();scene.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)});
  for(const m of materials){if(m.map&&m.bumpScale<.1){const bump=q==='low'?null:m.map;if(m.bumpMap!==bump){m.bumpMap=bump;m.needsUpdate=true}}if(m.isMeshPhysicalMaterial)m.clearcoat=q==='low'?0:.65}
}
async function applyDisplay(){
  const wanted=career.data.settings.windowMode;
  try{
    if(window.rallyDesktop)await window.rallyDesktop.setDisplay(wanted);
    else if(wanted==='fullscreen'&&!document.fullscreenElement)await document.documentElement.requestFullscreen();
    else if(wanted==='windowed'&&document.fullscreenElement)await document.exitFullscreen();
    $('displayStatus').textContent=wanted==='fullscreen'?'Plein écran activé.':'Mode fenêtré activé.';
  }catch{career.setSettings({windowMode:document.fullscreenElement?'fullscreen':'windowed'});settingsPanel?.sync();$('displayStatus').textContent='Plein écran indisponible. Réessayez avec ce sélecteur.'}
}
function hint(action){return (career.data.settings.bindings[action]||[]).map(keyLabel).join(' / ')||'non affectée'}
function updateControls(){
  $('camera').textContent=`VUE : ${['POURSUITE','CAPOT','PILOTE'][cameraMode]} · ${hint('camera')}`;
  $('headlights').textContent=`PHARES : ${headlights?'ON':'OFF'} · ${hint('headlights')}`;
  $('pause').textContent=`${mode==='paused'?'REPRENDRE':'PAUSE'} · ${hint('pause')}`;
  $('raceControls').textContent=`${hint('throttle')} ACCÉLÉRER · ${hint('brake')} FREINER · ${hint('left')} / ${hint('right')} TOURNER · ${hint('handbrake')} FREIN À MAIN · ${hint('camera')} CAMÉRA · ${hint('shiftUp')} RAPPORT + · ${hint('shiftDown')} RAPPORT − · ${hint('transmission')} BOÎTE · ${hint('headlights')} PHARES · ${hint('recover')} REPLACER`;
}

function changeMode(next){
  mode=next;document.body.dataset.mode=next;
  camera.fov=next==='menu'?(tab==='garage'?32:35):[62,69,82][cameraMode];camera.updateProjectionMatrix();
  $('menu').classList.toggle('hidden',next!=='menu');
  $('result').classList.toggle('hidden',next!=='finished');
  $('pauseMenu').classList.toggle('hidden',next!=='paused');
  for(const id of ['raceHeader','hud','telemetry','map','raceControls','paceNote'])$(id)?.classList.toggle('hidden',!isDriving());
  $('countdown').classList.toggle('hidden',next!=='countdown');
  if(next!=='race')keys.clear();if(next!=='race')copilot.stop();if(next==='paused')controller.block();presentation.root.visible=next==='menu';if(next==='menu')replay.root.visible=false;updateControls();applyQuality();
}
function refreshCar(){
  if(car)car.dispose();
  const spec=carSpec();car=createCar(scene,{...spec,id:spec.id,color:career.data.tuning.color,tuning:career.data.tuning,environment:presentation.environment,textureQuality:career.data.settings.textureQuality});
  car.setHeadlights(headlights);audio.setCar?.(spec);cameraSnap=true;applyQuality();
}
function cameraView(i,save=true){cameraMode=(Number(i)+3)%3;camera.fov=mode==='menu'?35:[62,69,82][cameraMode];camera.updateProjectionMatrix();cameraSnap=true;
  updateControls();
  $('cameraSetting').value=String(cameraMode);if(save)career.setSettings({camera:cameraMode});}
function setTab(next){
  tab=next;for(const p of document.querySelectorAll('[id^="panel-"]'))p.classList.toggle('hidden',p.id!==`panel-${next}`);
  document.querySelectorAll('#menuNav [data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===next);b.classList.toggle('active',b.dataset.tab===next)});
  if(mode==='menu'){camera.fov=next==='garage'?32:35;camera.updateProjectionMatrix();if(!car)refreshCar();if(world)world.root.visible=false;scene.background=new T.Color(0x0d1816);scene.fog=null;car.root.position.set(0,0,0);car.root.rotation.set(0,0,0);car.exterior.visible=true;presentation.root.visible=true;}
  $('heroPreview').style.visibility=next==='garage'?'hidden':'visible';lastMenuDraw=0;
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
  const aiLevel=active?.championshipId===chosen.id&&!active.finished?active.difficulty:career.data.settings.ai;
  $('championshipInfo').insertAdjacentHTML('beforeend',`<p class="panel-footnote">NIVEAU ${({casual:'AMATEUR',club:'CLUB',pro:'PRO'})[aiLevel]||'CLUB'}</p>`);
  $('tracks').innerHTML=STAGES.map(s=>`<button data-stage="${s.id}" class="stage-card ${s.id===selectedStage?'selected':''}"><span class="eyebrow">${esc(s.regionLabel||s.region)}</span><strong>${esc(s.name)}</strong><small>${formatDistance(s.length)} · ${esc(s.surfaceLabel||s.surface)} · ≈ ${Math.round(s.parTime/60*10)/10} min</small><span class="medal-badge ${medalFor(s,career.data.records[s.id])}">${MEDAL_LABELS[medalFor(s,career.data.records[s.id])]}</span></button>`).join('');
  const free=STAGES.find(s=>s.id===selectedStage)||STAGES[0],route=getStagePreview(free),xs=route.points.map(p=>p.x),zs=route.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const path=route.points.map(p=>[30+(p.x-minX)/(maxX-minX||1)*180,18+(maxZ-p.z)/(maxZ-minZ||1)*150].join(',')).join(' '),targets=medalTargets(free),summary=career.medals();
  $('stageInfo').innerHTML=`<span class="eyebrow">${esc(free.regionLabel)}</span><h3>${esc(free.name)}</h3><svg class="route-preview" viewBox="0 0 240 190" aria-label="Tracé de la spéciale"><polyline class="road-outline" points="${path}"/><polyline class="road-line" points="${path}"/><circle cx="${path.split(' ')[0].split(',')[0]}" cy="18" r="5" fill="white"/><text x="15" y="184" fill="#9eb5a4" font-size="8">DÉPART → ARRIVÉE · POINT À POINT</text></svg><div class="stage-facts"><div><b>${formatDistance(route.length)}</b><small>DISTANCE</small></div><div><b>+${route.ascent} m</b><small>DÉNIVELÉ</small></div><div><b>9</b><small>SECTEURS</small></div></div><p>${esc(free.description)}</p><div class="medal-targets">${['gold','silver','bronze'].map(m=>`<span>${MEDAL_LABELS[m]} ${formatTime(targets[m])}</span>`).join('')}</div><p>Record : ${career.data.records[free.id]?formatTime(career.data.records[free.id]):'à établir'}</p>`;
  $('medalProgress').textContent=`${summary.gold} OR · ${summary.silver} ARGENT · ${summary.bronze} BRONZE / 18 SPÉCIALES`;
  $('cars').innerHTML=CARS.map(c=>{const unlocked=career.data.unlockedCars.includes(c.id);return `<button data-car="${c.id}" class="car-card ${c.id===career.data.selectedCar?'selected':''}" ${unlocked?'':'disabled'}><strong>${esc(c.name)}</strong><small>${c.power} ch · ${c.mass} kg ${unlocked?'':'· À DÉBLOQUER'}</small></button>`}).join('');
  $('carInfo').innerHTML=`<h3>${esc(carSpec().name)}</h3><p>${esc(carSpec().description)}</p>`;
  for(const [id,key] of [['carColor','color'],['tires','tires'],['suspension','suspension'],['gearing','gearing']])$(id).value=career.data.tuning[key];
  settingsPanel?.sync();
  $('status').textContent=`${career.data.completedChampionships.length} / 5 championnats gagnés · ${career.data.unlockedCars.length} / ${CARS.length} voitures · ${career.storageAvailable?'Sauvegarde locale':'Stockage indisponible : session uniquement'}`;
}
function persistOptions(changed){
  const settings=career.data.settings;
  state.manual=settings.manual;audio.volume=settings.volume/100;audio.setMix({engine:settings.engineVolume/100,effects:settings.effectsVolume/100});
  copilot.volume=audio.volume*settings.copilotVolume/100;copilot.enabled=settings.copilot&&audio.enabled;
  if(!copilot.enabled)copilot.stop();
  if(changed==='language'||!changed)copilot.setLanguage(settings.language).catch(()=>{$('voiceStatus').textContent='Impossible de lire ce pack vocal.'});
  if(['manual','assist','damage'].includes(changed)&&isDriving()){recorder?.invalidate();ghostRun=null;}
  cameraView(settings.camera,false);if(['quality','textureQuality','resolution'].includes(changed)||!changed)applyQuality();
  if(changed==='windowMode')applyDisplay();keys.clear();updateControls();
}

$('menuNav').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)};
$('championships').onclick=e=>{const b=e.target.closest('[data-championship]');if(b&&!b.disabled){selectedChampionship=b.dataset.championship;renderMenus()}};
$('tracks').onclick=e=>{const b=e.target.closest('[data-stage]');if(b){selectedStage=b.dataset.stage;renderMenus()}};
$('cars').onclick=e=>{const b=e.target.closest('[data-car]');if(b&&!b.disabled){career.selectCar(b.dataset.car);refreshCar();renderMenus()}};
for(const id of ['carColor','tires','suspension','gearing'])$(id).addEventListener('input',()=>{career.setTuning({color:$('carColor').value,tires:$('tires').value,suspension:$('suspension').value,gearing:$('gearing').value});refreshCar();});
function unlockAudio(){
  audio.start().then(()=>music.start(audio.ctx)).catch(()=>{$('notice').textContent='Le moteur audio n’a pas pu démarrer.'});
  copilot.start(audio.ctx).catch(()=>{$('notice').textContent='Copilote audio indisponible.'});
}
addEventListener('pointerdown',unlockAudio,{once:true});addEventListener('keydown',unlockAudio,{once:true});

function recover(index,charge=true){
  if(charge)recorder?.invalidate();
  const gate=world.gates[index],forward=new T.Vector3(-Math.sin(gate.yaw),0,-Math.cos(gate.yaw));
  resetDynamics(state);state.x=gate.point.x+forward.x*2;state.z=gate.point.z+forward.z*2;state.yaw=gate.yaw;
  state.gear=1;state.rpm=950;state.collision=0;race.resetPosition(state.x,state.z);courseDistance=gate.distance+2;copilot.reset(world.notes);cameraSnap=true;
  smoothedGround=world.heightAt(state.x,state.z);visualPitch=visualRoll=0;if(charge&&!practice){elapsed+=5;penalties+=5}keys.clear();
}
function beginStage(id){
  stage=STAGES.find(s=>s.id===id)||STAGES[0];if(world)world.dispose();
  world=makeWorld(scene,stage,STAGES.indexOf(stage),{textureQuality:career.data.settings.textureQuality});collisionObjects=[...(world.obstacles||[]),...(world.barriers||[])];race=createRaceProgress(world.gates,{radius:Math.min(12,world.roadWidth||11)});
  elapsed=0;penalties=0;countdown=3;lastCountdown=4;accumulator=0;courseDistance=0;lastEvent=null;lastChampResult=null;damage=0;state.distanceTravelled=0;sectorTTL=0;$('sectorPopup').classList.add('hidden');
  recorder=new RunRecorder();ghostRun=null;replay.root.visible=false;pbSplits=[...(career.data.sectors[stage.id]||[])];runKey=ghostKey(stage,carSpec(),career.data.tuning,career.data.settings);const serial=++runSerial;
  loadGhost(runKey).then(run=>{if(serial===runSerial&&run?.key===runKey&&runKey===ghostKey(stage,carSpec(),career.data.tuning,career.data.settings))ghostRun=run}).catch(()=>{});setupMap();
  state.manual=career.data.settings.manual;refreshCar();recover(0,false);clearEffects();copilot.reset(world.notes);unlockAudio();
  $('stageName').textContent=stage.name;cameraView(career.data.settings.camera,false);changeMode('countdown');$('countdown').textContent='3';updateUI();
}
$('start').onclick=()=>{practice=!!$('practice')?.checked;sessionMode='free';if(!career.data.active)career.startFree(selectedStage);beginStage(selectedStage)};
$('startChampionship').onclick=()=>{practice=false;sessionMode='championship';let id;const active=career.data.active;
  if(active?.championshipId===selectedChampionship&&!active.finished){id=active.stageComplete?career.nextStage():career.currentStageId()}
  else id=career.startChampionship(selectedChampionship);
  if(id)beginStage(id);
};
function goHome(){closeHelp();if(settingsPanel?.isOpen)settingsPanel.close();copilot.stop();changeMode('menu');if(world)world.root.visible=false;renderMenus();setTab(tab)}
$('home').onclick=goHome;$('quit').onclick=goHome;
$('continue').onclick=()=>{const id=career.nextStage();if(id)beginStage(id);else goHome()};
$('again').onclick=()=>{practice=!!$('practice')?.checked;beginStage(stage.id)};
function pause(){if(helpOpen){closeHelp();return}if(settingsPanel?.isOpen){settingsPanel.close();return}if(mode==='race'||mode==='countdown')changeMode('paused');else if(mode==='paused')changeMode(countdown>0?'countdown':'race')}
$('restart').onclick=()=>beginStage(stage.id);$('pauseSettings').onclick=()=>{keys.clear();settingsPanel.open()};
$('pause').onclick=pause;$('resume').onclick=pause;$('camera').onclick=()=>cameraView(cameraMode+1);
function toggleLights(){headlights=!headlights;car?.setHeadlights(headlights);updateControls()}
$('headlights').onclick=toggleLights;
function toggleSound(){audio.enabled=!audio.enabled;copilot.enabled=career.data.settings.copilot&&audio.enabled;$('sound').textContent=`SON : ${audio.enabled?'ON':'OFF'}`;if(!audio.enabled)copilot.stop();unlockAudio()}
$('sound').onclick=toggleSound;
addEventListener('keydown',e=>{
  if(helpOpen){if(e.code==='Escape'){e.preventDefault();closeHelp()}return}
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement)return;
  const bindings=career.data.settings.bindings,action=name=>matches(bindings,name,e.code);
  if(settingsPanel?.isOpen){if(e.code==='Escape'||action('pause')){e.preventDefault();settingsPanel.close()}return}
  if(isDriving()&&Object.values(bindings).some(list=>list.includes(e.code)))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;if(action('pause')){pause();return}if(!isDriving())return;
  if(action('camera'))cameraView(cameraMode+1);if(action('chase'))cameraView(0);if(action('hood'))cameraView(1);if(action('cockpit'))cameraView(2);
  if(action('headlights'))toggleLights();if(action('mute'))toggleSound();if(mode!=='race')return;
  if(action('recover'))recover(race.lastValidIndex);
  if(action('transmission')){recorder?.invalidate();ghostRun=null;state.manual=!state.manual;career.setSettings({manual:state.manual});$('manual').checked=state.manual}
  if(state.manual){if(action('shiftUp'))shift(state,state.gear+1);if(action('shiftDown'))shift(state,state.gear-1)}
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{controller.block();keys.clear();if(mode==='race'||mode==='countdown')pause()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='race'||mode==='countdown'))pause()});
addEventListener('resize',resize);
document.addEventListener('fullscreenchange',()=>{if(!window.rallyDesktop){career.setSettings({windowMode:document.fullscreenElement?'fullscreen':'windowed'});settingsPanel?.sync()}resize()});

function showHelp(){
  if(mode==='race'||mode==='countdown')pause();keys.clear();controller.block();helpOpen=true;
  $('helpKeys').textContent=`${hint('throttle')} : accélérer · ${hint('brake')} : freiner · ${hint('shiftUp')} / ${hint('shiftDown')} : rapports · ${hint('camera')} : caméra · ${hint('headlights')} : phares · ${hint('recover')} : replacer`;
  $('helpOverlay').classList.remove('hidden');$('closeHelp').focus();
}
function closeHelp(){if(!helpOpen)return;helpOpen=false;$('helpOverlay').classList.add('hidden');(mode==='menu'?$('helpButton'):$('pauseHelp')).focus()}
$('helpButton').onclick=showHelp;$('pauseHelp').onclick=showHelp;$('closeHelp').onclick=closeHelp;
canvas.addEventListener('pointerdown',e=>{if(mode==='menu'){drag={x:e.clientX,start:previewYaw};canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointermove',e=>{if(drag){previewYaw=drag.start+(e.clientX-drag.x)*.008;lastMenuDraw=0}});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{if(mode==='menu'&&tab==='garage'){e.preventDefault();previewZoom=clamp(previewZoom+e.deltaY*.0008,.8,1.35);lastMenuDraw=0}},{passive:false});
function focusController(direction){
  const container=helpOpen?$('helpOverlay'):settingsPanel?.isOpen?$('settingsOverlay'):mode==='paused'?$('pauseMenu'):$(`panel-${tab}`);
  const options=[...container.querySelectorAll('button:not(:disabled),select,input:not([type=file])')].filter(el=>el.getClientRects().length&&!el.closest('.hidden'));
  const current=options.indexOf(document.activeElement),index=(current+direction+options.length)%options.length;options[index]?.focus();
}
function activateController(direction=0){
  const element=document.activeElement;
  if(element instanceof HTMLSelectElement){element.selectedIndex=clamp(element.selectedIndex+(direction||1),0,element.options.length-1);element.dispatchEvent(new Event('change',{bubbles:true}))}
  else if(element instanceof HTMLInputElement){if(element.type==='checkbox')element.click();else if(element.type==='range'){element.value=String(clamp(Number(element.value)+(direction||1)*5,Number(element.min),Number(element.max)));element.dispatchEvent(new Event('input',{bubbles:true}))}}
  else if(!direction&&element instanceof HTMLButtonElement)element.click();
}
function pollController(){
  let pads=[];try{pads=navigator.getGamepads?.()||[]}catch{}
  const connected=controller.connected;controller.poll(pads,career.data.settings);if(connected&&!controller.connected&&(mode==='race'||mode==='countdown'))pause();
  const status=controller.connected?(controller.armed?'Manette standard connectée · RT / LT et stick gauche prêts.':'Relâchez le stick et les gâchettes pour reprendre.'):'Appuyez sur une touche de votre manette pour la détecter.';if($('controllerStatus').textContent!==status)$('controllerStatus').textContent=status;
  if(!controller.connected)return;const pressed=controller.pressed;if(pressed.size)unlockAudio();
  if(helpOpen){if(pressed.has('handbrake')||pressed.has('headlights')||pressed.has('pause'))closeHelp();return}
  if(settingsPanel?.isOpen){if(pressed.has('pause')||pressed.has('headlights'))settingsPanel.close();else if(!settingsPanel.capture){if(pressed.has('up'))focusController(-1);if(pressed.has('down'))focusController(1);if(pressed.has('handbrake'))activateController();if(pressed.has('left'))activateController(-1);if(pressed.has('right'))activateController(1)}return}
  if(mode==='menu'){
    if(pressed.has('shiftUp')||pressed.has('shiftDown')){const tabs=['championship','free','garage','options'];setTab(tabs[(tabs.indexOf(tab)+(pressed.has('shiftUp')?1:3))%4]);focusController(1)}
    if(pressed.has('up'))focusController(-1);if(pressed.has('down'))focusController(1);if(pressed.has('handbrake'))activateController();
    if(pressed.has('pause')){if(tab==='championship')$('startChampionship').click();else if(tab==='free')$('start').click()}return;
  }
  if(mode==='paused'){if(pressed.has('pause')||pressed.has('headlights'))pause();if(pressed.has('up'))focusController(-1);if(pressed.has('down'))focusController(1);if(pressed.has('handbrake'))activateController();return}
  if(mode==='finished'){if(pressed.has('handbrake'))(!$('continue').classList.contains('hidden')?$('continue'):$('home')).click();return}
  if(pressed.has('pause')){pause();return}if(pressed.has('camera'))cameraView(cameraMode+1);if(pressed.has('headlights'))toggleLights();if(mode!=='race')return;
  if(pressed.has('recover'))recover(race.lastValidIndex);if(pressed.has('transmission')){recorder?.invalidate();ghostRun=null;state.manual=!state.manual;career.setSettings({manual:state.manual});$('manual').checked=state.manual}
  if(state.manual){if(pressed.has('shiftUp'))shift(state,state.gear+1);if(pressed.has('shiftDown'))shift(state,state.gear-1)}
}
function setupMap(){
  mapBase=document.createElement('canvas');mapBase.width=180;mapBase.height=150;const ctx=mapBase.getContext('2d'),p=world.samples,minX=Math.min(...p.map(a=>a.x)),maxX=Math.max(...p.map(a=>a.x)),minZ=Math.min(...p.map(a=>a.z)),maxZ=Math.max(...p.map(a=>a.z));
  const scale=Math.min(145/(maxX-minX||1),115/(maxZ-minZ||1));mapPoint=a=>[18+(a.x-minX)*scale,15+(a.z-minZ)*scale];
  ctx.lineWidth=3;ctx.strokeStyle='#a5bda8';ctx.beginPath();p.forEach((a,i)=>i?ctx.lineTo(...mapPoint(a)):ctx.moveTo(...mapPoint(a)));ctx.stroke();
}

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
  const newBest=!practice&&career.recordRun(stage.id,elapsed,race.splits);
  $('resultMedal').className='result-medal '+medalFor(stage,elapsed);$('resultMedal').textContent=practice?'ENTRAÎNEMENT':(newBest?'NOUVEAU RECORD · ':'')+MEDAL_LABELS[medalFor(stage,elapsed)];
  $('ghostResult').textContent=practice?'Entraînement : aucun record enregistré.':recorder?.valid?'Validation du fantôme personnel…':'Fantôme non enregistré : replacement ou réglages modifiés.';
  const recording=!practice&&recorder?.finish({key:runKey,time:elapsed,splits:race.splits,car:carSpec().id}),serial=runSerial;
  if(recording)saveGhost(recording).then(saved=>{if(serial===runSerial)$('ghostResult').textContent=saved?'Fantôme personnel enregistré pour cette configuration.':'Votre meilleur fantôme est conservé.'}).catch(()=>{if(serial===runSerial)$('ghostResult').textContent='Fantôme non conservé : stockage indisponible.'});
  else if(!practice&&recorder?.valid)$('ghostResult').textContent='Fantôme non enregistré pour cette tentative.';
  $('sectorResults').innerHTML=`<details><summary>VOIR LES 9 SECTEURS</summary><div class="sector-grid">${race.splits.map((v,i)=>`<div>SECTEUR ${i+1}<strong>${formatTime(v-(race.splits[i-1]||0))}</strong></div>`).join('')}</div></details>`;
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
  if(mode==='countdown'){countdown-=dt;const number=Math.max(0,Math.ceil(countdown));$('countdown').textContent=number?String(number):'PARTEZ !';if(number!==lastCountdown){lastCountdown=number;audio.countdown(number===0)}if(countdown<=0)changeMode('race');return}
  if(mode!=='race'||!world)return;elapsed+=dt;
  const near=world.nearest(state.x,state.z),ground=sampleTerrain(world.heightAt,state.x,state.z,state.yaw);
  state.surface=near.surface||stage.surface;
  const binding=career.data.settings.bindings,down=action=>held(keys,binding,action);
  const pad=controller.input,keyboardSteer=Number(down('right'))-Number(down('left'));
  integrate(state,{throttle:Math.max(Number(down('throttle')),pad.throttle),brake:Math.max(Number(down('brake')),pad.brake),steer:keyboardSteer||pad.steer,handbrake:down('handbrake')||pad.handbrake},dt,{surface:near.surface||stage.surface,offroad:near.dist>(world.roadWidth||11)/2,wetness:world.weather?.wetness||0,slope:ground.pitch,crossSlope:ground.roll,roughness:near.roughness||0,tuning:career.data.tuning,car:carSpec(),assist:career.data.settings.assist,damage:career.data.settings.damage?damage:0});
  if(state.collision===0){const candidates=near.dist>(world.roadWidth||11)/2-1?collisionObjects:[];
    for(const o of candidates){if(o.distance!==undefined&&Math.abs(o.distance-near.distance)>35)continue;const dx=state.x-o.x,dz=state.z-o.z,d=Math.hypot(dx,dz),radius=(o.r||.4)+.85;
      if(d<radius){const nx=d>.01?dx/d:Math.cos(state.yaw),nz=d>.01?dz/d:-Math.sin(state.yaw);state.x=o.x+nx*(radius+.05);state.z=o.z+nz*(radius+.05);const dot=state.vx*nx+state.vz*nz;if(dot<0){damage=career.data.settings.damage?applyImpact(damage,-dot):0;if(career.data.settings.vibration)controller.rumble(Math.min(1,-dot/25));state.vx-=dot*1.2*nx;state.vz-=dot*1.2*nz;}state.vx*=.55;state.vz*=.55;state.yawRate*=.35;state.collision=.45;break;}
    }
  }
  const current=world.nearest(state.x,state.z);courseDistance=clamp(current.distance||0,0,world.length);
  if(current.dist>150){recover(race.lastValidIndex);return}
  recorder?.add(elapsed,state,courseDistance);
  const event=race.update(state.x,state.z,elapsed);if(event){lastEvent=event;if(!event.finished){const delta=pbSplits[event.index-1]?event.total-pbSplits[event.index-1]:null;$('sectorPopup').innerHTML=`SECTEUR ${event.index} · ${formatTime(event.split)}<strong>${delta===null?'':(delta>0?'+':'−')+Math.abs(delta).toFixed(2)+' s'}</strong>`;sectorTTL=3;$('sectorPopup').classList.remove('hidden')}if(event.finished){finish();return;}}
  copilot.update(courseDistance,Math.abs(state.speed),mode==='race');
}
function updateUI(){
  if(!world||!race)return;
  $('time').textContent=formatTime(elapsed);$('speed').textContent=Math.round(Math.abs(state.speed)*3.6);$('gear').textContent=state.speed<-.4?'R':state.gear;$('gearMode').textContent=state.manual?'MANUEL':'AUTO';
  $('rpm').textContent=Math.round(state.rpm/50)*50;$('rpmBar').style.width=clamp(state.rpm/7400*100,0,100)+'%';$('rpmBar').style.background=state.rpm>6500?'#ff754a':'#d8ff59';
  $('best').textContent='RECORD '+(career.data.records[stage.id]?formatTime(career.data.records[stage.id]):'—');
  $('progress').textContent=`CHECKPOINT ${race.completed} / ${world.gates.length-1}`;$('distance').textContent=`${formatDistance(courseDistance)} / ${formatDistance(world.length)}`;
  $('notice').textContent=state.collision>0?`CONTACT · ${hint('recover')} : REPLACER`:state.offroad?'HORS PISTE':`PÉNALITÉS ${penalties} S · ${(stage.surfaceLabel||stage.surface).toUpperCase()}`;
  const note=copilot.current,code=note?.code||'',left=code.startsWith('left')||code==='hairpinLeft',right=code.startsWith('right')||code==='hairpinRight';
  $('paceDirection').textContent=left?'↶':right?'↷':code==='finish'?'⚑':'↑';$('paceGrade').textContent=code.match(/[1-6]/)?.[0]||'';$('paceText').textContent=copilot.text||'SUIVEZ LES CHECKPOINTS';
  $('stageProgressBar').style.width=Math.min(100,courseDistance/world.length*100)+'%';
  const reference=ghostTimeAt(ghostRun,courseDistance),delta=reference===null?null:elapsed-reference;
  $('liveDelta').textContent=delta===null?(ghostRun?'FANTÔME PRÊT':'ÉTABLISSEZ VOTRE FANTÔME'):`${delta>0?'+':'−'}${Math.abs(delta).toFixed(2)} s / VOTRE FANTÔME`;$('liveDelta').className='live-delta '+(delta===null?'':delta<0?'ahead':'behind');
  const condition=career.data.settings.damage?Math.round((1-damage)*100):100;$('conditionBar').style.width=condition+'%';$('conditionBar').style.background=condition<40?'#f28a60':'#d7ff5c';$('conditionValue').textContent=career.data.settings.damage?condition+' %':'OFF';
  if(mapBase&&mapPoint){mapContext.clearRect(0,0,180,150);mapContext.drawImage(mapBase,0,0);mapContext.fillStyle='#d8ff59';mapContext.beginPath();mapContext.arc(...mapPoint(world.gates[Math.min(race.nextGate,world.gates.length-1)].point),4,0,Math.PI*2);mapContext.fill();mapContext.fillStyle='#fff';mapContext.beginPath();mapContext.arc(...mapPoint(state),3,0,Math.PI*2);mapContext.fill();}

}
function visuals(dt,t){
  if(mode==='menu'){
    if(!car)return;
    car.root.rotation.set(0,t*.000045+previewYaw,0);car.root.position.set(0,0,0);ambient.intensity=2.1;sun.intensity=3.1;scene.environmentIntensity=.8;camera.up.set(0,1,0);
    car.update({steer:0,speed:0,dt:0,shift:0,rpm:950,gear:1,brake:0,cameraMode:0,environmentLight:.8});
    camera.position.set(3.2*previewZoom,2.35*previewZoom,4.3*previewZoom);camera.lookAt(0,.85,0);sun.position.set(8,12,5);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld();return;
  }
  if(!car||!world)return;world.root.visible=true;presentation.root.visible=false;scene.environmentIntensity=stage.weather==='night'?.06:.45;
  replay.update(career.data.settings.ghost?sampleGhost(ghostRun,elapsed):null,world.heightAt,state,cameraMode);
  const contact=sampleTerrain(world.heightAt,state.x,state.z,state.yaw),ground=contact.height;
  smoothedGround=mode==='countdown'?ground:smoothedGround+(ground-smoothedGround)*(1-Math.exp(-dt*20));
  visualPitch+=(contact.pitch-visualPitch)*(1-Math.exp(-dt*8));visualRoll+=(contact.roll-visualRoll)*(1-Math.exp(-dt*8));
  car.root.position.set(state.x,smoothedGround+.04,state.z);car.root.rotation.set(visualPitch,state.yaw,visualRoll,'YXZ');
  const shiftProgress=state.shiftRemaining>0?1-state.shiftRemaining/state.shiftDuration:0;
  car.update({steer:state.steer,speed:state.speed,dt:mode==='race'?dt:0,shift:shiftProgress,rpm:state.rpm,gear:state.speed<-.4?'R':state.gear,brake:state.brake,cameraMode,environmentLight:stage.weather==='night'?.06:.5,wheels:state.wheels,suspension:state.suspension,roll:-state.lateralAcceleration*.003,dirt:Math.min(.65,state.distanceTravelled/4500*(stage.surface==='sand'?.9:stage.surface==='snow'?.35:.65))});
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
  const dt=Math.min((t-lastTime)/1000||0,.25);lastTime=t;pollController();
  if(sectorTTL>0&&mode==='race'){sectorTTL-=dt;if(sectorTTL<=0)$('sectorPopup').classList.add('hidden')}
  if(mode==='race'||mode==='countdown'){accumulator+=dt;while(accumulator>=1/120){tick(1/120);accumulator-=1/120;}}
  else accumulator=0;
  effects(dt);visuals(dt,t);music.update({enabled:audio.enabled,master:career.data.settings.volume/100,volume:career.data.settings.musicVolume/100,mode,duck:copilot.speaking?.4:1});if((uiTimer+=dt)>.075){updateUI();uiTimer=0;}
  if(mode!=='menu')renderer.render(scene,camera);else if(t-lastMenuDraw>160){const box=canvas.parentElement.getBoundingClientRect();if(box.bottom>0&&box.top<innerHeight){renderer.render(scene,camera);lastMenuDraw=t}}
  if(mode==='menu'&&audio.ready)audio.update(state,false,cameraMode);
  requestAnimationFrame(frame);
}
settingsPanel=new SettingsPanel({career,apply:persistOptions,
  voiceInfo:custom=>{const info=copilot.voiceInfo;if(custom)return info.kind==='imported';return info.kind==='imported'?`Pack personnel : ${info.name} · ${info.author} · ${info.license}`:info.kind==='mixed'?'Anglais : voix AB enregistrée pour les virages et l’arrivée ; synthèse pour les annonces complémentaires.':'Voix synthétique hors ligne. Un pack humain enregistré peut être importé.'},
  onImport:async input=>{const pack=validateVoicePack(input);if(audio.ctx){for(const clip of Object.values(pack.clips))await audio.ctx.decodeAudioData(Uint8Array.from(atob(clip.url.split(',')[1]),c=>c.charCodeAt(0)).buffer)}await saveVoicePack(pack);await copilot.setPack(pack);career.setSettings({language:pack.language});await copilot.setLanguage(pack.language);settingsPanel.sync()},
  onClear:async()=>{const language=career.data.settings.language;await deleteVoicePack(language);await copilot.clearPack(language)}
});
loadVoicePacks().then(async packs=>{for(const pack of packs)if(['fr','en','de'].includes(pack?.language)&&pack?.clips)await copilot.setPack(pack);settingsPanel.updateVoiceStatus()}).catch(()=>{});
if(window.rallyDesktop)applyDisplay();
refreshCar();renderMenus();cameraView(cameraMode,false);persistOptions();clearEffects();changeMode('menu');setTab('championship');requestAnimationFrame(frame);
Object.defineProperty(window,'rallyState',{get:()=>({mode,tab,sessionMode,stageId:stage.id,cameraMode,fov:camera.fov,headlights,gear:state.gear,rpm:state.rpm,speed:state.speed,steer:state.steer,shift:state.shiftRemaining,wheel:car?.wheelSpin?.rotation.z,hand:car?.hands?.[1]?.hand?.position.toArray(),position:[state.x,state.z],camera:camera.position.toArray(),cameraLocal:car?car.root.worldToLocal(camera.position.clone()).toArray():null,elapsed,nextGate:race?.nextGate,completed:race?.completed,manual:state.manual,audio:audio.ready,audioLevel:audio.level(),paceNote:copilot.text,career:JSON.parse(JSON.stringify(career.data)),distance:courseDistance,length:world?.length,drawCalls:renderer.info.render.calls,renderSize:[canvas.width,canvas.height],textureSize:car?.textureSize,visibleWheels:car?.wheels.filter(w=>w.pivot.visible).length,pitch:visualPitch,roll:visualRoll,settingsOpen:settingsPanel?.isOpen,musicReady:music.ready,musicLevel:music.level,voiceLanguage:copilot.language,voiceKind:copilot.voiceInfo?.kind,voiceReady:copilot.voiceReady,ghostReady:!!ghostRun,ghostVisible:replay.root.visible,recordingFrames:recorder?.frames.length,damage,controller:controller.connected,medals:career.medals(),mix:{engine:audio.engineVolume,effects:audio.effectsVolume,copilot:copilot.volume}})});
