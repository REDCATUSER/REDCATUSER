import * as T from 'three';
import { STAGES } from './content.js';

export const stages = STAGES;
export const height = (x, z) => Math.sin(x * .008) * 1.4 + Math.cos(z * .006) * 2;
const palettes = {
  alps: { sky: 0xc9d7e2, ground: 0xe5eef1, road: 0xa6bac4, foliage: 0x54766b, rock: 0x75838d, width: 5.3, relief: .48, rise: 150 },
  dakar: { sky: 0xd8d9bd, ground: 0xd4b47c, road: 0xd9bd87, foliage: 0x65774b, rock: 0x9f8061, width: 7.5, relief: .12, rise: 26 },
  france: { sky: 0xb9d5e2, ground: 0x6d8751, road: 0x686b68, foliage: 0x3d6537, rock: 0x929182, width: 5.3, relief: .14, rise: 48 },
  monte: { sky: 0xbed6e4, ground: 0x79916d, road: 0x565c61, foliage: 0x3c6750, rock: 0xa7a89b, width: 5.3, relief: .39, rise: 115 },
  usa: { sky: 0xb3cedb, ground: 0x9b805e, road: 0xac987c, foliage: 0x355e44, rock: 0xa57d62, width: 5.8, relief: .37, rise: 95 },
  romania: { sky: 0xb7c7c7, ground: 0x778451, road: 0x666963, foliage: 0x3f643d, rock: 0x858775, width: 5.1, relief: .3, rise: 88 },
};
function randomSource(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function material(color, extra = {}) { return new T.MeshStandardMaterial({ color, roughness: .92, ...extra }); }

function canvasTexture(kind, color, seed) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  const rand = randomSource(seed), c = new T.Color(color);
  ctx.fillStyle = `#${c.getHexString()}`; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0, n = kind === 'asphalt' || kind === 'broken' ? 5400 : 2100; i < n; i++) {
    const tone = rand() > .5 ? 255 : 15;
    ctx.fillStyle = `rgba(${tone},${tone},${tone},${.025 + rand() * .13})`;
    ctx.fillRect(rand() * 256, rand() * 256, kind === 'sand' ? 5 + rand() * 19 : 1 + rand() * 3, .5 + rand() * 2);
  }
  if (kind === 'broken' || kind === 'asphalt') {
    ctx.strokeStyle = 'rgba(18,22,20,.34)'; ctx.lineWidth = kind === 'broken' ? 1.8 : .7;
    for (let n = 0; n < (kind === 'broken' ? 17 : 4); n++) {
      let x = rand() * 256, y = rand() * 256; ctx.beginPath(); ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += (rand() - .5) * 45; y += 8 + rand() * 14; ctx.lineTo(x, y); } ctx.stroke();
    }
  }
  if (kind === 'snow' || kind === 'sand' || kind === 'gravel') for (const x of [77, 177]) {
    ctx.fillStyle = kind === 'snow' ? 'rgba(100,117,125,.12)' : 'rgba(80,57,25,.09)'; ctx.fillRect(x - 7, 0, 14, 256);
    for (let y = 0; y < 256; y += 8) { ctx.fillStyle = 'rgba(65,66,59,.1)'; ctx.fillRect(x - 7, y, 14, 2); }
  }
  const map = new T.CanvasTexture(canvas); map.wrapS = map.wrapT = T.RepeatWrapping;
  map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4; return map;
}

// Monotonic valley coordinates prevent crossings and keep start/finish far apart.
function makeRoute(stage, palette) {
  const variant = Number(stage.variant) || 0, points = [];
  const winding = stage.region === 'romania' ? 1.95 : stage.region === 'alps' || stage.region === 'monte' ? 1.7 : stage.region === 'dakar' ? .82 : 1.35;
  for (let i = 0; i <= 34; i++) {
    const bend = (Math.sin(i * .53 + variant * .7) * 85 + Math.sin(i * .96 + variant) * 34) * winding;
    points.push(new T.Vector3(bend, 0, -i * 88));
  }
  const firstX = points[0].x; for (const p of points) p.x -= firstX;
  const preview = new T.CatmullRomCurve3(points, false, 'centripetal');
  const target = Math.max(2500, Math.min(4200, Number(stage.length) || 3400));
  const factor = target / preview.getLength();
  for (const p of points) { p.x *= factor; p.z *= factor; }
  const endZ = points.at(-1).z;
  for (const p of points) {
    const t = p.z / endZ;
    p.y = palette.rise * (variant === 1 ? 1 - t : t) + Math.sin(t * Math.PI * 5 + variant * .4) * (stage.region === 'dakar' ? 3 : 6) + 2;
  }
  const curve = new T.CatmullRomCurve3(points, false, 'centripetal'); curve.arcLengthDivisions = 3000;
  const samples = curve.getSpacedPoints(Math.ceil(curve.getLength() / 3)), distances = [0];
  for (let i = 1; i < samples.length; i++) distances.push(distances[i - 1] + samples[i].distanceTo(samples[i - 1]));
  function atZ(z) {
    let lo = 0, hi = samples.length - 1;
    if (z >= samples[0].z) return { x: samples[0].x, y: samples[0].y, index: 0 };
    if (z <= samples[hi].z) return { x: samples[hi].x, y: samples[hi].y, index: hi - 1 };
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].z > z) lo = mid; else hi = mid; }
    const a = samples[lo], b = samples[hi], t = (z - a.z) / (b.z - a.z);
    return { x: T.MathUtils.lerp(a.x, b.x, t), y: T.MathUtils.lerp(a.y, b.y, t), index: lo };
  }
  return { curve, samples, distances, length: distances.at(-1), atZ };
}

export function makeWorld(scene, stage = STAGES[0], index = 0) {
  const palette = palettes[stage.region] || palettes.france;
  const rand = randomSource(1948 + index * 193 + (Number(stage.variant) || 0) * 8191);
  const root = new T.Group(); root.name = `special-${stage.id || index}`; scene.add(root);
  const { curve, samples, distances, length, atZ } = makeRoute(stage, palette);
  const halfWidth = palette.width, obstacles = [], barriers = [];
  const kind = typeof stage.weather === 'string' ? stage.weather : stage.weather?.kind || (stage.region === 'alps' ? 'snow' : 'clear');
  const weather = { kind, wetness: kind === 'rain' ? .82 : kind === 'snow' ? .28 : .04 };
  const sky = new T.Color(kind === 'night' ? 0x142330 : palette.sky);
  if (kind === 'rain' || kind === 'fog') sky.lerp(new T.Color(0x8b9b9f), .38);
  if (kind === 'overcast') sky.lerp(new T.Color(0xa4aeb3), .42);
  if (kind === 'dust') sky.lerp(new T.Color(0xd9bd8e), .38);
  scene.background = sky;
  const fogNear = kind === 'fog' ? 75 : kind === 'night' ? 80 : kind === 'snow' || kind === 'rain' || kind === 'dust' ? 115 : 240;
  const fogFar = kind === 'fog' ? 420 : kind === 'night' ? 460 : kind === 'dust' ? 650 : 940;
  scene.fog = new T.Fog(sky, fogNear, fogFar);

  function nearest(x, z) {
    const approximate = atZ(z).index;
    const first = Math.max(0, approximate - 100), last = Math.min(samples.length - 2, approximate + 100);
    let d2 = Infinity, found = first, fraction = 0, px = 0, pz = 0;
    for (let i = first; i <= last; i++) {
      const a = samples[i], b = samples[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const t = T.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const qx = a.x + dx * t, qz = a.z + dz * t, d = (qx - x) ** 2 + (qz - z) ** 2;
      if (d < d2) { d2 = d; found = i; fraction = t; px = qx; pz = qz; }
    }
    const a = samples[found], b = samples[found + 1], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const lateral = ((x - px) * -dz + (z - pz) * dx) / d;
    const surface = Math.sqrt(d2) > halfWidth + .35 ? stage.region === 'alps' ? 'snow' : stage.region === 'dakar' ? 'sand' : 'grass' : stage.surface;
    return { dist: Math.sqrt(d2), index: found, point: new T.Vector3(px, T.MathUtils.lerp(a.y, b.y, fraction), pz), distance: T.MathUtils.lerp(distances[found], distances[found + 1], fraction), lateral, surface, roughness: surface === 'broken' ? .72 : surface === 'sand' ? .42 : surface === 'gravel' ? .34 : surface === 'grass' ? .65 : .08 };
  }
  function heightAt(x, z) {
    const near = nearest(x, z), bank = Math.max(0, near.dist - halfWidth - 4);
    const hills = bank * palette.relief * (.52 + .25 * Math.sin(z * .008 + x * .004));
    const dune = stage.region === 'dakar' ? Math.sin(x * .024 + z * .008) * Math.sin(z * .012) * Math.min(bank * .08, 4) : 0;
    // Longitudinal elevation remains continuous across polyline projection boundaries.
    return atZ(z).y + hills + dune - .04;
  }
  function surfaceAt(x, z) { return nearest(x, z).surface; }

  function ribbon(offsets, stride, isRoad) {
    const vertices = [], uvs = [], colors = [], indices = [], path = [];
    for (let i = 0; i < samples.length; i += stride) path.push(i);
    if (path.at(-1) !== samples.length - 1) path.push(samples.length - 1);
    // Terrain continues behind the start and past the finish for the menu/chase cameras.
    const startExtension = samples[0].clone(), finishExtension = samples.at(-1).clone();
    startExtension.z += 260; finishExtension.z -= 260;
    if (!isRoad) { path.unshift(-1); path.push(samples.length); }
    const base = new T.Color(isRoad ? palette.road : palette.ground);
    for (let n = 0; n < path.length; n++) {
      const i = path[n], p = i < 0 ? startExtension : i >= samples.length ? finishExtension : samples[i];
      const a = i < 0 ? startExtension : samples[Math.max(0, i - 1)];
      const b = i >= samples.length ? finishExtension : samples[Math.min(samples.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, norm = Math.hypot(dx, dz);
      for (const offset of offsets) {
        const x = p.x - dz / norm * offset, z = p.z + dx / norm * offset;
        vertices.push(x, heightAt(x, z) + (isRoad ? .055 : -.12), z);
        uvs.push(isRoad ? (offset / halfWidth + 1) * .5 : x / 95, isRoad ? distances[i] / 22 : z / 95);
        const c = base.clone().multiplyScalar(isRoad ? .96 + rand() * .08 : .83 + rand() * .25); colors.push(c.r, c.g, c.b);
      }
      if (n < path.length - 1) for (let j = 0; j < offsets.length - 1; j++) {
        const k = n * offsets.length + j, next = k + offsets.length; indices.push(k, k + 1, next, next, k + 1, next + 1);
      }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const map = canvasTexture(isRoad ? stage.surface : 'ground', isRoad || stage.region === 'alps' ? 0xffffff : 0xc8ccb5, index + 3);
    const mesh = new T.Mesh(geo, material(0xffffff, { map, vertexColors: true, side: T.DoubleSide, roughness: isRoad && kind === 'rain' ? .46 : .95 }));
    mesh.receiveShadow = true; mesh.name = isRoad ? 'road' : 'terrain'; root.add(mesh);
  }
  const groundOffsets = [...new Set([-480, -220, -100, -45, -23, -12, -halfWidth - 2, -halfWidth, 0, halfWidth, halfWidth + 2, 12, 23, 45, 100, 220, 480])].sort((a,b)=>a-b);
  ribbon(groundOffsets, 3, false);
  ribbon([-halfWidth, -halfWidth * .5, 0, halfWidth * .5, halfWidth], 1, true);

  const dummy = new T.Object3D();
  function instance(mesh, i, x, y, z, sx = 1, sy = 1, sz = 1, rotation = 0) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  function roadsidePoint(i, side, offset) {
    i = T.MathUtils.clamp(i, 0, samples.length - 2);
    const p = samples[i], b = samples[i + 1], dx = b.x - p.x, dz = b.z - p.z, n = Math.hypot(dx, dz);
    return { x: p.x - dz / n * offset * side, z: p.z + dx / n * offset * side, yaw: Math.atan2(-dx, -dz), distance: distances[i] };
  }

  // Branches and five irregular foliage clusters produce volumetric, non-conical trees.
  const treeCount = stage.region === 'dakar' ? 65 : 460;
  const trunks = new T.InstancedMesh(new T.CylinderGeometry(.2, .34, 1, 7), material(0x695644), treeCount);
  const leaves = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), material(0xffffff), treeCount * 5);
  const branches = new T.InstancedMesh(new T.CylinderGeometry(.06, .13, 1, 5), material(0x6b5944), treeCount * 3);
  trunks.name = 'tree-trunks'; leaves.name = 'tree-canopies'; leaves.castShadow = true; trunks.castShadow = true;
  for (let i = 0; i < treeCount; i++) {
    const p = roadsidePoint(8 + Math.floor(rand() * (samples.length - 17)), rand() < .5 ? -1 : 1, 15 + rand() * 220);
    const y = heightAt(p.x, p.z), scale = .75 + rand() * 1.15, desert = stage.region === 'dakar', tall = (desert ? 4.2 : 7.2) * scale;
    instance(trunks, i, p.x, y + tall * .43, p.z, scale, tall * .86, scale);
    for (let j = 0; j < 5; j++) {
      const a = j * 2.4 + rand(), spread = j === 4 ? .2 : 1.7 * scale, wide = (desert ? 2.4 : 2) * scale;
      instance(leaves, i * 5 + j, p.x + Math.cos(a) * spread, y + tall * (.56 + j * .07), p.z + Math.sin(a) * spread, wide, (desert ? .75 : 2.15) * scale, wide * .85, a);
      leaves.setColorAt(i * 5 + j, new T.Color(palette.foliage).multiplyScalar(.82 + rand() * .35));
    }
    for (let j = 0; j < 3; j++) {
      const angle = j * 2.094 + i, radius = 1.2 * scale;
      dummy.position.set(p.x + Math.cos(angle) * radius * .5, y + tall * .58, p.z + Math.sin(angle) * radius * .5);
      dummy.scale.set(scale, radius * 1.4, scale); dummy.rotation.set(Math.sin(angle) * .9, 0, Math.cos(angle) * .9); dummy.updateMatrix(); branches.setMatrixAt(i * 3 + j, dummy.matrix);
    }
    obstacles.push({ x: p.x, z: p.z, r: .7 * scale });
  }
  root.add(trunks, leaves, branches);
  if (stage.region === 'alps') {
    const caps = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), material(0xf1f5f3), treeCount * 2);
    for (let i = 0; i < treeCount; i++) for (let j = 0; j < 2; j++) {
      leaves.getMatrixAt(i * 5 + j + 2, dummy.matrix); dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.y += dummy.scale.y * .7; dummy.scale.y *= .23; dummy.updateMatrix(); caps.setMatrixAt(i * 2 + j, dummy.matrix);
    }
    root.add(caps);
  }

  const rockCount = stage.region === 'dakar' ? 100 : 170;
  const rocks = new T.InstancedMesh(new T.DodecahedronGeometry(1, 1), material(palette.rock), rockCount); rocks.castShadow = true;
  for (let i = 0; i < rockCount; i++) {
    const p = roadsidePoint(Math.floor(rand() * (samples.length - 1)), rand() < .5 ? -1 : 1, 11 + rand() * 130), scale = .7 + rand() * 3.5;
    instance(rocks, i, p.x, heightAt(p.x, p.z) + scale * .25, p.z, scale * 1.3, scale * .75, scale, rand() * 6);
    obstacles.push({ x: p.x, z: p.z, r: scale * .85 });
  }
  root.add(rocks);
  if (stage.region !== 'alps' && stage.region !== 'dakar') {
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute([-.45,0,0, .08,.9,0, .22,0,0, 0,0,-.4, 0,.75,.05, 0,0,.3, -.35,0,-.2, .1,.6,.1, .3,0,.3], 3)); geo.computeVertexNormals();
    const grass = new T.InstancedMesh(geo, material(stage.region === 'usa' ? 0x989354 : 0x698348, { side: T.DoubleSide }), 2200);
    for (let i = 0; i < grass.count; i++) {
      const p = roadsidePoint(Math.floor(rand() * (samples.length - 1)), rand() < .5 ? -1 : 1, halfWidth + .8 + rand() * 34), s = .45 + rand() * .9;
      instance(grass, i, p.x, heightAt(p.x, p.z), p.z, s, s, s, rand() * 6.28);
    }
    root.add(grass);
  }

  // Solid barriers line exposed stretches, with recovery gaps on the safer sections.
  const railSpecs = [];
  for (let k = 4; k < samples.length - 8; k += 4) {
    const run = Math.floor(distances[k] / 160);
    if (stage.region === 'dakar' || run % 3 === 1) continue;
    const side = run % 2 ? -1 : 1, p = roadsidePoint(k, side, halfWidth + 1.6), q = roadsidePoint(Math.min(k + 4, samples.length - 2), side, halfWidth + 1.6);
    const len = Math.hypot(q.x - p.x, q.z - p.z); railSpecs.push({ p, q, len });
    const steps = Math.ceil(len / 2.2);
    for (let n = 0; n <= steps; n++) barriers.push({ x: T.MathUtils.lerp(p.x, q.x, n / steps), z: T.MathUtils.lerp(p.z, q.z, n / steps), r: .34, distance: T.MathUtils.lerp(p.distance, q.distance, n / steps) });
  }
  const rails = new T.InstancedMesh(new T.BoxGeometry(1, .34, .16), material(stage.region === 'france' ? 0xaaa89a : 0xb8bec1, { metalness: .4, roughness: .55 }), railSpecs.length);
  const railPosts = new T.InstancedMesh(new T.BoxGeometry(.16, 1.1, .16), material(0x898d8b), railSpecs.length);
  railSpecs.forEach(({p,q,len}, i) => {
    const ay=heightAt(p.x,p.z)+.82,by=heightAt(q.x,q.z)+.82,direction=new T.Vector3(q.x-p.x,by-ay,q.z-p.z);
    dummy.position.set((p.x+q.x)*.5,(ay+by)*.5,(p.z+q.z)*.5);dummy.scale.set(direction.length()+.2,1,1);
    dummy.quaternion.setFromUnitVectors(new T.Vector3(1,0,0),direction.normalize());dummy.updateMatrix();rails.setMatrixAt(i,dummy.matrix);
    instance(railPosts, i, p.x, heightAt(p.x,p.z)+.55, p.z);
  });
  root.add(rails, railPosts);
  const postCount = Math.floor(length / 22) * 2;
  const posts = new T.InstancedMesh(new T.BoxGeometry(.15,1.05,.15), material(0xf0efdc), postCount);
  const reflectors = new T.InstancedMesh(new T.BoxGeometry(.2,.15,.18), material(0xed7a43,{emissive:0x8a280c,emissiveIntensity:.22}), postCount);
  for (let i=0;i<postCount;i++) {
    const p=roadsidePoint(Math.floor((i>>1)/(postCount/2)*(samples.length-2)),i%2?-1:1,halfWidth+.8);
    instance(posts,i,p.x,heightAt(p.x,p.z)+.5,p.z,1,1,1,p.yaw); instance(reflectors,i,p.x,heightAt(p.x,p.z)+.88,p.z,1,1,1,p.yaw);
  }
  root.add(posts,reflectors);

  const houseCount=stage.region==='monte'?25:stage.region==='france'?17:stage.region==='romania'?12:5;
  const houses=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(stage.region==='monte'?0xe5d1a9:0xc0b299),houseCount);
  const roofs=new T.InstancedMesh(new T.CylinderGeometry(.05,1,1,4,1),material(stage.region==='alps'?0xf0f4f2:0x81584b),houseCount);
  const windows=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(0x42606d,{metalness:.25,roughness:.45}),houseCount*4);
  for(let i=0;i<houseCount;i++) {
    const p=roadsidePoint(35+Math.floor(rand()*(samples.length-70)),i%2?-1:1,30+rand()*70),y=heightAt(p.x,p.z),w=5+rand()*4,h=4+rand()*(stage.region==='monte'?8:3),d=5+rand()*4;
    instance(houses,i,p.x,y+h*.5,p.z,w,h,d); instance(roofs,i,p.x,y+h+1.1,p.z,w*.78,2.5,d*.78,Math.PI/4);
    for(let j=0;j<4;j++)instance(windows,i*4+j,p.x+(j%2?1:-1)*w*.25,y+h*(.34+(j>>1)*.36),p.z+d*.501,.9,1.2,.08);
    obstacles.push({x:p.x,z:p.z,r:Math.max(w,d)*.65});
  }
  root.add(houses,roofs,windows);
  if(stage.region==='dakar') {
    const tents=new T.InstancedMesh(new T.ConeGeometry(3,2.6,4),material(0xebe0c2),12);
    for(let i=0;i<12;i++){const p=roadsidePoint(15+i*3,1,22+(i%3)*9);instance(tents,i,p.x,heightAt(p.x,p.z)+1.3,p.z,1,1,1,Math.PI/4)}root.add(tents);
  }
  if(stage.region==='monte') {
    const sea=new T.Mesh(new T.PlaneGeometry(2200,length+1800),material(0x438da0,{roughness:.3,metalness:.18}));
    sea.rotation.x=-Math.PI/2;sea.position.set(-1000,-18,samples.at(-1).z*.5);root.add(sea);
  }

  const gates=[],checkpointCount=9;
  for(let i=0;i<=checkpointCount;i++) {
    const sampleIndex=i===checkpointCount?samples.length-1:Math.round(i/checkpointCount*(samples.length-1));
    const p=samples[sampleIndex],b=samples[Math.min(sampleIndex+1,samples.length-1)],a=samples[Math.max(0,sampleIndex-1)];
    const yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z)),group=new T.Group();group.position.set(p.x,heightAt(p.x,p.z),p.z);group.rotation.y=yaw;
    const m=material(i===0?0xffffff:i===checkpointCount?0xffb651:0xd7f4a0,{emissive:0x4d5a20,emissiveIntensity:.15});
    for(const side of [-1,1]) {
      const pole=new T.Mesh(new T.CylinderGeometry(.11,.11,5.4,7),m);pole.position.set(side*(halfWidth+.35),2.7,0);group.add(pole);
      const flag=new T.Mesh(new T.BoxGeometry(.8,1.8,.06),m);flag.position.set(side*(halfWidth+.35),4.3,0);group.add(flag);
    }
    const banner=new T.Mesh(new T.BoxGeometry(halfWidth*2+.9,.55,.15),m);banner.position.y=5.2;group.add(banner);root.add(group);
    gates.push({group,material:m,point:p.clone(),yaw,distance:distances[sampleIndex],index:sampleIndex});
  }
  const notes=[];let lastNote=-100;
  for(let i=30;i<samples.length-35;i+=8) {
    if(distances[i]>length-200)break;
    if(distances[i]-lastNote<105)continue;
    const a=samples[i-20],b=samples[i],c=samples[i+25];
    let turn=Math.atan2(c.x-b.x,-(c.z-b.z))-Math.atan2(b.x-a.x,-(b.z-a.z));
    while(turn>Math.PI)turn-=Math.PI*2;while(turn<-Math.PI)turn+=Math.PI*2;if(Math.abs(turn)<.13)continue;
    const number=Math.abs(turn)>.78?2:Math.abs(turn)>.5?3:Math.abs(turn)>.3?4:5,right=turn>0;
    notes.push({distance:Math.max(0,distances[i]-55),text:`${right?'Droite':'Gauche'} ${number}${stage.surface==='snow'?', glissant':''}`,code:`${right?'right':'left'}${number}`});lastNote=distances[i];
  }
  notes.push({distance:length-110,text:'Arrivée, cent mètres',code:'finish'});

  let precipitation=null,precipitationPositions=null;
  const particleCount=kind==='snow'?850:kind==='rain'?1050:0;
  if(particleCount) {
    precipitationPositions=new Float32Array(particleCount*3);
    for(let i=0;i<particleCount;i++){precipitationPositions[i*3]=(rand()-.5)*100;precipitationPositions[i*3+1]=rand()*42;precipitationPositions[i*3+2]=(rand()-.5)*100}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(precipitationPositions,3));
    precipitation=new T.Points(geo,new T.PointsMaterial({color:kind==='snow'?0xf4f8fc:0xbfd7e7,size:kind==='snow'?.18:.055,transparent:true,opacity:.73,depthWrite:false}));
    precipitation.frustumCulled=false;root.add(precipitation);
  }
  function update(dt,carPosition,elapsed=0) {
    if(precipitation&&carPosition) {
      precipitation.position.set(carPosition.x,carPosition.y??heightAt(carPosition.x,carPosition.z),carPosition.z);
      const fall=kind==='snow'?3.2:23;
      for(let i=0;i<particleCount;i++){const k=i*3;precipitationPositions[k+1]-=dt*fall;precipitationPositions[k]+=dt*(kind==='snow'?Math.sin(elapsed*.7+i)*.65:1.2);if(precipitationPositions[k+1]<-3)precipitationPositions[k+1]=42;if(precipitationPositions[k]>50)precipitationPositions[k]=-50}
      precipitation.geometry.attributes.position.needsUpdate=true;
    }
    if(scene.fog)scene.fog.far=fogFar*(1+Math.sin(elapsed*.015)*.07);
    weather.wetness=T.MathUtils.clamp((kind==='rain'?.75:kind==='snow'?.28:.04)+Math.sin(elapsed*.02)*.06,0,1);
  }
  return {root,curve,samples,length,gates,nearest,heightAt,surfaceAt,notes,obstacles,barriers,weather,roadWidth:halfWidth*2,update,
    dispose(){
      scene.remove(root);const geometries=new Set(),materials=new Set(),textures=new Set();
      root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value)}});
      for(const texture of textures)texture.dispose();for(const geo of geometries)geo.dispose();for(const m of materials)m.dispose();
    }
  };
}
