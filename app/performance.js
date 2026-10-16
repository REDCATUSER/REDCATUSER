export const MEDALS=['none','bronze','silver','gold'];
export const MEDAL_LABELS={none:'À CONQUÉRIR',bronze:'BRONZE',silver:'ARGENT',gold:'OR'};
export function medalTargets(stage){return{gold:stage.parTime*.94,silver:stage.parTime*1.07,bronze:stage.parTime*1.25}}
export function medalFor(stage,time){if(!Number.isFinite(time)||time<=0)return'none';const targets=medalTargets(stage);return ['gold','silver','bronze'].find(m=>time<=targets[m])||'none'}
export function applyImpact(damage,speed){return Math.min(1,Math.max(0,damage)+(Math.max(0,Math.abs(speed)-3)/55)**1.35*.22)}
export function ghostKey(stage,car,tuning,settings={}){return [5,stage.id,car.id,tuning.tires,tuning.suspension,tuning.gearing,settings.assist||'sport',settings.damage===false?'no-damage':'damage',settings.manual?'manual':'auto'].join('/')}
export class RunRecorder{
 constructor(){this.frames=[];this.valid=true;this.next=0}
 invalidate(){this.valid=false}
 add(time,state,distance){
  if(!this.valid||time<this.next||this.frames.length>=4500)return;
  if(![time,state.x,state.z,state.yaw,distance].every(Number.isFinite))return;
  this.next=time+.20;
  const last=this.frames.at(-1),progress=Math.max(last?.[4]||0,distance);
  this.frames.push([+time.toFixed(3),+state.x.toFixed(3),+state.z.toFixed(3),+state.yaw.toFixed(5),+progress.toFixed(3)]);
 }
 finish({key,time,splits,car}){
  if(!this.valid||this.frames.length<12)return null;
  const run={version:5,key,time,car,frames:this.frames,splits:[...splits],created:Date.now()};return validGhost(run,key)?run:null;
 }
}
export function validGhost(run,key){
 if(!run||run.version!==5||run.key!==key||!Number.isFinite(run.time)||run.time<=0||run.time>900||!Array.isArray(run.frames)||run.frames.length<12||run.frames.length>4500||!Array.isArray(run.splits)||run.splits.length!==9)return false;
 let t=-1,d=-1;for(const row of run.frames){if(!Array.isArray(row)||row.length!==5||!row.every(Number.isFinite)||row[0]<=t||row[0]>run.time+.3||row[4]<d||Math.abs(row[1])>50000||Math.abs(row[2])>50000)return false;t=row[0];d=row[4]}
 return run.splits.every((v,i)=>Number.isFinite(v)&&v>0&&v<=run.time+.01&&(i===0||v>=run.splits[i-1]));
}
function interval(rows,value,column){let lo=0,hi=rows.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(rows[mid][column]<value)lo=mid;else hi=mid}const a=rows[lo],b=rows[hi],f=Math.max(0,Math.min(1,(value-a[column])/Math.max(.00001,b[column]-a[column])));return{a,b,f}}
export function sampleGhost(run,time){
 if(!run?.frames?.length||time<0||time>run.time)return null;const {a,b,f}=interval(run.frames,time,0);
 const delta=Math.atan2(Math.sin(b[3]-a[3]),Math.cos(b[3]-a[3]));return{x:a[1]+(b[1]-a[1])*f,z:a[2]+(b[2]-a[2])*f,yaw:a[3]+delta*f,distance:a[4]+(b[4]-a[4])*f};
}
export function ghostTimeAt(run,distance){if(!run?.frames?.length||distance<run.frames[0][4]||distance>run.frames.at(-1)[4])return null;const {a,b,f}=interval(run.frames,distance,4);return a[0]+(b[0]-a[0])*f}
async function database(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(Error('Stockage indisponible'));return}const r=indexedDB.open('rally-horizon-ghosts',1);r.onupgradeneeded=()=>r.result.createObjectStore('runs',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function transaction(mode,action){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('runs',mode),r=action(tx.objectStore('runs'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
export async function loadGhost(key){const run=await transaction('readonly',s=>s.get(key));return validGhost(run,key)?run:null}
export async function saveGhost(run){
 if(!validGhost(run,run?.key))return false;
 // Compare and replace in one read/write transaction, including concurrent tabs.
 const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('runs','readwrite'),s=tx.objectStore('runs'),r=s.get(run.key);let saved=false;r.onsuccess=()=>{if(!validGhost(r.result,run.key)||run.time<r.result.time){s.put(run);saved=true}};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(tx.error)})}finally{db.close()}
}
