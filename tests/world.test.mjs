import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { stages, makeWorld, getStagePreview } from '../app/world.js';

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
    const canopies = world.root.getObjectsByProperty('name','tree-canopies');
    for(const part of canopies){part.geometry.computeBoundingBox();const size=part.geometry.boundingBox.getSize(new T.Vector3());assert.ok(size.x>1&&size.y>1&&size.z>1,'foliage has volume from every viewing angle');assert.ok(part.geometry.attributes.position.count<=24,'tree detail remains economical on the GPU')}
    assert.ok(canopies.reduce((sum,part)=>sum+part.count,0) >= (region==='dakar'?60:500),'forest density is preserved');
    if (region !== 'dakar') assert.ok(world.barriers.length > 100);
    world.dispose();
  }
});

test('technical routes contain linked hairpins rather than long gentle sine waves',()=>{for(const region of ['alps','monte','romania']){const world=makeWorld(new T.Scene(),stages.find(s=>s.region===region)),headings=world.samples.slice(1).map((p,i)=>Math.atan2(p.x-world.samples[i].x,-(p.z-world.samples[i].z)));assert.ok(Math.max(...headings)-Math.min(...headings)>2.2,region+' lacks opposite tight bends');let changes=0,last=-1000;for(let i=30;i<headings.length-30;i++){const turn=Math.abs(headings[i+25]-headings[i-25]);if(turn>1.5&&i-last>60){changes++;last=i}}assert.ok(changes>=3,region+' needs several genuine hairpins');world.dispose()}});

test('all eighteen stages have distinct bend sequences even at a normalized distance',()=>{
  const previews=stages.map(stage=>{
    const points=getStagePreview(stage).points;
    return points.slice(1).map((p,i)=>Math.atan2(p.x-points[i].x,-(p.z-points[i].z)));
  });
  for(let a=0;a<previews.length;a++)for(let b=a+1;b<previews.length;b++){
    const difference=previews[a].reduce((sum,h,i)=>sum+Math.abs(h-previews[b][i]),0)/previews[a].length;
    assert.ok(difference>.18,`${stages[a].id} and ${stages[b].id} repeat the same route`);
  }
});

test('pixel crowd replaces cylinder people and camera flashes respond to the car passing',()=>{
  const world=makeWorld(new T.Scene(),stages[0]);
  const groups=world.root.getObjectsByProperty('name','pixel-spectators');
  assert.equal(groups.length,8,'one atlas batch per clothing/pose variant');
  assert.equal(groups.reduce((sum,g)=>sum+g.count,0),112);
  assert.equal(world.root.getObjectByName('spectator-jackets'),undefined);
  const map=groups[0].material.map;
  assert.equal(map.magFilter,T.NearestFilter);assert.equal(map.minFilter,T.NearestFilter);
  assert.equal(map.image.width,256);assert.equal(map.image.height,48);
  assert.ok(map.image.data.some((v,i)=>i%4===3&&v===0),'transparent silhouette edges');
  const matrix=new T.Matrix4(),position=new T.Vector3();
  for(const group of groups)for(let i=0;i<group.count;i++){
    group.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
    assert.ok(world.nearest(position.x,position.z).dist>world.roadWidth/2+1,'crowd stays behind the road edge');
  }
  const flashes=world.root.getObjectByName('spectator-camera-flashes');
  flashes.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);assert.equal(matrix.getMaxScaleOnAxis(),0);
  world.update(.016,position,.03);flashes.getMatrixAt(0,matrix);assert.ok(matrix.getMaxScaleOnAxis()>.6,'nearby photographer fires a brief flash');
  world.update(.016,new T.Vector3(1e6,0,1e6),.03);flashes.getMatrixAt(0,matrix);assert.equal(matrix.getMaxScaleOnAxis(),0,'distant crowds do not flash every frame');
  const boards=world.root.getObjectsByProperty('name','fictional-sponsor');
  assert.equal(new Set(boards.map(b=>b.userData.sponsor)).size,6);
  assert.equal(boards.reduce((sum,b)=>sum+b.count,0),30);
  world.dispose();
});
