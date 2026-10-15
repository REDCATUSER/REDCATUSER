import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {stages,makeWorld,height} from '../app/world.js';
for(let i=0;i<stages.length;i++)test(`${stages[i].name}: closed 3D track, 12 gates, clear scenery and disposal`,()=>{const scene=new T.Scene(),world=makeWorld(scene,stages[i],i);assert.equal(world.gates.length,12);assert.ok(world.samples[0].distanceTo(world.samples.at(-1))<.001);for(const p of world.samples){assert.ok(Number.isFinite(p.x+p.y+p.z));assert.ok(Math.abs(p.y-height(p.x,p.z))<.001)}for(const g of world.gates)assert.ok(world.nearest(g.point.x,g.point.z).dist<.01);for(const o of world.obstacles)assert.ok(world.nearest(o.x,o.z).dist>=10);world.dispose();assert.equal(scene.children.length,0)});
