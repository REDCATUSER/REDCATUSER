import {STAGES,CARS,CHAMPIONSHIPS} from './content.js';
import {normalizeSettings} from './settings.js';
import {medalFor} from './performance.js';
const KEY='rally-horizon-career-v3';
const DEFAULT_TUNING={color:'#2869bc',tires:'snow',suspension:'balanced',gearing:'balanced'};
const DRIVERS=[['dupont','L. Dupont'],['berg','E. Berg'],['santos','M. Santos'],['ionescu','A. Ionescu'],['carter','J. Carter'],['nakamura','Y. Nakamura']];
const finiteTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<86400;
const ids=(list,key='id')=>list.map(x=>x[key]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=text=>{let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0)/4294967296;};
function defaults(){return{version:3,courseVersion:6,legacyRecords:{},selectedCar:'club',unlockedCars:['club'],unlockedChampionships:['alps'],completedChampionships:[],tuning:{...DEFAULT_TUNING},settings:normalizeSettings(),records:{},sectors:{},active:null};}
function tuningValid(value){const out={...DEFAULT_TUNING};if(!value||typeof value!=='object')return out;if(/^#[\da-f]{6}$/i.test(value.color))out.color=value.color;if(['road','gravel','snow','sand'].includes(value.tires))out.tires=value.tires;if(['soft','balanced','firm'].includes(value.suspension))out.suspension=value.suspension;if(['short','balanced','long'].includes(value.gearing))out.gearing=value.gearing;return out;}
const settingsValid=normalizeSettings;
function validate(input){const data=defaults();if(!input||typeof input!=='object')return data;
  const completed=Array.isArray(input.completedChampionships)?input.completedChampionships:[];
  // Reconstruct unlocks from successive victories; malformed saves cannot lock out the starter car.
  for(const championship of CHAMPIONSHIPS){if(!completed.includes(championship.id))break;data.completedChampionships.push(championship.id);data.unlockedCars.push(championship.rewardCar);const next=CHAMPIONSHIPS[CHAMPIONSHIPS.indexOf(championship)+1];if(next)data.unlockedChampionships.push(next.id);}
  if(data.unlockedCars.includes(input.selectedCar))data.selectedCar=input.selectedCar;
  data.tuning=tuningValid(input.tuning);data.settings=settingsValid(input.settings);
  if(input.records&&typeof input.records==='object')for(const stage of STAGES)if(finiteTime(input.records[stage.id]))data.records[stage.id]=input.records[stage.id];
  if(input.sectors&&typeof input.sectors==='object')for(const stage of STAGES){const splits=input.sectors[stage.id];if(Array.isArray(splits)&&splits.length===9&&splits.every((v,i)=>finiteTime(v)&&(i===0||v>=splits[i-1]))&&Math.abs(splits[8]-(data.records[stage.id]||0))<.05)data.sectors[stage.id]=[...splits]}
  const a=input.active,c=a&&CHAMPIONSHIPS.find(c=>c.id===a.championshipId);
  if(c&&data.unlockedChampionships.includes(c.id)&&Number.isInteger(a.stageIndex)&&a.stageIndex>=0&&a.stageIndex<c.stageIds.length&&Array.isArray(a.playerTimes)&&a.playerTimes.every(finiteTime)&&a.playerTimes.length===(a.stageComplete?a.stageIndex+1:a.stageIndex)){
    data.active={championshipId:c.id,stageIndex:a.stageIndex,playerTimes:[...a.playerTimes],stageComplete:!!a.stageComplete,finished:!!a.stageComplete&&a.stageIndex===c.stageIds.length-1,difficulty:['casual','club','pro'].includes(a.difficulty)?a.difficulty:'club'};
  }
  const legacy=input.courseVersion===6?input.legacyRecords:input.records;
  if(legacy&&typeof legacy==='object')for(const stage of STAGES)if(finiteTime(legacy[stage.id]))data.legacyRecords[stage.id]=legacy[stage.id];
  if(input.courseVersion!==6){data.records={};data.sectors={};data.active=null;}
  return data;
}
export class Career{
  constructor(storage){this.storage=storage;this.storageAvailable=Boolean(storage);let input;try{input=JSON.parse(storage?.getItem(KEY)||'null')}catch{}this.data=validate(input);}
  save(){try{this.storage?.setItem(KEY,JSON.stringify(this.data));return this.storageAvailable=!!this.storage}catch{this.storageAvailable=false;return false}}
  selectCar(id){if(!this.data.unlockedCars.includes(id)||!ids(CARS).includes(id))return false;this.data.selectedCar=id;this.save();return true;}
  setTuning(patch){this.data.tuning=tuningValid({...this.data.tuning,...patch});this.save();return this.data.tuning;}
  setSettings(patch){this.data.settings=settingsValid({...this.data.settings,...patch});this.save();return this.data.settings;}
  startChampionship(id){const c=CHAMPIONSHIPS.find(c=>c.id===id);if(!c||!this.data.unlockedChampionships.includes(id))throw new Error('Championnat verrouillé ou inconnu.');this.data.active={championshipId:id,stageIndex:0,playerTimes:[],stageComplete:false,finished:false,difficulty:this.data.settings.ai};this.save();return c.stageIds[0];}
  startFree(stageId){if(!STAGES.some(s=>s.id===stageId))throw new Error('Spéciale inconnue.');this.data.active=null;this.save();return stageId;}
  currentStageId(){const a=this.data.active;if(!a)return null;return CHAMPIONSHIPS.find(c=>c.id===a.championshipId)?.stageIds[a.stageIndex]||null;}
  recordTime(stageId,seconds){if(!STAGES.some(s=>s.id===stageId)||!finiteTime(seconds))return false;const old=this.data.records[stageId];if(old&&old<=seconds)return false;this.data.records[stageId]=seconds;delete this.data.sectors[stageId];this.save();return true;}
  recordRun(stageId,seconds,splits){const better=this.recordTime(stageId,seconds);if(better&&Array.isArray(splits)&&splits.length===9&&splits.every((v,i)=>finiteTime(v)&&(i===0||v>=splits[i-1]))&&Math.abs(splits[8]-seconds)<.05){this.data.sectors[stageId]=[...splits];this.save()}return better;}
  medals(){const summary={gold:0,silver:0,bronze:0,completed:0};for(const stage of STAGES){const time=this.data.records[stage.id],medal=medalFor(stage,time);if(time)summary.completed++;if(medal!=='none')summary[medal]++}return summary;}
  getStandings(){const a=this.data.active;if(!a)return[];const c=CHAMPIONSHIPS.find(c=>c.id===a.championshipId),n=a.playerTimes.length;
    const pace=a.difficulty==='casual'?1.22:a.difficulty==='pro'?.90:1;
    const rows=[{id:'player',name:'VOUS',totalTime:a.playerTimes.reduce((x,y)=>x+y,0),isPlayer:true},...DRIVERS.map(([id,name],i)=>({id,name,isPlayer:false,totalTime:c.stageIds.slice(0,n).reduce((sum,sid)=>{const stage=STAGES.find(s=>s.id===sid);return sum+stage.parTime*(1.06+i*.017+hash(`${c.id}/${sid}/${id}`)*.035)*pace},0)}))];
    rows.sort((a,b)=>a.totalTime-b.totalTime||(a.isPlayer?-1:b.isPlayer?1:a.id.localeCompare(b.id)));return rows.map((r,i)=>({...r,time:r.totalTime,rank:i+1}));
  }
  recordStage(seconds){const a=this.data.active;if(!a)throw new Error('Aucun championnat en cours.');if(a.stageComplete)throw new Error('Le temps de cette spéciale est déjà enregistré.');if(!finiteTime(seconds))throw new Error('Temps de spéciale invalide.');
    const c=CHAMPIONSHIPS.find(c=>c.id===a.championshipId),stageId=this.currentStageId();a.playerTimes.push(seconds);a.stageComplete=true;a.finished=a.stageIndex===c.stageIds.length-1;this.recordTime(stageId,seconds);
    const standings=this.getStandings(),won=a.finished&&standings[0].isPlayer;let rewardCar=null,newUnlock=null;
    if(won){rewardCar=c.rewardCar;if(!this.data.completedChampionships.includes(c.id))this.data.completedChampionships.push(c.id);if(!this.data.unlockedCars.includes(rewardCar))this.data.unlockedCars.push(rewardCar);const next=CHAMPIONSHIPS[CHAMPIONSHIPS.indexOf(c)+1];if(next){newUnlock=next.id;if(!this.data.unlockedChampionships.includes(next.id))this.data.unlockedChampionships.push(next.id)}}
    this.save();return{finished:a.finished,won,rewardCar,newUnlock,standings,stageId};
  }
  nextStage(){const a=this.data.active;if(!a||!a.stageComplete||a.finished)return null;a.stageIndex++;a.stageComplete=false;this.save();return this.currentStageId();}
  snapshot(){return clone(this.data);}
}
export function createCareer(storage){if(arguments.length===0){try{storage=globalThis.localStorage}catch{}}return new Career(storage);}
export {KEY as CAREER_STORAGE_KEY};
