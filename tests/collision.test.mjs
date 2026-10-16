import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionIndex,resolveContacts,impactDamage,isCritical} from '../app/collision.js';
import {createState} from '../app/physics.js';
const rail={a:{x:1,z:-30},b:{x:1,z:30},x:1,z:0,r:.12,kind:'barrier'};
test('a glancing guardrail contact preserves forward speed instead of halving all motion',()=>{
 const s=Object.assign(createState(),{x:.15,vx:4,vz:-25,speed:25});const before=s.vx*s.vx+s.vz*s.vz;
 const hit=resolveContacts(s,[rail]);assert.ok(hit);assert.ok(Math.abs(s.vz)>22);assert.ok(s.vx<=.2);assert.ok(s.vx*s.vx+s.vz*s.vz<=before);assert.ok(s.x<.15);
});
test('a frontal tree impact stops the nose without teleporting the car through the object',()=>{
 const s=Object.assign(createState(),{vz:-30,speed:30}),tree={x:0,z:-1.8,r:.6};const hit=resolveContacts(s,[tree]);assert.ok(hit?.speed>25);assert.ok(Math.abs(s.vz)<2);assert.ok(s.z>.1);assert.equal(hit.zone,'front');assert.ok(isCritical(impactDamage(0,40)));assert.ok(!isCritical(impactDamage(0,10)));
});
test('off-center contact produces finite yaw without injecting kinetic energy',()=>{
 const s=Object.assign(createState(),{x:0,vx:0,vz:-24,speed:24});const hit=resolveContacts(s,[{x:.65,z:-2.0,r:.65}]);assert.ok(hit);assert.ok(Math.abs(s.yawRate)>.05&&Math.abs(s.yawRate)<=1.25);assert.ok(Math.hypot(s.vx,s.vz)<=24.01);
});
test('the spatial index covers cell boundaries and only returns local obstacles',()=>{
 const near={x:32.1,z:0,r:1},far={x:400,z:300,r:4},index=collisionIndex([near,far,rail]);assert.ok(index.query(31.9,0).includes(near));assert.ok(!index.query(31.9,0).includes(far));assert.ok(index.query(0,20).includes(rail));
});
