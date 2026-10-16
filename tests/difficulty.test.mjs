import test from 'node:test';
import assert from 'node:assert/strict';
import {DIFFICULTIES,difficultyFor,normalizeDifficulty,legacyAIFor} from '../app/difficulty.js';
import {createCareer,CAREER_STORAGE_KEY} from '../app/career.js';

const memory=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};

test('the five difficulties progressively tighten rival times and assists',()=>{
 assert.deepEqual(DIFFICULTIES.map(d=>d.id),['superEasy','easy','medium','hard','hardcore']);
 assert.deepEqual(DIFFICULTIES.map(d=>d.label),['Super Facile','Facile','Moyen','Dur','Hardcore']);
 assert.deepEqual(DIFFICULTIES.map(d=>d.assist),['comfort','comfort','sport','expert','expert']);
 for(let i=1;i<DIFFICULTIES.length;i++){
  assert.ok(DIFFICULTIES[i-1].pace>DIFFICULTIES[i].pace);
  assert.ok(DIFFICULTIES[i-1].damageMultiplier<=DIFFICULTIES[i].damageMultiplier);
 }
 assert.deepEqual(DIFFICULTIES.filter(d=>d.hardcore).map(d=>d.id),['hardcore']);
 assert.ok(Object.isFrozen(DIFFICULTIES));assert.ok(Object.isFrozen(difficultyFor('medium')));
});

test('legacy AI identifiers migrate and malformed identifiers use a real default policy',()=>{
 for(const [legacy,newId] of [['casual','easy'],['club','medium'],['pro','hard']]){
  assert.equal(normalizeDifficulty(legacy),newId);
  assert.equal(normalizeDifficulty(undefined,legacy),newId);
 }
 assert.equal(normalizeDifficulty('hardcore','casual'),'hardcore');
 for(const value of [null,{},[],NaN,'unknown','toString','constructor','__proto__']){
  assert.equal(normalizeDifficulty(value),'medium');
  assert.equal(difficultyFor(value),difficultyFor('medium'));
 }
 assert.equal(legacyAIFor('superEasy'),'casual');assert.equal(legacyAIFor('hardcore'),'pro');
});

test('all five difficulties produce different score-only rival times, locked for a championship',()=>{
 const totals=[];
 for(const difficulty of DIFFICULTIES){
  const storage=memory(),career=createCareer(storage);
  career.setSettings({difficulty:difficulty.id});career.startChampionship('alps');career.recordStage(200);
  const rivals=career.getStandings().filter(r=>!r.isPlayer);
  career.setSettings({difficulty:'superEasy'});
  const loaded=createCareer(storage);
  assert.equal(loaded.data.active.difficulty,difficulty.id);
  assert.deepEqual(loaded.getStandings().filter(r=>!r.isPlayer),rivals);
  totals.push(rivals[0].totalTime);
 }
 for(let i=1;i<totals.length;i++)assert.ok(totals[i-1]>totals[i]);
});

test('v6 course migration preserves earned cars, preferences and older archived records',()=>{
 const store=memory();store.setItem(CAREER_STORAGE_KEY,JSON.stringify({version:3,courseVersion:6,
  completedChampionships:['alps','dakar'],selectedCar:'escort',settings:{ai:'pro',language:'de'},
  legacyRecords:{'alps-2':160},records:{'alps-1':150},
  active:{championshipId:'france',stageIndex:1,playerTimes:[200],stageComplete:false,difficulty:'pro'}}));
 const career=createCareer(store);
 assert.equal(career.data.courseVersion,7);assert.deepEqual(career.data.records,{});assert.equal(career.data.active,null);
 assert.deepEqual(career.data.legacyRecords,{'alps-1':150,'alps-2':160});
 assert.deepEqual(career.data.completedChampionships,['alps','dakar']);assert.equal(career.data.selectedCar,'escort');
 assert.ok(career.data.unlockedCars.includes('alpine'));assert.ok(career.data.unlockedCars.includes('escort'));
 assert.equal(career.data.settings.difficulty,'hard');assert.equal(career.data.settings.language,'de');
 career.recordRun('alps-1',240,[20,45,70,95,120,145,170,195,240]);career.save();
 const loaded=createCareer(store);
 assert.equal(loaded.data.records['alps-1'],240);assert.equal(loaded.data.legacyRecords['alps-1'],150);
 assert.equal(loaded.data.sectors['alps-1'].length,9);
});

test('current-course championship resumes old AI names without changing its locked pace',()=>{
 const store=memory();store.setItem(CAREER_STORAGE_KEY,JSON.stringify({courseVersion:7,settings:{difficulty:'superEasy'},
  active:{championshipId:'alps',stageIndex:1,playerTimes:[200],stageComplete:false,difficulty:'pro'}}));
 const career=createCareer(store);assert.equal(career.data.active.difficulty,'hard');
 assert.equal(career.data.settings.difficulty,'superEasy');assert.equal(career.currentStageId(),'alps-2');
});
