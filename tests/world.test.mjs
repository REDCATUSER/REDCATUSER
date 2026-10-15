import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { stages, makeWorld } from '../app/world.js';

for (let i = 0; i < stages.length; i++) test(`${stages[i].name}: open sprint, ordered checkpoints and consistent tire contact`, () => {
  const scene = new T.Scene(), world = makeWorld(scene, stages[i], i);
  assert.ok(world.length >= 2500, 'a full-length special rather than a short lap');
  assert.ok(world.samples[0].distanceTo(world.samples.at(-1)) > 2000, 'finish is far from the start');
  assert.equal(world.curve.closed, false);
  assert.equal(world.gates[0].distance, 0);
  assert.ok(Math.abs(world.gates.at(-1).distance - world.length) < .01);
  for (let k = 1; k < world.samples.length; k++) {
    assert.ok(world.samples[k].z < world.samples[k - 1].z, 'monotonic route cannot cross itself');
    assert.ok(world.samples[k].distanceTo(world.samples[k - 1]) < 3.1);
  }
  for (let k = 0; k < world.gates.length; k++) {
    const gate = world.gates[k], near = world.nearest(gate.point.x, gate.point.z);
    assert.ok(near.dist < .001);
    assert.ok(Math.abs(near.distance - gate.distance) < .01);
    if (k) assert.ok(gate.distance > world.gates[k - 1].distance);
  }
  const road = world.root.getObjectByName('road').geometry.attributes.position;
  for (let k = 0; k < road.count; k += 7) {
    const x = road.getX(k), y = road.getY(k), z = road.getZ(k);
    assert.ok(Number.isFinite(x + y + z));
    assert.ok(Math.abs(y - world.heightAt(x, z) - .055) < .002, 'wheel height matches road mesh');
  }
  world.root.updateMatrixWorld(true);
  for (let k = 20; k < world.samples.length - 20; k += 95) {
    const p = world.samples[k], a = world.samples[k - 1], b = world.samples[k + 1];
    const dx = b.x - a.x, dz = b.z - a.z, normal = Math.hypot(dx, dz);
    for (const side of [-.9, 0, .9]) {
      const offset = side * world.roadWidth / 2, x = p.x - dz / normal * offset, z = p.z + dx / normal * offset;
      const ray = new T.Raycaster(new T.Vector3(x, 1000, z), new T.Vector3(0, -1, 0));
      const roadHit = ray.intersectObject(world.root.getObjectByName('road'))[0];
      const groundHit = ray.intersectObject(world.root.getObjectByName('terrain'))[0];
      assert.ok(roadHit && groundHit, 'both meshes cover the full drivable width');
      assert.ok(roadHit.point.y - groundHit.point.y > .1, 'terrain cannot obscure the road or shoulders');
      assert.ok(Math.abs(roadHit.point.y - world.heightAt(x, z) - .055) < .01, 'tire height matches road triangle interiors');
    }
  }
  for (const obstacle of world.obstacles) assert.ok(world.nearest(obstacle.x, obstacle.z).dist - obstacle.r > world.roadWidth / 2, 'scenery never blocks the road');
  assert.ok(world.notes.length >= 5);
  for (let k = 1; k < world.notes.length; k++) assert.ok(world.notes[k].distance >= world.notes[k - 1].distance);
  assert.equal(world.notes.at(-1).code, 'finish');
  world.update(.016, world.samples[100], 1);
  assert.ok(Number.isFinite(world.weather.wetness));
  world.dispose(); assert.equal(scene.children.length, 0);
});

test('road surfaces and weather distinguish the six regions without a browser', () => {
  for (const region of ['alps', 'dakar', 'france', 'monte', 'usa', 'romania']) {
    const stage = stages.find(s => s.region === region); assert.ok(stage, region);
    const world = makeWorld(new T.Scene(), stage);
    const p = world.samples[200];
    assert.equal(world.surfaceAt(p.x, p.z), stage.surface);
    const outside = world.nearest(p.x + 100, p.z);
    assert.ok(outside.dist > world.roadWidth / 2);
    assert.ok(['grass', 'sand', 'snow'].includes(outside.surface));
    const canopies = world.root.getObjectByName('tree-canopies');
    assert.equal(canopies.geometry.type, 'IcosahedronGeometry');
    assert.ok(canopies.count >= 300, 'trees use several 3D canopy clusters');
    if (region !== 'dakar') assert.ok(world.barriers.length > 100);
    world.dispose();
  }
});
