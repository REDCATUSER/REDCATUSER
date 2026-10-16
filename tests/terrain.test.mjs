import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTerrain} from '../app/terrain.js';
import {createState,integrate} from '../app/physics.js';
test('four contacts recover height, pitch and bank in a rotated car frame',()=>{
 for(const yaw of [0,.7,2.5]){
  const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
  const heightAt=(x,z)=>4+.45*(x*fx+z*fz)+.23*(x*rx+z*rz);
  const frame=sampleTerrain(heightAt,0,0,yaw);
  assert.ok(Math.abs(frame.height-4)<1e-8);assert.ok(Math.abs(frame.pitch-Math.atan(.45))<1e-8);assert.ok(Math.abs(frame.roll-Math.atan(.23))<1e-8);
 }
});
test('steep snowy slopes overcome engine traction instead of allowing mountain climbing',()=>{
 const s=createState();for(let i=0;i<600;i++)integrate(s,{throttle:1},1/120,{surface:'snow',offroad:true,slope:Math.PI/4,tuning:{tires:'snow'}});
 assert.ok(s.speed< -3,`expected rollback, got ${s.speed}`);assert.ok(s.z>3);
});
test('cross-slope gravity slides a snow car downhill and respects the bank direction',()=>{
 for(const sign of [-1,1]){const s=createState();for(let i=0;i<360;i++)integrate(s,{},1/120,{surface:'snow',crossSlope:sign*.65});assert.ok(s.x*sign< -1);assert.ok(Number.isFinite(s.yaw))}
});
