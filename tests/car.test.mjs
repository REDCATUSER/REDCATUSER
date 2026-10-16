import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCar } from '../app/car.js';

test('all six cars keep the pilot sight line clear and survive garage changes', () => {
  const scene = new T.Scene(), car = createCar(scene);
  const ray = new T.Raycaster();
  for (const id of ['club', 'alpine', 'escort', 'delta', 'celica', 'quattro']) {
    car.setConfig({ id, color: '#537eab' });
    car.root.position.set(17, 4, -21);
    car.root.rotation.set(.07, 1.2, -.04);
    car.update({ cameraMode: 2, steer: .7, speed: 24, dt: 1 / 60 });
    const eye = car.root.localToWorld(car.cameraAnchors.cockpitPosition.clone());
    const target = car.root.localToWorld(car.cameraAnchors.cockpitTarget.clone());
    ray.set(eye, target.sub(eye).normalize());
    const visibleOpaque = [];
    car.root.traverseVisible(object => { if (object.isMesh && !object.material.transparent) visibleOpaque.push(object); });
    assert.equal(ray.intersectObjects(visibleOpaque, false).length, 0, `${id} obscures the pilot's forward sight line`);
    car.root.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite), `${id} has invalid geometry transforms`));
    assert.equal(car.exterior.visible, false);
    assert.ok(car.wheels.every(w=>!w.pivot.visible),'wheels must disappear from the cockpit');
    car.setConfig({textureQuality:car.textureSize===1024?'medium':'high'});
    assert.ok(car.wheels.every(w=>!w.pivot.visible),'texture changes preserve cockpit visibility');
    car.update({cameraMode:1});
    assert.ok(car.wheels.every(w=>!w.pivot.visible),'wheels must disappear from the hood view');
    const hoodEye=car.root.localToWorld(car.cameraAnchors.hoodPosition.clone()),hoodTarget=car.root.localToWorld(car.cameraAnchors.hoodTarget.clone());ray.set(hoodEye,hoodTarget.sub(hoodEye).normalize());const hoodOpaque=[];car.root.traverseVisible(o=>{if(o.isMesh&&!o.material.transparent)hoodOpaque.push(o)});assert.equal(ray.intersectObjects(hoodOpaque,false).length,0,`${id} obscures the hood camera`);
    car.update({ cameraMode: 0 });
    assert.equal(car.exterior.visible, true);
    assert.ok(car.wheels.every(w=>w.pivot.visible));
    let triangles=0;car.root.traverseVisible(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1)});assert.ok(triangles<30000,`${id}: detailed cockpit must not burden the exterior view`);
  }
  car.dispose();
  assert.equal(scene.children.length, 0);
});

test('body damage deforms impacted panels and a repaired car restores its original shape',()=>{
 const car=createCar(new T.Scene(),{id:'alpine'});car.update({cameraMode:0});const mesh=car.exterior.getObjectsByProperty('name','batched-car-detail').find(m=>!m.material.transparent&&m.geometry.attributes.position.count>2000),original=mesh.geometry.attributes.position.array.slice();car.update({damage:.6,damageZones:{front:.6}});assert.notDeepEqual(mesh.geometry.attributes.position.array,original);car.update({damage:0,damageZones:{}});for(let i=0;i<original.length;i++)assert.ok(Math.abs(mesh.geometry.attributes.position.array[i]-original[i])<1e-5);car.dispose();
});

test('hands stay attached to the turning wheel and return after shifting', () => {
  const scene = new T.Scene(), car = createCar(scene);
  car.root.position.set(-23, 3, 18); car.root.rotation.set(.05, -.9, .04);
  for (const steer of [-1, 0, 1]) {
    car.update({ steer, shift: 0, cameraMode: 2 });
    for (const { hand, sign } of car.hands) {
      const local = car.wheelSpin.worldToLocal(hand.getWorldPosition(new T.Vector3()));
      assert.ok(local.distanceTo(new T.Vector3(sign * .221, .064, .025)) < 1e-6, 'Glove detached from wheel');
    }
  }
  car.update({ steer: .4, shift: .5, cameraMode: 2 });
  assert.ok(car.hands[1].hand.position.distanceTo(new T.Vector3(.10, .865, -.266)) < 1e-6, 'Right hand misses the gear knob');
  car.update({ steer: .4, shift: 1, cameraMode: 2 });
  const restored = car.wheelSpin.worldToLocal(car.hands[1].hand.getWorldPosition(new T.Vector3()));
  assert.ok(restored.distanceTo(new T.Vector3(.221, .064, .025)) < 1e-6, 'Right hand fails to return');
  car.dispose();
});

test('headlights start off, illuminate the road and can be switched off again', () => {
  const scene = new T.Scene(), car = createCar(scene);
  const lights = scene.getObjectsByProperty('isSpotLight', true);
  assert.equal(lights.length, 2);
  assert.ok(lights.every(light => !light.visible && light.intensity === 0));
  car.setHeadlights(true);
  assert.ok(lights.every(light => light.visible && light.intensity > 0 && light.target.position.z < light.position.z));
  car.setConfig({ id: 'quattro' });
  assert.ok(scene.getObjectsByProperty('isSpotLight', true).every(light => light.visible));
  car.setHeadlights(false);
  assert.ok(scene.getObjectsByProperty('isSpotLight', true).every(light => !light.visible && light.intensity === 0));
  car.dispose();
});

test('six original silhouettes and six cockpit layouts use inset tyres at the arches',()=>{
 const car=createCar(new T.Scene()),silhouettes=new Set(),cockpits=new Set(),geometries=new Set();
 for(const id of ['club','alpine','escort','delta','celica','quattro']){
  car.setConfig({id});car.update({cameraMode:0});
  silhouettes.add(car.silhouette);cockpits.add(car.cockpitStyle);
  assert.equal(car.inside.userData.cockpitStyle,car.cockpitStyle);
  const profileWidth={club:1.78,alpine:1.8,escort:1.8,delta:1.86,celica:1.87,quattro:1.9}[id];
  for(const wheel of car.wheels){
   assert.ok(Math.abs(wheel.pivot.position.x)+.123<=profileWidth/2+.001,`${id} tyre protrudes beyond its fender`);
   assert.ok(Math.abs(wheel.pivot.position.x)+.123>profileWidth/2-.05,`${id} tyre is buried inside the body`);
   assert.ok(wheel.pivot.position.y>.33&&wheel.pivot.position.y<.38,`${id} wheel no longer sits on the ground`);
  }
  const meshes=[];car.exterior.traverse(o=>{if(o.isMesh&&o.material.color?.getHexString()!=='171d23')meshes.push(o.geometry.attributes.position.array)});
  geometries.add(meshes.map(a=>`${a.length}:${Array.from(a.slice(0,24)).map(x=>x.toFixed(3)).join(',')}`).join('|'));
  car.update({cameraMode:2,gear:0,rpm:5600});assert.equal(car.inside.visible,true);
 }
 assert.equal(silhouettes.size,6);assert.equal(cockpits.size,6);assert.equal(geometries.size,6,'body geometry must vary beyond badges and colour');
 car.dispose();
});
