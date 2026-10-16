import * as T from 'three';
import {makeWorld} from '../app/world.js';
import {STAGES,CARS} from '../app/content.js';
import {createState,integrate,clamp} from '../app/physics.js';
import {createRaceProgress} from '../app/race.js';
import assert from 'node:assert/strict';
import {collisionIndex,resolveContacts} from '../app/collision.js';
import {sampleTerrain} from '../app/terrain.js';
const dt=1/120, reports=[];
for(const id of (process.argv.slice(2).length?process.argv.slice(2):['alps-1','dakar-1','usa-1','romania-1'])){
 const stage=STAGES.find(s=>s.id===id),world=makeWorld(new T.Scene(),stage,STAGES.indexOf(stage));
 const state=createState(),start=world.gates[0],race=createRaceProgress(world.gates,{radius:Math.min(12,world.roadWidth||11)});
 state.yaw=start.yaw;state.x=start.point.x-Math.sin(start.yaw)*2;state.z=start.point.z-Math.cos(start.yaw)*2;race.resetPosition(state.x,state.z);
 const tuning={tires:stage.surface==='snow'?'snow':stage.surface==='sand'?'sand':stage.surface==='gravel'?'gravel':'road',gearing:'balanced',suspension:stage.surface==='asphalt'?'balanced':'soft'};
 const colliders=collisionIndex([...world.obstacles,...world.barriers]);
 const samples=world.samples,distances=[0];for(let i=1;i<samples.length;i++)distances.push(distances[i-1]+samples[i].distanceTo(samples[i-1]));
 function pointAt(distance){distance=clamp(distance,0,world.length);let lo=0,hi=distances.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(distances[mid]<distance)lo=mid;else hi=mid;}const t=(distance-distances[lo])/(distances[hi]-distances[lo]);return{x:samples[lo].x+(samples[hi].x-samples[lo].x)*t,z:samples[lo].z+(samples[hi].z-samples[lo].z)*t};}
 function curvatureAt(distance){const a=pointAt(distance-6),b=pointAt(distance),c=pointAt(distance+6),abx=b.x-a.x,abz=b.z-a.z,bcx=c.x-b.x,bcz=c.z-b.z,area=abx*bcz-abz*bcx;return Math.abs(2*area/Math.max(.1,Math.hypot(abx,abz)*Math.hypot(bcx,bcz)*Math.hypot(c.x-a.x,c.z-a.z)));}
 const grip=stage.surface==='snow'? .52:stage.surface==='sand'?.72: .90,comfortableLateral=grip*9.81*.56,brakeDeceleration=grip*9.81*.65;
 let elapsed=0,maxDistance=0,offroadTime=0,collisions=0,maxSpeed=0,minCornerSpeed=99,steeringMax=0,guard=0;const splits=[],collisionObjects=[...world.obstacles,...world.barriers];
 for(let frame=0;frame<120*650&&!race.finished;frame++){
  const near=world.nearest(state.x,state.z),speed=Math.max(0,state.speed),forwardX=-Math.sin(state.yaw),forwardZ=-Math.cos(state.yaw),rightX=Math.cos(state.yaw),rightZ=-Math.sin(state.yaw);
  const lookahead=6+speed*.52,target=pointAt(near.distance+lookahead),dx=target.x-state.x,dz=target.z-state.z,lateral=dx*rightX+dz*rightZ;
  const pursuit=2*lateral/Math.max(4,dx*dx+dz*dz);
  const understeer=1+speed*speed*.0013;
  const desiredAngle=Math.atan(2.60*pursuit*understeer);
  const steer=clamp(desiredAngle*(1+speed*.13+speed*speed*.0025)/.58,-1,1);steeringMax=Math.max(steeringMax,Math.abs(steer));
  let targetSpeed=stage.surface==='snow'?25:stage.surface==='sand'?31:33;
  for(let d=0;d<=95;d+=5){const curvature=curvatureAt(near.distance+d),cornerSpeed=Math.sqrt(comfortableLateral/Math.max(.0001,curvature));targetSpeed=Math.min(targetSpeed,Math.sqrt(cornerSpeed*cornerSpeed+2*brakeDeceleration*Math.max(0,d-5)));}
  minCornerSpeed=Math.min(minCornerSpeed,targetSpeed);
  const error=targetSpeed-speed,throttle=error>.5?1:error>-.4?clamp(.38+error*.7,0,1):0,brake=error<-.7?clamp((-error-.7)*.4,0,1):0;
  const contact=sampleTerrain(world.heightAt,state.x,state.z,state.yaw);
  integrate(state,{throttle,brake,steer,handbrake:false},dt,{surface:near.surface||stage.surface,offroad:near.dist>world.roadWidth/2,wetness:world.weather.wetness,slope:contact.pitch,crossSlope:contact.roll,roughness:near.roughness,tuning,car:CARS.find(c=>c.id===(process.env.RALLY_DRIVER_CAR||'club')),assist:'sport'});
  const hit=resolveContacts(state,colliders.query(state.x,state.z),CARS.find(c=>c.id===(process.env.RALLY_DRIVER_CAR||'club')));if(hit&&hit.speed>1)collisions++;
  const current=world.nearest(state.x,state.z);maxDistance=Math.max(maxDistance,current.dist);if(current.dist>world.roadWidth/2)offroadTime+=dt;maxSpeed=Math.max(maxSpeed,Math.abs(state.speed));elapsed+=dt;
  const event=race.update(state.x,state.z,elapsed);if(event)splits.push(event.total);
  if(current.dist>100){guard++;break;}
 }
 reports.push({id,finished:race.finished,seconds:+elapsed.toFixed(2),length:+world.length.toFixed(1),checkpoints:race.completed,totalGates:world.gates.length-1,maxDistanceFromCenter:+maxDistance.toFixed(2),halfRoadWidth:world.roadWidth/2,offroadSeconds:+offroadTime.toFixed(2),collisions,maxSpeedMps:+maxSpeed.toFixed(2),slowestTargetSpeed:+minCornerSpeed.toFixed(2),maxSteering:+steeringMax.toFixed(2),guard,position:[state.x,state.z],splits:splits.map(s=>+s.toFixed(2))});
 console.log(JSON.stringify({...reports.at(-1),car:process.env.RALLY_DRIVER_CAR||'club'}));world.dispose();assert.ok(race.finished,id+' did not finish');assert.equal(race.completed,9);assert.equal(collisions,0,id+' hit scenery');assert.ok(offroadTime<.1,id+' left the road');
}
