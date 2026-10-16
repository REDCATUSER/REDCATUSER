import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,normalizeBindings,held,matches,DEFAULT_BINDINGS} from '../app/settings.js';
import {createCareer,CAREER_STORAGE_KEY} from '../app/career.js';

test('older saves retain settings and archive the times from the previous courses',()=>{
 const old={settings:{volume:43,manual:true,quality:'high'},records:{'alps-1':172},active:{championshipId:'alps',stageIndex:1,playerTimes:[172],stageComplete:false}};
 const storage={getItem:key=>key===CAREER_STORAGE_KEY?JSON.stringify(old):null,setItem(){}};
 const loaded=createCareer(storage).data;
 assert.equal(loaded.settings.volume,43);assert.equal(loaded.settings.manual,true);assert.equal(loaded.settings.engineVolume,100);
 assert.deepEqual(loaded.legacyRecords,old.records);assert.deepEqual(loaded.records,{});assert.equal(loaded.active,null);
});
test('render, language, mixes and remapped controls survive a save and reload',()=>{
 let saved;const storage={getItem:()=>saved,setItem:(k,v)=>saved=v};const career=createCareer(storage);
 career.setSettings({resolution:'1920x1080',windowMode:'fullscreen',textureQuality:'high',language:'de',musicVolume:0,engineVolume:31,copilotVolume:78,effectsVolume:18,bindings:{...DEFAULT_BINDINGS,shiftUp:['PageUp'],shiftDown:['PageDown']}});
 const s=createCareer(storage).data.settings;
 assert.equal(s.resolution,'1920x1080');assert.equal(s.windowMode,'fullscreen');assert.equal(s.textureQuality,'high');assert.equal(s.language,'de');
 assert.deepEqual([s.musicVolume,s.engineVolume,s.copilotVolume,s.effectsVolume],[0,31,78,18]);assert.deepEqual(s.bindings.shiftUp,['PageUp']);
 assert.equal(matches(s.bindings,'shiftDown','PageDown'),true);assert.equal(held(new Set(['ShiftLeft']),s.bindings,'shiftUp'),false);
});
test('malformed settings are bounded and conflicting keys cannot trigger two actions',()=>{
 const s=normalizeSettings({volume:NaN,musicVolume:900,engineVolume:-18,resolution:'99999x99999',language:'xx',windowMode:'javascript:foo',bindings:{throttle:['KeyH','BadKey'],headlights:['KeyH']}});
 assert.equal(s.volume,72);assert.equal(s.musicVolume,100);assert.equal(s.engineVolume,0);assert.equal(s.resolution,'native');assert.equal(s.language,'fr');
 assert.deepEqual(s.bindings.throttle,['KeyH']);assert.deepEqual(s.bindings.headlights,[]);assert.equal(normalizeSettings(null).camera,0);
 const b=normalizeBindings({throttle:['KeyI','KeyJ','KeyK','KeyL'],headlights:['KeyL']});assert.deepEqual(b.headlights,['KeyL']);
});

test('difficulty migrates older AI settings and keeps explicit free-sprint assist tuning',()=>{
 assert.equal(normalizeSettings().difficulty,'medium');
 assert.equal(normalizeSettings({ai:'casual'}).difficulty,'easy');
 assert.equal(normalizeSettings({ai:'pro'}).difficulty,'hard');
 assert.equal(normalizeSettings({difficulty:'hardcore',ai:'casual'}).difficulty,'hardcore');
 assert.equal(normalizeSettings({difficulty:'hardcore'}).assist,'expert');
 assert.equal(normalizeSettings({difficulty:'easy',assist:'expert'}).assist,'expert');
 let saved;const career=createCareer({getItem:()=>saved,setItem:(key,value)=>saved=value});
 career.setSettings({difficulty:'superEasy'});assert.equal(career.data.settings.assist,'comfort');
 career.setSettings({assist:'expert'});assert.equal(career.data.settings.difficulty,'superEasy');
 career.setSettings({difficulty:'hard'});assert.equal(career.data.settings.assist,'expert');
 career.setSettings({ai:'casual'});assert.equal(career.data.settings.difficulty,'easy');assert.equal(career.data.settings.assist,'comfort');
 career.setSettings({difficulty:'hardcore',assist:'sport'});
 const loaded=createCareer(career.storage);assert.equal(loaded.data.settings.difficulty,'hardcore');assert.equal(loaded.data.settings.assist,'sport');
});
