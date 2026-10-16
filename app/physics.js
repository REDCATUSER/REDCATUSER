// Metres, seconds and kilograms. The car looks down -Z; positive steering turns right.
export const ratios = [0, 3.2, 2.15, 1.55, 1.19, .96, .80];
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const gravity = 9.81;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const surfaces = {
  asphalt: { grip: 1.06, rolling: .017, roughness: .06, wet: .38 },
  gravel: { grip: .77, rolling: .033, roughness: .28, wet: .16 },
  snow: { grip: .36, rolling: .027, roughness: .20, wet: .13 },
  sand: { grip: .60, rolling: .056, roughness: .42, wet: .05 },
  grass: {grip:.48,rolling:.062,roughness:.55,wet:.28},
  broken: { grip: .82, rolling: .034, roughness: .80, wet: .30 }
};
const tireGrip = {
  mixed: { asphalt: .95, gravel: 1.08, snow: .84, sand: .97, broken: 1.03 },
  asphalt: { asphalt: 1.10, gravel: .83, snow: .49, sand: .75, broken: .94 },
  snow: { asphalt: .80, gravel: .91, snow: 1.67, sand: .87, broken: .88 },
  sand: { asphalt: .83, gravel: .98, snow: .65, sand: 1.34, broken: .90 }
};

export function createState() {
  return {
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, side: 0, steer: 0,
    yawRate: 0, rpm: 950, gear: 1, throttle: 0, brake: 0, offroad: false,
    handbrake: false, shiftRemaining: 0, shiftDuration: .40, shiftFrom: 1,
    shiftStartRPM: 950, manual: false, collision: 0, reverseHold: 0,
    engineLoad: 0, wheelSlip: 0, suspension: 0, distanceTravelled: 0,
    lateralAcceleration: 0, longitudinalAcceleration: 0,
    wheels: Array.from({ length: 4 }, () => ({ slip: 0, load: 1, rotation: 0, travel: 0, travelVelocity: 0 }))
  };
}

// Use after repositioning the car, so its old yaw inertia cannot affect a restart.
export function resetDynamics(s) {
  s.vx = s.vz = s.speed = s.side = s.yawRate = s.steer = 0;
  s.rpm = 950; s.gear = 1; s.shiftFrom = 1; s.shiftRemaining = 0;
  s.throttle = s.brake = s.engineLoad = s.wheelSlip = s.reverseHold = 0;
  s.lateralAcceleration = s.longitudinalAcceleration = s.suspension = 0;
  s.handbrake = false;
  s.wheels = createState().wheels;
  return s;
}

export function shift(s, requestedGear) {
  if (!Number.isFinite(requestedGear) || s.shiftRemaining > 0) return false;
  const gear = clamp(Math.round(requestedGear), -1, 6);
  if (gear === s.gear) return false;
  // Selecting neutral is always safe. Direction changes need the car almost
  // stopped, so a missed downshift cannot throw the transmission into reverse.
  const forward = finite(s.vx) * -Math.sin(finite(s.yaw)) + finite(s.vz) * -Math.cos(finite(s.yaw));
  if ((gear === -1 && forward > 1.2) || (gear > 0 && forward < -1.2)) return false;
  s.shiftFrom = s.gear;
  s.shiftStartRPM = s.rpm;
  s.gear = gear;
  s.shiftRemaining = clamp(finite(s.shiftDuration, .40), .20, .8);
  return true;
}

// The start marshal holds the car while the driver works the throttle and
// gearbox. This updates only the unloaded engine/clutch: no hidden movement,
// wheel spin or suspension is introduced before the green light.
export function updateStationaryEngine(s, input = {}, dt = 1 / 120) {
  if (!Number.isFinite(dt) || dt <= 0) return s;
  const duration = Math.min(dt, .10);
  s.throttle = clamp(finite(input.throttle), 0, 1);
  s.brake = clamp(finite(input.brake), 0, 1);
  s.shiftRemaining = Math.max(0, finite(s.shiftRemaining) - duration);
  const targetRPM = 950 + s.throttle * 6450;
  s.rpm = finite(s.rpm, 950) + (targetRPM - finite(s.rpm, 950)) * (1 - Math.exp(-duration * (s.throttle ? 7 : 4)));
  s.engineLoad = s.throttle * .22;
  return s;
}

function contextFor(context, legacyDistance) {
  if (typeof context === 'number') {
    return { surface: 'gravel', legacyGrip: clamp(context / 5.5, .1, 2), offroad: legacyDistance > 6.6 };
  }
  return context || {};
}

// A force-based bicycle model: the front and rear tires develop lateral forces,
// and their moments rotate the body. Steering never directly rotates velocity.
function advance(s, input, dt, context) {
  const surfaceName = surfaces[context.surface] ? context.surface : 'gravel';
  const surface = surfaces[surfaceName], tuning = context.tuning || {}, car = context.car || {};
  const tireName = tuning.tires === 'road' ? 'asphalt' : tuning.tires === 'gravel' ? 'mixed' : tuning.tires;
  const tires = tireGrip[tireName] || tireGrip.mixed;
  const mass = clamp(finite(car.mass, 1240), 650, 2200);
  const powerValue = finite(car.power, 250);
  const horsepower = clamp(powerValue < 10 ? powerValue * 250 : powerValue, 70, 650);
  const wheelbase = clamp(finite(car.wheelbase, 2.60), 2.1, 3.3), frontShare=clamp(finite(car.frontWeight,car.driveType==='rwd'?.46:.57),.35,.65),frontArm = wheelbase * (1-frontShare), rearArm = wheelbase * frontShare;
  const inertia = mass * wheelbase * wheelbase * .30, wheelRadius = .33;
  const wetness = clamp(finite(context.wetness), 0, 1);
  const roughness = clamp(finite(context.roughness, surface.roughness), 0, 1);
  const slope = clamp(finite(context.slope), -1.35, 1.35), crossSlope=clamp(finite(context.crossSlope),-1.35,1.35);
  s.offroad = Boolean(context.offroad);
  const grip = surface.grip * (tires[surfaceName]||.84) * (1 - wetness * surface.wet)
    * (s.offroad ? .68 : 1) * finite(context.legacyGrip, 1) * clamp(finite(context.gripMultiplier, 1), .5, 1.4);
  const normal = mass * gravity / Math.sqrt(1+Math.tan(slope)**2+Math.tan(crossSlope)**2);

  s.shiftRemaining = Math.max(0, finite(s.shiftRemaining) - dt);
  s.collision = Math.max(0, finite(s.collision) - dt);
  s.throttle = clamp(finite(input.throttle), 0, 1);
  s.brake = clamp(finite(input.brake), 0, 1);
  s.handbrake = Boolean(input.handbrake);
  // Switching back to automatic restores its forward range. Reverse in the
  // automatic gearbox is still selected by holding the brake near standstill.
  if (!s.manual && s.gear < 1) {
    s.gear = 1; s.shiftFrom = 1; s.shiftRemaining = 0;
  }
  const targetSteer = clamp(finite(input.steer), -1, 1);
  s.steer += (targetSteer - s.steer) * (1 - Math.exp(-dt * (targetSteer ? 7.5 : 11)));
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
  const forward = s.vx * fx + s.vz * fz, lateral = s.vx * rx + s.vz * rz;
  const speed = Math.abs(forward), omega = -finite(s.yawRate);
  // Keep a usable turning radius in slow hairpins, without the abrupt full
  // lock that made the short-wheelbase Alpine snap at road speeds.
  const steeringAngle = s.steer * .58 / (1 + speed * .13 + speed*speed*.0025);
  const slipDenominator = Math.max(speed, 4);
  const frontSlip = steeringAngle * clamp(forward / 2, -1, 1) - Math.atan2(lateral + omega * frontArm, slipDenominator);
  const rearSlip = -Math.atan2(lateral - omega * rearArm, slipDenominator);
  const suspensionGrip = tuning.suspension === 'soft' ? 1 + roughness * .09 : tuning.suspension === 'firm' ? 1.025 - roughness * .18 : 1;
  const transfer = clamp(finite(s.longitudinalAcceleration) * mass * .47 / wheelbase, -normal * .18, normal * .18);
  const frontNormal = normal * frontShare - transfer, rearNormal = normal * (1-frontShare) + transfer;
  const frontLimit = Math.max(1, frontNormal * grip * suspensionGrip);
  const rearLimit = Math.max(1, rearNormal * grip * suspensionGrip * (s.handbrake ? .28 : 1.04));
  const stiffness = mass / 1240;
  let frontForce = frontLimit * Math.tanh(frontSlip * 62000 * stiffness / frontLimit);
  let rearForce = rearLimit * Math.tanh(rearSlip * 70000 * stiffness / rearLimit);
  let lateralForce = frontForce + rearForce;

  const finalDrive = 4.10 * (tuning.gearing === 'short' ? 1.13 : tuning.gearing === 'long' ? .89 : 1);
  const selectedGear = clamp(Math.round(finite(s.gear, 1)), -1, 6);
  const direction = selectedGear === -1 ? -1 : selectedGear > 0 ? 1 : 0;
  const ratio = selectedGear === -1 ? 3.10 : ratios[selectedGear];
  const wheelRPM = speed / (wheelRadius * 2 * Math.PI) * 60;
  const coupledRPM = wheelRPM * ratio * finalDrive;
  let targetRPM = selectedGear === 0 ? 950 + s.throttle * 6450 : clamp(Math.max(950 + s.throttle * 700 * clamp(1 - speed / 5, 0, 1), coupledRPM), 900, 7600);
  if (s.shiftRemaining > 0) {
    // Unloaded engine and falling revs while the clutch is open; re-engage smoothly.
    const progress = 1 - s.shiftRemaining / s.shiftDuration;
    targetRPM = clamp(s.shiftStartRPM + (targetRPM - s.shiftStartRPM) * clamp(progress / .8, 0, 1) - Math.sin(progress * Math.PI) * 400, 900, 7600);
  }
  s.rpm += (targetRPM - s.rpm) * (1 - Math.exp(-dt * 14));
  if (!s.manual && s.shiftRemaining === 0) {
    if (s.rpm > 6750 && s.gear < 6) shift(s, s.gear + 1);
    else if (s.rpm < 2850 && s.gear > 1) shift(s, s.gear - 1);
  }
  const shiftCut = s.shiftRemaining > .08 ? 0 : 1 - s.shiftRemaining / .08;
  const revLimiter = s.rpm > 7350 ? .12 : 1;
  const torqueCurve = .60 + .40 * Math.sin(clamp((s.rpm - 900) / 6800, 0, 1) * Math.PI);
  const configuredTopSpeed = finite(car.topSpeed, 46);
  const topSpeed = (configuredTopSpeed > 100 ? configuredTopSpeed / 3.6 : configuredTopSpeed)
    * (surfaceName === 'sand' ? .86 : surfaceName === 'snow' ? .92 : 1);
  const speedLimiter = clamp(((direction < 0 ? 10 : topSpeed) - direction * forward) / (direction < 0 ? 2 : 4), 0, 1);
  const health=clamp(1-clamp(finite(context.damage),0,1)*.55,.25,1);
  const driveDemand = s.throttle * horsepower * health * 1.22 * torqueCurve * ratio * finalDrive * .86 / wheelRadius * shiftCut * revLimiter * speedLimiter;
  s.engineLoad = s.throttle * shiftCut;
  const frictionCircle = Math.sqrt(Math.max(.08, 1 - (lateralForce / Math.max(normal * grip * 1.1, 1)) ** 2));
  const availableTraction = normal * grip * frictionCircle;
  const drivenNormal=car.driveType==='fwd'?frontNormal:car.driveType==='rwd'?rearNormal:normal;
  const driveTraction=Math.max(1,drivenNormal*grip*frictionCircle);
  let longitudinalForce = Math.min(driveDemand, driveTraction) * direction;
  let driveSlip = clamp((driveDemand - driveTraction) / Math.max(driveTraction, 1), 0, 1);
  // Driven axles share grip between propulsion and turning. FWD pushes wide
  // under power; RWD progressively loosens the rear; AWD distributes the load.
  const powerShare=clamp(Math.abs(longitudinalForce)/driveTraction,0,1)*s.throttle;
  if(car.driveType==='fwd')frontForce*=1-powerShare*.18;
  if(car.driveType==='rwd')rearForce*=1-powerShare*.08;
  lateralForce=frontForce+rearForce;

  if (s.brake > 0) {
    if (s.manual) {
      s.reverseHold = 0;
      longitudinalForce -= Math.sign(forward) * Math.min(mass * 13.5 * s.brake, availableTraction, speed * mass / dt);
    } else if (forward > .35) {
      s.reverseHold = 0;
      longitudinalForce -= Math.min(mass * 13.5 * s.brake, availableTraction, forward * mass / dt);
    } else {
      s.reverseHold = finite(s.reverseHold) + dt;
      longitudinalForce -= s.reverseHold > .35 ? Math.min(mass * 4.2 * s.brake * clamp((6.5 + forward) / 2, 0, 1), availableTraction) : forward * mass / dt;
    }
  } else s.reverseHold = 0;
  if (!s.manual && forward < -.35 && s.throttle) longitudinalForce = Math.min(mass * 10 * s.throttle, availableTraction);
  if (s.handbrake && speed > .01) longitudinalForce -= Math.sign(forward) * Math.min(mass * 4.8, speed * mass / dt);
  if (!s.throttle && !s.brake && speed > .01) {
    // Lower ratios provide more engine braking, including on downhill stages.
    longitudinalForce -= Math.sign(forward) * Math.min(150 + ratio * 105 + coupledRPM * .045, speed * mass / dt);
  }
  const rolling = surface.rolling + (s.offroad ? .065 : 0) + roughness * .004;
  const resistance = normal * rolling + .46 * forward * forward + (surfaceName === 'sand' ? speed * 16 : 0);
  if (speed > .001) longitudinalForce -= Math.sign(forward) * Math.min(resistance, speed * mass / dt);
  const downhillForce=-normal*Math.tan(slope);
  longitudinalForce += downhillForce;
  // A manual foot brake must hold at rest in N or R instead of slowly engaging
  // the automatic reverse behavior. Grip still limits holding on steep ice.
  if (s.manual && s.brake && speed < .15) {
    const brakeCapacity = Math.min(mass * 13.5 * s.brake, availableTraction);
    longitudinalForce -= clamp(longitudinalForce + forward * mass / dt, -brakeCapacity, brakeCapacity);
  }
  // A handbrake can hold a parked car only while the tires can support the
  // downslope force. Steep snow banks still overcome the available grip.
  if(s.handbrake&&speed<.15)longitudinalForce-=clamp(longitudinalForce,-availableTraction*.8,availableTraction*.8);
  const longitudinalAcceleration = longitudinalForce / mass;
  const lateralAcceleration = (lateralForce-normal*Math.tan(crossSlope)) / mass;
  // Rotation follows tire force moments, with extra damping only at parking speed.
  const stability=context.assist==='comfort'?3.2:context.assist==='sport'||!context.assist?1.8:0;
  const desiredYaw=forward/wheelbase*Math.tan(steeringAngle),yawError=omega-desiredYaw;
  const correction=!s.handbrake&&speed>4?clamp(yawError*stability,-4,4):0;
  const yawLimit=s.handbrake?1.8:clamp(grip*gravity/Math.max(speed,4)*1.3,.22,1.8);
  const omegaNext = clamp(omega + ((frontForce * frontArm - rearForce * rearArm) / inertia - omega * (2.4 / (1 + speed * .5))-correction) * dt, -yawLimit, yawLimit);
  s.yawRate = -omegaNext;
  s.vx += (fx * longitudinalAcceleration + rx * lateralAcceleration) * dt;
  s.vz += (fz * longitudinalAcceleration + rz * lateralAcceleration) * dt;
  s.yaw += s.yawRate * dt;
  s.x += s.vx * dt; s.z += s.vz * dt;
  const nextFX = -Math.sin(s.yaw), nextFZ = -Math.cos(s.yaw);
  s.speed = s.vx * nextFX + s.vz * nextFZ;
  s.side = s.vx * Math.cos(s.yaw) - s.vz * Math.sin(s.yaw);
  s.longitudinalAcceleration = longitudinalAcceleration;
  s.lateralAcceleration = lateralAcceleration;
  s.distanceTravelled = finite(s.distanceTravelled) + Math.hypot(s.vx, s.vz) * dt;

  const spring = tuning.suspension === 'soft' ? 13 : tuning.suspension === 'firm' ? 23 : 18;
  const bumpAmplitude = roughness * (s.offroad ? .13 : .065) * clamp(speed / 12, 0, 1);
  let totalTravel = 0, totalSlip = 0;
  for (let i = 0; i < 4; i++) {
    const wheel = s.wheels[i], front = i < 2, right = i % 2 === 1;
    const bump = bumpAmplitude * (Math.sin(s.distanceTravelled * 1.9 + i * 1.7) * .65 + Math.sin(s.distanceTravelled * 4.7 + i) * .35);
    const transferTravel = clamp(-longitudinalAcceleration * .0018 * (front ? 1 : -1) + lateralAcceleration * .0015 * (right ? 1 : -1), -.035, .035);
    const targetTravel = bump + transferTravel;
    wheel.travelVelocity += ((targetTravel - wheel.travel) * spring * spring - wheel.travelVelocity * spring * 1.5) * dt;
    wheel.travel = clamp(wheel.travel + wheel.travelVelocity * dt, -.16, .16);
    wheel.load = clamp((front ? frontNormal / (normal * frontShare) : rearNormal / (normal * (1-frontShare))) + (right ? -1 : 1) * lateralAcceleration * .045 - wheel.travel * 1.6, .25, 1.8);
    wheel.slip = clamp(Math.abs(front ? frontSlip : rearSlip) * 2.5 + driveSlip * .45 + (s.handbrake && !front && speed > 1 ? .7 : 0), 0, 1);
    wheel.rotation += (forward / wheelRadius) * (s.handbrake && !front ? .15 : 1 + driveSlip * .22) * dt;
    totalTravel += wheel.travel; totalSlip += wheel.slip;
  }
  s.wheelSlip = totalSlip / 4;
  s.suspension = totalTravel / 4;
}

export function integrate(s, input = {}, dt = 1 / 120, surfaceOrContext = {}, legacyDistance = 0) {
  if (!Number.isFinite(dt) || dt <= 0) return s;
  if (!s.wheels || s.wheels.length !== 4) s.wheels = createState().wheels;
  for (const key of ['x', 'z', 'yaw', 'vx', 'vz', 'steer', 'rpm']) s[key] = finite(s[key], key === 'rpm' ? 950 : 0);
  const context = contextFor(surfaceOrContext, legacyDistance);
  // Bound catch-up work after a suspended tab, while preserving small normal steps.
  const duration = Math.min(dt, .10), steps = Math.max(1, Math.ceil(duration * 120));
  for (let i = 0; i < steps; i++) advance(s, input, duration / steps, context);
  return s;
}
