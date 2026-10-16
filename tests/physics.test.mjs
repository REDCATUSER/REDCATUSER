import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, integrate, shift, resetDynamics, updateStationaryEngine } from '../app/physics.js';

test('driven axle loading distinguishes FWD, RWD and AWD under full acceleration',()=>{
 const fwd=createState(),rwd=createState(),awd=createState();for(let i=0;i<480;i++)for(const [s,driveType]of [[fwd,'fwd'],[rwd,'rwd'],[awd,'awd']])integrate(s,{throttle:1},1/120,{surface:'asphalt',car:{mass:1100,power:300,driveType}});
 assert.ok(awd.speed>fwd.speed+2);assert.ok(rwd.speed>fwd.speed);
});
test('mechanical damage reduces power before the critical retirement threshold',()=>{
 const clean=createState(),damaged=createState();for(let i=0;i<1800;i++){integrate(clean,{throttle:1},1/120,{surface:'asphalt',car:{power:110},damage:0});integrate(damaged,{throttle:1},1/120,{surface:'asphalt',car:{power:110},damage:.7})}assert.ok(clean.speed>damaged.speed+2);assert.ok(damaged.speed>15);
});

const drive = (state, input, seconds, context = { surface: 'asphalt' }, hz = 120) => {
  for (let i = 0; i < Math.round(seconds * hz); i++) integrate(state, input, 1 / hz, context);
  return state;
};
const rolling = (speed = 20, side = 0) => Object.assign(createState(), { speed, vz: -speed, vx: side, side });

test('automatic acceleration selects useful gears; full braking stops the forward motion', () => {
  const s = drive(createState(), { throttle: 1 }, 12);
  assert.ok(s.speed > 30 && s.speed < 48, `speed ${s.speed}`);
  assert.ok(s.gear >= 3 && s.gear <= 6);
  assert.ok(s.rpm >= 900 && s.rpm <= 7600);
  const previous = s.speed;
  drive(s, { brake: 1 }, 4.2);
  assert.ok(s.speed < 1 && s.speed > -1, `braking from ${previous} left ${s.speed}`);
});

test('manual gearbox holds its gear, cuts engine load and drops RPM when shifting up', () => {
  const s = rolling(24); s.manual = true; s.gear = 2;
  drive(s, { throttle: 1 }, .4);
  const rpm = s.rpm;
  assert.equal(s.gear, 2);
  assert.equal(shift(s, 3), true);
  assert.equal(shift(s, 4), false);
  drive(s, { throttle: 1 }, .1);
  assert.equal(s.engineLoad, 0);
  drive(s, { throttle: 1 }, .5);
  assert.equal(s.gear, 3);
  assert.equal(s.shiftRemaining, 0);
  assert.ok(s.rpm < rpm - 700, `${rpm} -> ${s.rpm}`);
  assert.ok(s.engineLoad > .9);
});

test('stationary steering cannot turn the car; steering force gradually produces a right turn', () => {
  const parked = drive(createState(), { steer: 1 }, 2);
  assert.equal(parked.yaw, 0);
  assert.equal(parked.x, 0);
  const s = rolling();
  integrate(s, { steer: 1 }, 1 / 120, { surface: 'asphalt' });
  assert.ok(Math.abs(s.yaw) < .001, 'yaw cannot jump to the steering angle');
  drive(s, { throttle: 1, steer: 1 }, .8);
  assert.ok(s.yaw < -.1 && s.yawRate < 0);
  assert.ok(s.x > .3);
  assert.ok(Math.abs(s.side) > .2, 'velocity keeps inertia through a turn');
});

test('snow retains lateral slip far longer than asphalt', () => {
  const road = drive(rolling(20, 5), {}, .6, { surface: 'asphalt' });
  const snow = drive(rolling(20, 5), {}, .6, { surface: 'snow' });
  assert.ok(Math.abs(snow.side) > Math.abs(road.side) * 4);
});

test('snow tires improve snow grip and shorten stopping distance', () => {
  const roadTires = drive(rolling(), { brake: 1 }, 2, { surface: 'snow', tuning: { tires: 'road' } });
  const snowTires = drive(rolling(), { brake: 1 }, 2, { surface: 'snow', tuning: { tires: 'snow' } });
  assert.ok(snowTires.speed < roadTires.speed - 4);
  assert.ok(Math.abs(snowTires.z) < Math.abs(roadTires.z) - 3);
  const slidingRoad = drive(rolling(20, 5), {}, .6, { surface: 'snow', tuning: { tires: 'asphalt' } });
  const slidingSnow = drive(rolling(20, 5), {}, .6, { surface: 'snow', tuning: { tires: 'snow' } });
  assert.ok(Math.abs(slidingSnow.side) < Math.abs(slidingRoad.side) * .7);
});

test('sand drag, off-road resistance and wet asphalt affect performance', () => {
  const road = drive(createState(), { throttle: 1 }, 8);
  const sand = drive(createState(), { throttle: 1 }, 8, { surface: 'sand' });
  const offroad = drive(createState(), { throttle: 1 }, 8, { surface: 'asphalt', offroad: true });
  assert.ok(sand.speed < road.speed - 5);
  assert.ok(offroad.speed < road.speed - 2);
  assert.equal(offroad.offroad, true);
  const dry = drive(rolling(), { brake: 1 }, 1, { surface: 'asphalt', wetness: 0 });
  const wet = drive(rolling(), { brake: 1 }, 1, { surface: 'asphalt', wetness: 1 });
  assert.ok(wet.speed > dry.speed + 2);
});

test('snow and sand equipment have real traction tradeoffs', () => {
  const sandTires = drive(createState(), { throttle: 1 }, 5, { surface: 'sand', tuning: { tires: 'sand' } });
  const roadTires = drive(createState(), { throttle: 1 }, 5, { surface: 'sand', tuning: { tires: 'road' } });
  assert.ok(sandTires.speed > roadTires.speed + 3);
  const roadStop = drive(rolling(), { brake: 1 }, 1, { surface: 'asphalt', tuning: { tires: 'road' } });
  const snowStop = drive(rolling(), { brake: 1 }, 1, { surface: 'asphalt', tuning: { tires: 'snow' } });
  assert.ok(roadStop.speed < snowStop.speed - 2);
});

test('climbing loses speed and descents gain speed at the same throttle', () => {
  const uphill = drive(createState(), { throttle: 1 }, 8, { surface: 'gravel', slope: .12 });
  const flat = drive(createState(), { throttle: 1 }, 8, { surface: 'gravel', slope: 0 });
  const downhill = drive(createState(), { throttle: 1 }, 8, { surface: 'gravel', slope: -.12 });
  assert.ok(uphill.speed < flat.speed - 3);
  assert.ok(downhill.speed > flat.speed + 3);
});

test('handbrake slows the car and releases rear lateral grip', () => {
  const normal = drive(rolling(), { steer: .7 }, .7);
  const handbrake = drive(rolling(), { steer: .7, handbrake: true }, .7);
  assert.ok(handbrake.speed < normal.speed - 2);
  assert.ok(handbrake.wheels[2].slip > normal.wheels[2].slip + .2);
});

test('gearing changes RPM and low gears provide stronger engine braking', () => {
  const low = rolling(); low.gear = 2; low.manual = true;
  const high = rolling(); high.gear = 5; high.manual = true;
  drive(low, {}, 2); drive(high, {}, 2);
  assert.ok(low.rpm > high.rpm * 1.5);
  assert.ok(low.speed < high.speed - .3);
  const short = rolling(); short.gear = 3; short.manual = true;
  const long = rolling(); long.gear = 3; long.manual = true;
  drive(short, {}, 1, { surface: 'asphalt', tuning: { gearing: 'short' } });
  drive(long, {}, 1, { surface: 'asphalt', tuning: { gearing: 'long' } });
  assert.ok(short.rpm > long.rpm * 1.2);
});

test('wheel suspension, wheel spin and load transfer respond to broken roads', () => {
  const smooth = rolling(18), broken = rolling(18);
  let smoothMotion = 0, brokenMotion = 0;
  for (let i = 0; i < 240; i++) {
    integrate(smooth, { throttle: .4, steer: .4 }, 1 / 120, { surface: 'asphalt', roughness: 0 });
    integrate(broken, { throttle: .4, steer: .4 }, 1 / 120, { surface: 'broken', roughness: 1 });
    smoothMotion += smooth.wheels.reduce((sum, w) => sum + Math.abs(w.travelVelocity), 0);
    brokenMotion += broken.wheels.reduce((sum, w) => sum + Math.abs(w.travelVelocity), 0);
  }
  assert.ok(brokenMotion > smoothMotion * 2);
  assert.notEqual(broken.wheels[0].load, broken.wheels[1].load);
  for (const wheel of broken.wheels) {
    assert.ok(Number.isFinite(wheel.rotation) && Math.abs(wheel.rotation) > 20);
    assert.ok(wheel.load >= .25 && wheel.load <= 1.8);
    assert.ok(Math.abs(wheel.travel) <= .16);
    assert.ok(wheel.slip >= 0 && wheel.slip <= 1);
  }
});

test('car power and mass affect acceleration', () => {
  const light = drive(createState(), { throttle: 1 }, 8, { surface: 'asphalt', car: { mass: 1050, power: 290 } });
  const heavy = drive(createState(), { throttle: 1 }, 8, { surface: 'asphalt', car: { mass: 1700, power: 140 } });
  assert.ok(light.speed > heavy.speed + 5);
});

test('braking at rest engages a bounded reverse after a short delay', () => {
  const s = drive(createState(), { brake: 1 }, .2);
  assert.ok(Math.abs(s.speed) < .01);
  drive(s, { brake: 1 }, 8);
  assert.ok(s.speed < -4 && s.speed >= -6.6);
  assert.ok(s.rpm >= 900 && Number.isFinite(s.rpm));
});

test('gear requests are bounded and invalid requests do not corrupt the gearbox', () => {
  const s = createState(); s.manual = true;
  assert.equal(shift(s, NaN), false);
  assert.equal(s.gear, 1);
  assert.equal(shift(s, 99), true);
  assert.equal(s.gear, 6);
  drive(s, {}, .5);
  assert.equal(shift(s, -99), true);
  assert.equal(s.gear, -1);
});

test('manual neutral revs freely without propelling the car and coasts without gear braking', () => {
  const s = createState(); s.manual = true;
  assert.equal(shift(s, 0), true);
  drive(s, { throttle: 1 }, 2);
  assert.equal(s.gear, 0);
  assert.ok(s.rpm > 7200, `neutral revs ${s.rpm}`);
  assert.ok([s.x, s.z, s.speed, s.wheelSlip].every(value => Math.abs(value) < .001));
  drive(s, {}, 1);
  assert.ok(s.rpm < 1100, `released revs ${s.rpm}`);
  const neutral = rolling(20), second = rolling(20);
  neutral.manual = second.manual = true; neutral.gear = 0; second.gear = 2;
  drive(neutral, {}, 2); drive(second, {}, 2);
  assert.ok(neutral.speed > second.speed + .5, 'neutral disconnects the engine from the wheels');
});

test('manual reverse is selected explicitly and the brake never selects it', () => {
  const s = createState(); s.manual = true;
  drive(s, { brake: 1 }, 3);
  assert.equal(s.gear, 1);
  assert.ok(Math.abs(s.speed) < .001);
  assert.equal(shift(s, 0), true);
  drive(s, {}, .5);
  assert.equal(shift(s, -1), true);
  drive(s, { throttle: 1 }, 8);
  assert.ok(s.speed < -5 && s.speed > -10.1, `reverse speed ${s.speed}`);
  assert.equal(s.gear, -1);
  assert.ok(s.z > 10);
  drive(s, { brake: 1 }, 4);
  assert.ok(Math.abs(s.speed) < .01, `reverse braking left ${s.speed}`);
  drive(s, { brake: 1 }, 2);
  assert.ok(Math.abs(s.speed) < .01, 'holding the brake cannot accelerate backwards');
  assert.equal(shift(s, 0), true);
  drive(s, {}, .5);
  assert.equal(shift(s, 1), true);
  drive(s, { throttle: 1 }, 4);
  assert.ok(s.speed > 10, 'a stopped reverse maneuver can return to first gear');
});

test('direction interlock prevents a driving-speed reverse or forward engagement', () => {
  const s = rolling(15); s.manual = true;
  assert.equal(shift(s, -1), false);
  assert.equal(s.gear, 1);
  assert.equal(shift(s, 0), true, 'neutral remains available while moving');
  drive(s, {}, .5);
  assert.equal(shift(s, -1), false, 'neutral cannot bypass the reverse interlock');
  const reversing = rolling(-4); reversing.manual = true; reversing.gear = -1;
  assert.equal(shift(reversing, 1), false);
  assert.equal(reversing.gear, -1);
});

test('countdown revs and shifts change the engine without moving the held car', () => {
  const s = createState(); s.manual = true; s.gear = 0;
  for (let i = 0; i < 120; i++) updateStationaryEngine(s, { throttle: 1 }, 1 / 120);
  assert.ok(s.rpm > 7200);
  assert.deepEqual([s.x, s.z, s.vx, s.vz, s.speed], [0, 0, 0, 0, 0]);
  assert.ok(s.wheels.every(w => w.rotation === 0 && w.travel === 0));
  assert.equal(shift(s, 1), true);
  for (let i = 0; i < 60; i++) updateStationaryEngine(s, { throttle: .8 }, 1 / 120);
  assert.equal(s.shiftRemaining, 0);
  assert.equal(s.gear, 1);
  assert.equal(s.speed, 0);
  drive(s, { throttle: 1 }, 1);
  assert.ok(s.speed > 3, 'releasing the start hold engages the selected gear');
});

test('returning to automatic from neutral restores forward drive', () => {
  const s = createState(); s.manual = true; s.gear = 0;
  drive(s, { throttle: 1 }, 1);
  s.manual = false;
  drive(s, { throttle: 1 }, 3);
  assert.ok(s.gear >= 1 && s.gear <= 6);
  assert.ok(s.speed > 8);
});

test('manual brakes hold a neutral car on a moderate downhill and low grip still matters', () => {
  const held = createState(); held.manual = true; held.gear = 0;
  drive(held, { brake: 1 }, 3, { surface: 'asphalt', slope: -.1 });
  assert.ok(Math.abs(held.speed) < .01);
  assert.ok(Math.abs(held.z) < .01);
  const comfortable = drive(rolling(), { brake: 1 }, 1, { surface: 'asphalt', gripMultiplier: 1.2 });
  const difficult = drive(rolling(), { brake: 1 }, 1, { surface: 'asphalt', gripMultiplier: .8 });
  assert.ok(comfortable.speed < difficult.speed - 2);
});

test('wheel load starts balanced for both front-heavy and rear-heavy cars', () => {
  for (const frontWeight of [.43, .58]) {
    const s = drive(createState(), {}, 1, { surface: 'asphalt', car: { frontWeight } });
    for (const wheel of s.wheels) assert.ok(Math.abs(wheel.load - 1) < .001, `load ${wheel.load}`);
  }
});

test('fixed substeps are consistent at 60 and 120 Hz', () => {
  const a = drive(createState(), { throttle: 1, steer: .3 }, 6, { surface: 'gravel' }, 120);
  const b = drive(createState(), { throttle: 1, steer: .3 }, 6, { surface: 'gravel' }, 60);
  assert.ok(Math.abs(a.x - b.x) < 1e-7);
  assert.ok(Math.abs(a.z - b.z) < 1e-7);
  assert.ok(Math.abs(a.yaw - b.yaw) < 1e-7);
});

test('long mixed inputs remain finite on every surface, including suspension and tires', () => {
  for (const surface of ['asphalt', 'gravel', 'snow', 'sand', 'broken']) {
    const s = createState();
    for (let i = 0; i < 120 * 60; i++) {
      integrate(s, { throttle: i % 2400 < 1500 ? 1 : 0, brake: i % 2400 >= 1500 ? .8 : 0, steer: Math.sin(i / 190), handbrake: i % 1900 > 1750 }, 1 / 120, { surface, wetness: .5, slope: Math.sin(i / 1500) * .1, offroad: i % 3200 > 3000 });
      assert.ok(Math.hypot(s.vx, s.vz) < 65, `${surface}: runaway velocity`);
    }
    for (const field of ['x', 'z', 'speed', 'side', 'yaw', 'yawRate', 'rpm', 'suspension', 'wheelSlip']) assert.ok(Number.isFinite(s[field]), `${surface}: ${field}`);
  }
});

test('reset clears momentum while preserving placement and manual selection', () => {
  const s = drive(createState(), { throttle: 1, steer: 1, handbrake: true }, 4);
  s.manual = true;
  const position = [s.x, s.z, s.yaw];
  resetDynamics(s);
  assert.deepEqual([s.x, s.z, s.yaw], position);
  assert.equal(s.manual, true);
  assert.deepEqual([s.speed, s.side, s.yawRate, s.vx, s.vz, s.wheelSlip], [0, 0, 0, 0, 0, 0]);
});

test('the Alpine recovers from a brief full steering input without snapping into a spin',async()=>{const {CARS}=await import('../app/content.js');for(const surface of ['asphalt','snow','sand','gravel']){const s=rolling(22);s.gear=3;const context={surface,car:CARS.find(c=>c.id==='alpine'),tuning:{tires:surface==='snow'?'snow':surface==='sand'?'sand':'gravel'},assist:'sport'};for(let i=0;i<240;i++)integrate(s,{throttle:.35,steer:i<54?1:0},1/120,context);assert.ok(Math.abs(s.yaw)<.65,`${surface}: unexpected spin`);assert.ok(Math.abs(s.yawRate)<.08,`${surface}: unstable yaw after release`);assert.ok(s.speed>15)}});
