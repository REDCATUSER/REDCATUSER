import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Original procedural rally cars. Every surface and texture is made locally;
// none of the cars depends on a remote model, font, image or service.
const PROFILES = {
  club: { label: 'CLUB 1600', length: 3.98, width: 1.78, wheelbase: 2.48, roof: 1.70, roofRear: .85, tail: 1.05, lamp: 'round', spoiler: .16, color: 0xe5e9e9, accent: 0xed513b },
  alpine: { label: 'ALPINE SPORT', length: 4.10, width: 1.80, wheelbase: 2.40, roof: 1.58, roofRear: .60, tail: .89, lamp: 'round', spoiler: .08, color: 0x337db4, accent: 0xe8e6d5 },
  escort: { label: 'FOREST RS', length: 4.16, width: 1.80, wheelbase: 2.50, roof: 1.69, roofRear: .66, tail: 1.00, lamp: 'round', spoiler: .13, color: 0xf1f0e5, accent: 0x396ea1 },
  delta: { label: 'DELTA INTEGRALE', length: 3.96, width: 1.86, wheelbase: 2.48, roof: 1.73, roofRear: .96, tail: 1.10, lamp: 'quad', spoiler: .20, color: 0xf2f0df, accent: 0xd34136 },
  celica: { label: 'CELICA GT RALLY', length: 4.40, width: 1.87, wheelbase: 2.56, roof: 1.64, roofRear: .72, tail: .95, lamp: 'oval', spoiler: .28, color: 0xebefe7, accent: 0xcb333c },
  quattro: { label: 'AUDI QUATTRO WRC', length: 4.42, width: 1.90, wheelbase: 2.52, roof: 1.70, roofRear: .76, tail: 1.03, lamp: 'rect', spoiler: .31, color: 0xe7e5d8, accent: 0xa62c36 },
};
const AXIS_Y = new T.Vector3(0, 1, 0);
const clamp = T.MathUtils.clamp;
const mat = (color, roughness = .72, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });

function roundedGeometry(w, h, d, radius = .04) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2));
}

function disposeGroup(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

function canvasTexture(width, height, draw) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  draw(context, width, height);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, context, texture };
}

const TEXTURE_SIZES = { low: 256, medium: 512, high: 1024 };

// All materials are original and work offline. A seeded grain avoids flicker
// and preserves exactly the same upholstery pattern at each quality setting.
function surfaceTexture(kind, size) {
  return canvasTexture(size, size, (context, width, height) => {
    const pixels = context.createImageData(width, height);
    let seed = 92747;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const nx = x / width * 512, ny = y / height * 512, noise = (seed >>> 24) / 255;
      let value = 230;
      if (kind === 'leather') value = 210 + noise * 38 - (Math.sin(nx * .8 + Math.sin(ny * .3)) > .87 ? 15 : 0);
      if (kind === 'fabric') value = 177 + noise * 30 + (Math.floor(nx / 3) % 2 ? 18 : 0) + (Math.floor(ny / 3) % 2 ? 17 : 0);
      if (kind === 'carbon') {
        const row = Math.floor(ny / 12), column = Math.floor(nx / 12);
        const weave = (column + row) % 4 < 2;
        value = (weave ? 156 : 218) + 15 * Math.sin((weave ? nx : ny) * Math.PI / 3) + noise * 12;
      }
      if (kind === 'tread') {
        const groove = (nx + (Math.floor(ny / 64) % 2 ? -ny : ny) * .45) % 66;
        value = groove < 9 || ny % 128 < 8 ? 65 : 210 + noise * 33;
      }
      if (kind === 'metal') value = 205 + noise * 14 + Math.sin(ny * .85) * 20;
      const index = (y * width + x) * 4;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  });
}

// Group detailed bolts, seams, trim and upholstery by material so the richer
// cars do not cost hundreds of separate draw calls on an ordinary laptop.
function batchStatic(parent, excluded = new Set()) {
  parent.updateWorldMatrix(true, true);
  const inverse = parent.matrixWorld.clone().invert(), selected = [], groups = new Map();
  function collect(object) {
    if (excluded.has(object)) return;
    if (object.isMesh && !object.isInstancedMesh && !Array.isArray(object.material)) selected.push(object);
    for (const child of object.children) collect(child);
  }
  for (const child of parent.children) collect(child);
  for (const object of selected) {
    let geometry = object.geometry.clone();
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (!groups.has(object.material)) groups.set(object.material, []);
    groups.get(object.material).push(geometry);
  }
  for (const object of selected) { object.removeFromParent(); object.geometry.dispose(); }
  for (const [material, geometries] of groups) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const object = new T.Mesh(merged, material);
    object.name = 'batched-car-detail'; object.castShadow = !material.transparent; object.receiveShadow = true; parent.add(object);
  }
}

export function createCar(scene, options = {}) {
  const root = new T.Group();
  root.name = 'rally-car';
  scene.add(root);
  let config = { id: 'club', color: null, tuning: {}, ...options };
  let model, headlights = false, disposed = false, latestInput = {};
  const api = {
    root,
    setConfig(next = {}) {
      const oldId = config.id, oldQuality = config.textureQuality;
      config = { ...config, ...next, tuning: { ...config.tuning, ...(next.tuning || {}) } };
      if ((next.id && next.id !== oldId) || (next.textureQuality && next.textureQuality !== oldQuality)) {
        disposeGroup(root); root.clear(); build();
        update({...latestInput,dt:0});
      } else {
        model.paint.color.set(config.color ?? model.profile.color);
        model.tire.roughness = config.tuning.tires === 'snow' ? .96 : .9;
      }
      api.setHeadlights(headlights);
      root.updateMatrixWorld(true);
      return api;
    },
    setHeadlights(on) {
      headlights = Boolean(on);
      if (!model) return;
      model.lampMaterial.emissiveIntensity = headlights ? 5 : .035;
      model.lights.forEach(light => { light.visible = headlights; light.intensity = headlights ? 1650 : 0; });
    },
    dispose() {
      if (disposed) return;
      disposed = true; disposeGroup(root); root.removeFromParent(); root.clear();
    },
    update(input = {}) { latestInput=input;if (!disposed) update(input); },
  };

  function build() {
    const profile = PROFILES[config.id] || PROFILES.club;
    const L = profile.length, W = profile.width, half = L / 2, axle = profile.wheelbase / 2;
    const paint = mat(config.color ?? profile.color, .30, .34);
    const accent = mat(profile.accent, .37, .15), dark = mat(0x171d23, .80), rubber = mat(0x101419, .94);
    const satin = mat(0x333c43, .58), silver = mat(0xbac1bf, .28, .82), rimMaterial = mat(0xe3e5dc, .35, .55);
    const blackMetal = mat(0x272e33, .33, .68), seatMaterial = mat(0x222b35, .97), beltMaterial = mat(profile.accent, .9);
    const size = TEXTURE_SIZES[config.textureQuality] || TEXTURE_SIZES.medium;
    const leather = surfaceTexture('leather', size), fabric = surfaceTexture('fabric', size), carbon = surfaceTexture('carbon', size), treadMap = surfaceTexture('tread', size), metal = surfaceTexture('metal', size);
    for (const [target, map, bump] of [[dark,leather,.007],[seatMaterial,fabric,.009],[satin,carbon,.003],[rubber,treadMap,.010],[silver,metal,.0015]]) {
      if (!map) continue;
      target.map=map.texture;target.bumpMap=map.texture;target.bumpScale=bump;
      map.texture.wrapS=map.texture.wrapT=T.RepeatWrapping;
    }
    const glass = new T.MeshPhysicalMaterial({ color: 0xa9c7ca, transparent: true, opacity: .20, roughness: .07, metalness: .08, side: T.DoubleSide, depthWrite: false });
    const lampMaterial = new T.MeshStandardMaterial({ color: 0xf7f0d0, emissive: 0xffedb8, emissiveIntensity: .035, roughness: .16, metalness: .18 });
    const rearMaterial = new T.MeshStandardMaterial({ color: 0xb82c24, emissive: 0xf32a0d, emissiveIntensity: .12, roughness: .25 });
    const exterior = new T.Group(), inside = new T.Group(), cockpitShell = new T.Group();
    exterior.name = 'exterior'; inside.name = 'driver-interior'; cockpitShell.name = 'cockpit-visible-shell';
    root.add(exterior, inside, cockpitShell);
    const body = new T.Group(); body.name = 'sprung-body'; exterior.add(body);

    function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
      const object = new T.Mesh(geometry, material);
      object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
    }
    function box(parent, w, h, d, x, y, z, material, round = .025) {
      return mesh(parent, round ? roundedGeometry(w, h, d, round) : new T.BoxGeometry(w, h, d), material, x, y, z);
    }
    function beam(parent, a, b, radius, material, sides = 8) {
      const delta = new T.Vector3().subVectors(b, a);
      const object = mesh(parent, new T.CylinderGeometry(radius, radius, delta.length(), sides), material);
      object.position.copy(a).add(b).multiplyScalar(.5);
      object.quaternion.setFromUnitVectors(AXIS_Y, delta.normalize());
      return object;
    }
    function line(parent, points, material, radius = .006) {
      for (let i = 1; i < points.length; i++) beam(parent, new T.Vector3(...points[i - 1]), new T.Vector3(...points[i]), radius, material, 5);
    }
    function quad(parent, points, material) {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]); geometry.computeVertexNormals();
      return mesh(parent, geometry, material);
    }

    // A continuous, tapered shell with real wheel openings, shoulder curvature
    // and rounded front/rear corners rather than a stack of rectangular blocks.
    const shellPositions = [], shellIndices = [], stationCount = 120, ringCount = 30;
    function section(z) {
      const u = z / half;
      const taper = 1 - .10 * Math.pow(Math.abs(u), 5);
      const frontDrop = .14 * Math.pow(Math.max(-u, 0), 5);
      const rearDrop = .06 * Math.pow(Math.max(u, 0), 5);
      const top = 1.01 - frontDrop - rearDrop;
      let bottom = .43;
      for (const center of [-axle, axle]) {
        const offset = z - center;
        if (Math.abs(offset) < .465) bottom = Math.max(bottom, .40 + Math.sqrt(.465 ** 2 - offset ** 2));
      }
      return { width: W * .5 * taper, top, bottom };
    }
    for (let i = 0; i <= stationCount; i++) {
      const z = -half + i / stationCount * L, p = section(z);
      for (let j = 0; j <= ringCount; j++) {
        const angle = -Math.PI / 2 + j / ringCount * Math.PI;
        const x = Math.sin(angle) * p.width;
        // Upper surface smoothly wraps over the two shoulders.
        const y = j < 2 || j > ringCount - 2 ? T.MathUtils.lerp(p.bottom, p.top, j < 2 ? j / 2 : (ringCount - j) / 2) : p.top + Math.cos(angle) * .045;
        shellPositions.push(x, y, z);
        if (i && j) {
          const k = i * (ringCount + 1) + j;
          shellIndices.push(k, k - ringCount - 2, k - 1, k, k - ringCount - 1, k - ringCount - 2);
        }
      }
    }
    const shellGeometry = new T.BufferGeometry();
    shellGeometry.setAttribute('position', new T.Float32BufferAttribute(shellPositions, 3));
    shellGeometry.setIndex(shellIndices); shellGeometry.computeVertexNormals();
    mesh(body, shellGeometry, paint);
    const frontWidth = section(-half).width * 2, rearWidth = section(half).width * 2;
    box(body, frontWidth, .37, .10, 0, .66, -half + .015, paint, .035);
    box(body, rearWidth, .40, .10, 0, .68, half - .015, paint, .035);
    box(body, W * .98, .14, .22, 0, .47, -half + .035, dark, .035);
    box(body, W * .98, .13, .20, 0, .47, half - .02, dark, .03);
    box(body, W * .63, .19, .055, 0, .64, -half - .05, blackMetal, .02);
    for (let k = 0; k < 5; k++) box(body, W * .60, .014, .014, 0, .567 + k * .035, -half - .085, satin, .004);
    box(body, W * .90, .035, .30, 0, .386, -half + .045, blackMetal, .009);
    for (const side of [-1, 1]) {
      box(body, .085, .12, L * .50, side * W * .495, .46, .05, dark, .018);
      box(body, .23, .045, .35, side * W * .34, .43, half + .018, dark, .01);
      // Cut-out wheel wells and sculpted fender lips.
      for (const z of [-axle, axle]) {
        const arch = mesh(body, new T.TorusGeometry(.467, .045, 6, 32, Math.PI), paint, side * W * .505, .40, z);
        arch.rotation.y = Math.PI / 2;
        const inner = mesh(body, new T.TorusGeometry(.436, .037, 5, 24, Math.PI), dark, side * W * .486, .40, z);
        inner.rotation.y = Math.PI / 2;
        box(body, .11, .27, .045, side * W * .496, .29, z + .43, rubber, .008);
      }
      // Thin door shut lines, separate handle, sill and wing mirror.
      const x = side * (W * .497 + .005);
      line(body, [[x, .96, -.69], [x, .52, -.67], [x, .49, .53], [x, .96, .57]], dark, .004);
      box(body, .018, .045, .17, x + side * .012, .92, .37, blackMetal, .008);
      beam(body, new T.Vector3(side * W * .45, 1.09, -.69), new T.Vector3(side * (W * .55), 1.15, -.72), .018, dark);
      const mirror = box(body, .21, .12, .23, side * (W * .57), 1.17, -.73, paint, .04);
      box(mirror, .15, .075, .008, 0, 0, .12, silver, .01);
    }

    // Hood stampings, vents, towing eyes and rally identification.
    for (const side of [-1, 1]) {
      const crease = box(body, .017, .013, .93, side * .46, 1.046, -1.20, paint, .005);
      crease.rotation.y = side * -.045;
      for (let k = 0; k < 5; k++) box(body, .20, .007, .018, side * .33, 1.051, -.81 - k * .045, dark, .003);
      box(body, .045, .013, .06, side * .56, section(-half + .23).top + .035, -half + .23, blackMetal, .009);
    }
    const tow = mesh(body, new T.TorusGeometry(.045, .014, 6, 14), accent, -.47, .43, -half - .15);
    tow.rotation.x = .12;
    const stripeCanvas = canvasTexture(512, 512, (context, width, height) => {
      context.fillStyle = '#f0f1df'; context.fillRect(0, 0, width, height);
      context.fillStyle = '#' + accent.color.getHexString();
      context.fillRect(0, 0, 36, height); context.fillRect(width - 36, 0, 36, height);
      context.fillStyle = '#18252e'; context.font = '900 240px sans-serif'; context.textAlign = 'center'; context.fillText('7', width / 2, 365);
      context.font = 'bold 33px sans-serif'; context.fillText('HORIZON RALLY', width / 2, 65);
    });
    if (stripeCanvas) {
      const numberMaterial = new T.MeshBasicMaterial({ map: stripeCanvas.texture });
      for (const side of [-1, 1]) {
        const number = mesh(body, new T.PlaneGeometry(.46, .44), numberMaterial, side * (W / 2 + .011), .77, -.03);
        number.rotation.y = side * Math.PI / 2;
      }
    }
    for (const side of [-1, 1]) {
      box(body, .13, .008, 1.05, side * .22, 1.056, -1.21, accent, .004);
      box(body, .014, .075, .66, side * (W * .50 + .012), .57, .13, accent, .002);
    }

    const baseWidth = W * .44, roofWidth = W * .385;
    const frontBase = -.86, frontRoof = -.51, rearRoof = profile.roofRear, rearBase = Math.min(half - .25, profile.roofRear + .53);
    const roofY = profile.roof;
    // Roof panel has a curved cross-section and softened edges.
    box(body, roofWidth * 2, .09, rearRoof - frontRoof + .13, 0, roofY, (frontRoof + rearRoof) / 2, paint, .035);
    for (const side of [-1, 1]) {
      const baseX = side * baseWidth, topX = side * roofWidth;
      beam(body, new T.Vector3(baseX, 1.04, frontBase), new T.Vector3(topX, roofY, frontRoof), .043, paint);
      beam(body, new T.Vector3(topX, roofY, rearRoof), new T.Vector3(baseX, 1.03, rearBase), .065, paint);
      beam(body, new T.Vector3(topX, roofY, .26), new T.Vector3(baseX, 1.03, .26), .028, dark);
      beam(body, new T.Vector3(topX, roofY - .035, frontRoof), new T.Vector3(topX, roofY - .035, rearRoof), .025, dark);
      const points = [[baseX, 1.05, frontBase + .06], [baseX, 1.05, rearBase - .07], [topX, roofY - .055, rearRoof - .04], [topX, roofY - .055, frontRoof + .04]];
      quad(body, side > 0 ? points : [...points].reverse(), glass);
      box(body, .028, .024, rearBase - frontBase, baseX, 1.047, (rearBase + frontBase) / 2, blackMetal, .006);
    }
    quad(body, [[-baseWidth, 1.05, frontBase], [-roofWidth, roofY - .04, frontRoof], [roofWidth, roofY - .04, frontRoof], [baseWidth, 1.05, frontBase]], glass);
    quad(body, [[baseWidth, 1.04, rearBase], [roofWidth, roofY - .035, rearRoof], [-roofWidth, roofY - .035, rearRoof], [-baseWidth, 1.04, rearBase]], glass);
    for (const side of [-1, 1]) {
      const wiper = box(body, .012, .012, .42, side * .29, 1.094, frontBase - .007, dark, .004);
      wiper.rotation.set(-.46, side * .55, 0);
      for (let k = 0; k < 6; k++) box(body, .20, .008, .013, side * .42, roofY + .049, rearRoof - .26 + k * .035, dark, .003);
    }
    // Rear aerofoil and exhaust use separate supports and a round hollow tip.
    const spoilerY = profile.tail + profile.spoiler;
    for (const side of [-1, 1]) box(body, .045, profile.spoiler, .17, side * W * .31, profile.tail + profile.spoiler / 2, half - .25, blackMetal, .009);
    box(body, W * .87, .065, .28, 0, spoilerY, half - .24, paint, .02);
    const exhaust = mesh(body, new T.CylinderGeometry(.055, .055, .25, 16, 1, true), silver, .57, .40, half + .06);
    exhaust.rotation.x = Math.PI / 2;
    mesh(body, new T.CircleGeometry(.045, 16), dark, .57, .40, half + .188);
    for (const side of [-1, 1]) {
      box(body, .29, .16, .025, side * W * .34, .83, half + .065, rearMaterial, .018);
      box(body, .075, .065, .028, side * W * .26, .83, half + .084, mat(0xe3d19a, .3), .005);
    }
    box(body, .37, .075, .012, 0, .69, half + .078, mat(0xe5e7dd), .005);

    // Lamps have chrome buckets, textured-looking ribs and separate lenses.
    const lamps = [];
    function roundLamp(x, y, z, radius) {
      const bucket = mesh(body, new T.CylinderGeometry(radius + .025, radius + .01, .10, 20), blackMetal, x, y, z);
      bucket.rotation.x = Math.PI / 2;
      const lens = mesh(body, new T.CylinderGeometry(radius, radius, .018, 24), lampMaterial, x, y, z - .06);
      lens.rotation.x = Math.PI / 2;
      const rim = mesh(body, new T.TorusGeometry(radius + .007, .01, 6, 24), silver, x, y, z - .074);
      for (let k = -2; k <= 2; k++) {
        const rib = box(body, Math.sqrt(Math.max(0, radius * radius - (k * radius / 3) ** 2)) * 1.7, .005, .005, x, y + k * radius / 3, z - .074, silver, .001);
        rib.material = silver;
      }
      lamps.push(lens, rim);
    }
    for (const side of [-1, 1]) {
      if (profile.lamp === 'round' || profile.lamp === 'quad') {
        roundLamp(side * W * .345, .83, -half - .045, .115);
        if (profile.lamp === 'quad') roundLamp(side * W * .195, .83, -half - .048, .103);
      } else {
        box(body, .38, .16, .07, side * W * .32, .83, -half - .035, blackMetal, profile.lamp === 'oval' ? .065 : .01);
        box(body, .33, .13, .015, side * W * .32, .83, -half - .079, lampMaterial, profile.lamp === 'oval' ? .05 : .006);
        for (let k = 0; k < 6; k++) box(body, .004, .11, .006, side * W * .32 - .13 + k * .052, .83, -half - .092, silver, .001);
      }
      roundLamp(side * .25, .62, -half - .145, .112);
      box(body, .08, .045, .025, side * W * .46, .73, -half - .06, mat(0xe49a3d, .35), .005);
    }
    // Distinctive original box-flared silhouette and livery for the final car.
    if (config.id === 'quattro') {
      for (const side of [-1, 1]) {
        for (const z of [-axle, axle]) {
          box(body, .16, .10, .90, side * W * .48, .99, z, paint, .025);
          box(body, .075, .31, .10, side * W * .52, .75, z + .46, paint, .015);
        }
        for (let k = 0; k < 3; k++) {
          const stripe = box(body, .01, .14, .23, side * (W * .5 + .018), .82, .68 + k * .16, k === 1 ? mat(0x7c8586) : accent, .003);
          stripe.rotation.x = -.25;
        }
      }
      box(body, .45, .09, .53, 0, 1.10, -1.16, paint, .025);
      box(body, .35, .04, .015, 0, 1.106, -1.435, dark, .004);
    }

    // Cast-rim wheels with thick, rounded shoulders and instanced tread blocks.
    const wheels = [];
    for (const side of [-1, 1]) for (const z of [-axle, axle]) {
      const pivot = new T.Group(), spin = new T.Group();
      pivot.name = `${z < 0 ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}-wheel`;
      pivot.position.set(side * W * .50, .385, z); pivot.add(spin); root.add(pivot);
      const tire = mesh(spin, new T.CylinderGeometry(.355, .355, .245, 64, 1), rubber); tire.rotation.z = Math.PI / 2;
      for (const face of [-1, 1]) {
        const shoulder = mesh(spin, new T.TorusGeometry(.315, .055, 12, 64), rubber, face * .105, 0, 0);
        shoulder.rotation.y = Math.PI / 2;
        const sidewallRing = mesh(spin, new T.TorusGeometry(.277, .004, 4, 32), satin, face * .150, 0, 0);
        sidewallRing.rotation.y = Math.PI / 2;
      }
      const barrel = mesh(spin, new T.CylinderGeometry(.235, .235, .269, 24, 1), blackMetal); barrel.rotation.z = Math.PI / 2;
      const brake = mesh(spin, new T.CylinderGeometry(.197, .197, .018, 24), silver, side * .097, 0, 0); brake.rotation.z = Math.PI / 2;
      const rim = mesh(spin, new T.TorusGeometry(.215, .016, 5, 24), rimMaterial, side * .149, 0, 0); rim.rotation.y = Math.PI / 2;
      const hub = mesh(spin, new T.CylinderGeometry(.060, .060, .036, 12), rimMaterial, side * .151, 0, 0); hub.rotation.z = Math.PI / 2;
      for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4;
        const spoke = box(spin, .026, .185, .032, side * .15, Math.cos(angle) * .128, Math.sin(angle) * .128, rimMaterial, .007);
        spoke.rotation.x = angle;
      }
      const treadGeometry = new T.BoxGeometry(.108, .014, .049);
      const tread = new T.InstancedMesh(treadGeometry, rubber, 64);
      const dummy = new T.Object3D();
      for (let k = 0; k < 64; k++) {
        const angle = Math.floor(k / 2) / 32 * Math.PI * 2;
        dummy.position.set(k % 2 ? -.066 : .066, Math.cos(angle) * .361, Math.sin(angle) * .361);
        dummy.rotation.set(angle, 0, k % 2 ? .16 : -.16); dummy.updateMatrix(); tread.setMatrixAt(k, dummy.matrix);
      }
      tread.castShadow = true; spin.add(tread);
      const caliper = box(pivot, .04, .11, .09, side * .10, .01, .15, accent, .015);
      wheels.push({ pivot, spin, front: z < 0, side, baseY: .385, caliper, physicsIndex:(z < 0 ? 0 : 2)+(side>0?1:0) });
    }

    // The cockpit is real geometry with a clear driver's eye position. There
    // are no glass planes, arbitrary camera offsets or floating dashboard.
    box(inside, W * .85, .12, 3.0, 0, .35, .20, dark, .02);
    // Opaque firewall and footwell enclose the cabin independently of exterior
    // wheel/body visibility. These panels remain safely below the sight line.
    box(inside, W * .86, .58, .09, 0, .68, -.94, dark, .045);
    for (const side of [-1,1]) box(inside, .12, .50, 1.15, side*W*.43, .63, -.45, dark, .05);
    box(inside, .31, .37, 1.42, .08, .55, .15, satin, .03);
    box(inside, W * .84, .27, .47, 0, .95, -.62, dark, .06);
    box(inside, W * .82, .065, .42, 0, 1.103, -.65, satin, .025);
    box(inside, .42, .18, .12, -.39, 1.12, -.405, blackMetal, .035);
    for (const x of [-.64, .20, .62]) {
      const vent = mesh(inside, new T.CylinderGeometry(.052, .052, .018, 12), blackMetal, x, 1.04, -.37);
      vent.rotation.x = Math.PI / 2;
      for (let k = -1; k <= 1; k++) box(inside, .075, .008, .008, x, 1.04 + k * .022, -.355, satin, .002);
    }
    for (let k = 0; k < 5; k++) {
      box(inside, .025, .020, .026, .07 + k * .065, .985, -.36, k === 0 ? accent : silver, .004);
      box(inside, .025, .006, .008, .07 + k * .065, 1.012, -.35, dark, .002);
    }
    box(inside, .055, .07, .025, .12, .883, -.36, accent, .01);
    for (const x of [-.42, .43]) {
      box(inside, .49, .14, .60, x, .54, .45, seatMaterial, .055);
      const seatBack = box(inside, .50, .76, .20, x, .98, .77, seatMaterial, .06); seatBack.rotation.x = -.10;
      box(inside, .33, .25, .16, x, 1.42, .82, dark, .04);
      for (const side of [-1, 1]) {
        box(inside, .085, .24, .54, x + side * .24, .64, .46, seatMaterial, .025);
        box(inside, .07, .40, .13, x + side * .24, 1.08, .69, seatMaterial, .022);
        const belt = box(inside, .045, .60, .012, x + side * .11, 1.10, .642, beltMaterial, .004);
        belt.rotation.z = side * -.08;
      }
      box(inside, .07, .07, .025, x, .75, .43, silver, .01);
    }
    for (const side of [-1, 1]) {
      const x = side * W * .43;
      box(inside, .065, .41, 1.72, x, .82, .28, dark, .018);
      box(inside, .065, .07, .29, x - side * .04, .89, .11, satin, .01);
      beam(inside, new T.Vector3(x * .91, .47, 1.05), new T.Vector3(x * .91, roofY - .13, .86), .034, silver);
      beam(inside, new T.Vector3(x * .91, roofY - .13, .86), new T.Vector3(x * .91, roofY - .13, -.43), .032, silver);
      beam(inside, new T.Vector3(x * .91, .54, .93), new T.Vector3(x * .91, 1.01, -.44), .029, silver);
    }
    beam(inside, new T.Vector3(-W * .38, .51, 1.15), new T.Vector3(W * .38, roofY - .13, .91), .028, silver);
    beam(inside, new T.Vector3(W * .38, .51, 1.15), new T.Vector3(-W * .38, roofY - .13, .91), .028, silver);
    const extinguisher = mesh(inside, new T.CylinderGeometry(.065, .065, .38, 12), accent, .41, .46, -.06);
    extinguisher.rotation.x = Math.PI / 2;

    const gauge = canvasTexture(768, 256, context => context.fillRect(0, 0, 768, 256));
    if (gauge) {
      const display = mesh(inside, new T.PlaneGeometry(.378, .126), new T.MeshBasicMaterial({ map: gauge.texture }), -.39, 1.13, -.339);
      display.name = 'live-dashboard';
    }
    const plaque = canvasTexture(512, 128, context => {
      context.fillStyle = '#172029'; context.fillRect(0, 0, 512, 128);
      context.fillStyle = '#d9ded7'; context.font = 'bold 38px sans-serif'; context.textAlign = 'center'; context.fillText(profile.label, 256, 60);
      context.fillStyle = '#c99753'; context.font = '21px sans-serif'; context.fillText('RALLY HORIZON · FIRST EDITION', 256, 104);
    });
    if (plaque) mesh(inside, new T.PlaneGeometry(.42, .105), new T.MeshBasicMaterial({ map: plaque.texture }), .48, 1.06, -.375);

    const wheelBase = new T.Group();
    wheelBase.position.set(-.39, 1.035, -.22); wheelBase.rotation.x = -.25; inside.add(wheelBase);
    beam(inside, new T.Vector3(-.39, .96, -.48), new T.Vector3(-.39, 1.035, -.22), .035, dark);
    const wheelSpin = new T.Group(); wheelBase.add(wheelSpin);
    const steeringLeather = dark.clone();steeringLeather.color.setHex(0x151b20);
    mesh(wheelSpin, new T.TorusGeometry(.235, .024, 14, 64), steeringLeather);
    for (let k = 0; k < 3; k++) {
      const angle = k * Math.PI * 2 / 3 + Math.PI / 2;
      const spoke = box(wheelSpin, .19, .031, .025, Math.cos(angle) * .101, Math.sin(angle) * .101, 0, silver, .008);
      spoke.rotation.z = angle;
    }
    box(wheelSpin, .085, .083, .052, 0, 0, .018, dark, .018);
    box(wheelSpin, .019, .029, .019, 0, .233, .005, accent, .004);
    const lever = new T.Group(); lever.position.set(.10, .66, -.25); inside.add(lever);
    mesh(lever, new T.CylinderGeometry(.075, .095, .065, 12), rubber, 0, -.013, 0);
    beam(lever, new T.Vector3(0, 0, 0), new T.Vector3(0, .20, -.015), .012, silver);
    mesh(lever, new T.SphereGeometry(.041, 14, 10), dark, 0, .205, -.015);
    const handbrake = box(inside, .045, .05, .30, .20, .69, -.03, dark, .015); handbrake.rotation.x = -.3;

    const glove = mat(0xdfdfd2, .87), gloveDark = mat(0x222c34, .9), sleeve = mat(0x293a48, .95);
    if(fabric){glove.map=fabric.texture;glove.bumpMap=fabric.texture;glove.bumpScale=.002;sleeve.map=fabric.texture;sleeve.bumpMap=fabric.texture;sleeve.bumpScale=.004}
    const hands = [];
    for (const sign of [-1, 1]) {
      const hand = new T.Group(); hand.name = sign < 0 ? 'left-driver-hand' : 'right-driver-hand';
      box(hand, .083, .093, .052, 0, .005, .025, glove, .022);
      box(hand, .055, .042, .011, 0, .003, .057, accent, .005);
      for (let f = 0; f < 4; f++) {
        const finger = box(hand, .017, .052, .028, -.031 + f * .021, .043, -.005, glove, .007); finger.rotation.x = -1.18;
        const fingertip = box(hand, .017, .026, .032, -.031 + f * .021, .038, -.040, gloveDark, .007); fingertip.rotation.x = .10;
        mesh(hand,new T.SphereGeometry(.011,10,8),glove,-.031+f*.021,.046,.013).scale.set(1,.7,.8);
      }
      const thumb = box(hand, .025, .065, .028, -sign * .049, .016, .001, glove, .01); thumb.rotation.z = sign * .55;
      const cuff = box(hand, .092, .042, .066, 0, -.061, .028, gloveDark, .012);
      inside.add(hand);
      const arm = mesh(inside, new T.CylinderGeometry(.058, .079, 1, 10), sleeve);
      const forearm = mesh(inside, new T.CylinderGeometry(.043, .060, 1, 10), sleeve);
      hands.push({ sign, hand, arm, forearm, cuff });
    }

    // This hood and these slim pillars replace exterior glazing in cockpit
    // view, so the camera can never end up inside an opaque roof/window plane.
    const hood = box(cockpitShell, W * .91, .08, 1.10, 0, 1.005, -1.42, paint, .025);
    for (const side of [-1, 1]) {
      box(cockpitShell, .13, .008, 1.03, side * .22, 1.05, -1.43, accent, .004);
      beam(cockpitShell, new T.Vector3(side * baseWidth, 1.04, frontBase), new T.Vector3(side * roofWidth, roofY - .035, frontRoof), .035, dark);
      beam(cockpitShell, new T.Vector3(side * roofWidth, roofY - .035, frontRoof), new T.Vector3(side * roofWidth, roofY - .035, rearRoof), .025, dark);
    }
    box(cockpitShell, roofWidth * 2, .045, .08, 0, roofY - .035, frontRoof, dark, .01);
    // A compact interior mirror remains above the road sight line.
    const mirror = box(cockpitShell, .22, .065, .028, .16, Math.min(roofY - .12, 1.56), -.50, dark, .01);
    box(mirror, .195, .045, .005, 0, 0, .016, silver, .006);
    cockpitShell.visible = false;

    const lights = [];
    for (const side of [-1, 1]) {
      const light = new T.SpotLight(0xffefcc, 0, 105, .40, .63, 1.65);
      light.position.set(side * W * .34, .86, -half - .10);
      light.target.position.set(side * .7, .38, -40);
      light.visible = false; light.castShadow = false;
      root.add(light, light.target); lights.push(light);
    }
    const cameraAnchors = {
      chasePosition: new T.Vector3(0, 3.15, 7.8), chaseTarget: new T.Vector3(0, 1.0, -7),
      hoodPosition: new T.Vector3(0, 1.245, -.985), hoodTarget: new T.Vector3(0, 1.16, -45),
      cockpitPosition: new T.Vector3(-.39, 1.40, .56),
      cockpitTarget: new T.Vector3(-.39, 1.29, -45),
    };
    batchStatic(body);
    batchStatic(cockpitShell);
    for (const wheel of wheels) batchStatic(wheel.spin);
    for (const hand of hands) batchStatic(hand.hand);
    const animated = new Set([wheelBase, lever, ...hands.flatMap(hand => [hand.hand, hand.arm, hand.forearm])]);
    batchStatic(inside, animated);
    model = { profile, paint, tire: rubber, lights, lampMaterial, rearMaterial, body, cockpitShell, gauge, gaugeTick: 1, wheelBase, wheelSpin, wheels, hands, lever };
    Object.assign(api, { exterior, inside, wheels, wheelSpin, hands, lever, cameraAnchors, textureSize:size });
    api.setHeadlights(headlights);
    root.updateMatrixWorld(true);
  }

  const localQuaternion = new T.Quaternion(), inverseQuaternion = new T.Quaternion(), shiftQuaternion = new T.Quaternion().setFromEuler(new T.Euler(-.65, .12, -.28));
  const target = new T.Vector3(), shoulder = new T.Vector3(), elbow = new T.Vector3(), direction = new T.Vector3();
  function segment(object, a, b) {
    direction.subVectors(b, a);
    object.position.copy(a).add(b).multiplyScalar(.5); object.scale.y = Math.max(.001, direction.length());
    object.quaternion.setFromUnitVectors(AXIS_Y, direction.normalize());
  }
  function update({ steer = 0, speed = 0, dt = 0, shift = 0, rpm = 900, gear = 1, brake = false, cameraMode = 0, suspension = 0, roll = 0, wheels: wheelStates } = {}) {
    const { wheelSpin, wheels, body, hands, lever, gauge, cockpitShell } = model;
    const finiteSteer = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0;
    const finiteDt = Number.isFinite(dt) ? clamp(dt, 0, .10) : 0;
    const finiteSpeed = Number.isFinite(speed) ? speed : 0;
    wheelSpin.rotation.z = -finiteSteer * 2.05;
    for (const wheel of wheels) {
      wheel.pivot.rotation.y = wheel.front ? -finiteSteer * .48 : 0;
      const wheelState=wheelStates?.[wheel.physicsIndex];
      if(Number.isFinite(wheelState?.rotation))wheel.spin.rotation.x=-wheelState.rotation;
      else wheel.spin.rotation.x -= finiteSpeed * finiteDt / .365;
      wheel.pivot.position.y = wheel.baseY+clamp(Number(wheelState?.travel)||0,-.12,.12);
      wheel.pivot.visible = cameraMode === 0;
    }
    // Suspension movement is external-only; pilot/capot cameras never inherit
    // fake shake from an animated body, steering wheel or dashboard group.
    body.position.y = clamp(Number(suspension) || 0, -.035, .045);
    body.rotation.z = clamp(Number(roll) || 0, -.04, .04);
    api.exterior.visible = cameraMode !== 2;
    cockpitShell.visible = cameraMode === 2;
    root.updateMatrixWorld(true);
    inverseQuaternion.copy(root.quaternion).invert();
    wheelSpin.getWorldQuaternion(localQuaternion); localQuaternion.premultiply(inverseQuaternion);
    const reach = Math.sin(clamp(Number(shift) || 0, 0, 1) * Math.PI);
    for (const hand of hands) {
      target.set(hand.sign * .221, .064, .025);
      wheelSpin.localToWorld(target); root.worldToLocal(target);
      const handReach = hand.sign === 1 ? reach : 0;
      target.lerp(new T.Vector3(.10, .865, -.266), handReach);
      hand.hand.position.copy(target);
      hand.hand.quaternion.copy(localQuaternion).slerp(shiftQuaternion, handReach);
      shoulder.set(-.39 + hand.sign * .20, 1.13, .71);
      elbow.set(-.39 + hand.sign * .26, .76, .37);
      if (handReach) elbow.lerp(new T.Vector3(.04, .72, .24), handReach * .7);
      segment(hand.arm, shoulder, elbow); segment(hand.forearm, elbow, target);
    }
    lever.rotation.x = reach * .23;
    model.rearMaterial.emissiveIntensity = brake ? 2.3 : .12;
    model.gaugeTick += finiteDt;
    if (gauge && model.gaugeTick >= .055) {
      model.gaugeTick = 0;
      const context = gauge.context;
      context.fillStyle = '#061217'; context.fillRect(0, 0, 768, 256);
      context.fillStyle = '#e3ebdb'; context.font = 'bold 157px monospace'; context.fillText(String(gear), 29, 169);
      context.fillStyle = '#d4eb85'; context.font = 'bold 113px monospace'; context.fillText(Math.round(Math.abs(finiteSpeed) * 3.6).toString().padStart(3, '0'), 239, 149);
      context.fillStyle = '#c4cec8'; context.font = '29px monospace'; context.fillText('KM/H', 487, 193); context.fillText(Math.round(rpm) + ' RPM', 236, 193);
      context.fillStyle = '#263a3d'; context.fillRect(24, 221, 720, 13);
      context.fillStyle = rpm > 6500 ? '#f37a4c' : '#d4eb85'; context.fillRect(24, 221, clamp(rpm / 7800, 0, 1) * 720, 13);
      for (let k = 0; k < 12; k++) {
        context.fillStyle = rpm > 2600 + k * 410 ? (k > 8 ? '#f48543' : '#b7dc57') : '#243438';
        context.fillRect(239 + k * 39, 20, 29, 10);
      }
      gauge.texture.needsUpdate = true;
    }
    root.updateMatrixWorld(true);
  }
  build();
  update();
  return api;
}
