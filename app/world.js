import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SCENERY} from '../src/scenery/scenery-data.js';
import { STAGES } from './content.js';

export const stages = STAGES;
export const height = (x, z) => Math.sin(x * .008) * 1.4 + Math.cos(z * .006) * 2;
const palettes = {
  alps: { sky: 0xc9d7e2, ground: 0xe5eef1, road: 0xa6bac4, foliage: 0x54766b, rock: 0x75838d, width: 3.65, relief: .38, rise: 135 },
  dakar: { sky: 0xbfd4e0, ground: 0xd4b47c, road: 0xd9bd87, foliage: 0x65774b, rock: 0x9f8061, width: 5.1, relief: .12, rise: 26 },
  france: { sky: 0x9fbfd6, ground: 0x698345, road: 0x686b68, foliage: 0x3d6537, rock: 0x929182, width: 3.5, relief: .14, rise: 48 },
  monte: { sky: 0xbed6e4, ground: 0x79916d, road: 0x565c61, foliage: 0x3c6750, rock: 0xa7a89b, width: 3.4, relief: .30, rise: 105 },
  usa: { sky: 0x95b9d5, ground: 0x73844c, road: 0xac987c, foliage: 0x355e44, rock: 0xa57d62, width: 4.0, relief: .24, rise: 80 },
  romania: { sky: 0xb7c7c7, ground: 0x778451, road: 0x666963, foliage: 0x3f643d, rock: 0x858775, width: 3.3, relief: .24, rise: 78 },
};
function randomSource(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function material(color, extra = {}) { return new T.MeshStandardMaterial({ color, roughness: .92, ...extra }); }

const TEXTURE_SIZES={low:256,medium:512,high:1024};
function canvasTexture(kind, color, seed, size=512) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.scale(size/256,size/256);
  const rand = randomSource(seed), c = new T.Color(color);
  ctx.fillStyle = `#${c.getHexString()}`; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0, n = (kind === 'asphalt' || kind === 'broken' ? 5400 : 3100)*size/256; i < n; i++) {
    const tone = rand() > .5 ? 255 : 15;
    ctx.fillStyle = `rgba(${tone},${tone},${tone},${.025 + rand() * .13})`;
    ctx.fillRect(rand() * 256, rand() * 256, kind === 'sand' ? 5 + rand() * 19 : 1 + rand() * 3, .5 + rand() * 2);
  }
  if(kind==='grass'||kind==='bark'||kind==='rock'){
    for(let i=0;i<1800;i++){
      const x=rand()*256,y=rand()*256;ctx.strokeStyle=kind==='grass'?'rgba(75,106,32,.16)':kind==='bark'?'rgba(33,22,11,.35)':'rgba(70,67,62,.16)';ctx.lineWidth=kind==='bark'?.6:.3;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rand()-.5)*(kind==='bark'?3:9),y+3+rand()*(kind==='bark'?32:7));ctx.stroke();
    }
  }
  if(kind==='sandground'){ctx.strokeStyle='rgba(111,90,52,.12)';ctx.lineWidth=.8;for(let y=0;y<256;y+=5){ctx.beginPath();for(let x=0;x<=256;x+=4){const yy=y+Math.sin(x*.08+y*.04)*3;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy)}ctx.stroke()}}
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
  map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8;
  if(typeof Image!=='undefined'&&['grass','ground','gravel','asphalt','broken','snow','sand'].includes(kind)){const image=new Image();image.onload=()=>{ctx.globalAlpha=kind==='snow'||kind==='ground'?.25:.58;ctx.drawImage(image,0,0,256,256);ctx.globalAlpha=1;map.needsUpdate=true};image.src=SCENERY.ground}
  return map;
}

// Authored bend sequences: short transitions into hairpins, linked S bends,
// and acceleration zones. Z stays monotonic, so separate road sections cannot
// cross and the height-field/collision lookup remains deterministic.
function makeRoute(stage, palette) {
  const variant = Number(stage.variant) || 0, points = [new T.Vector3(0,2,0)];
  const technical=['alps','monte','romania'].includes(stage.region),desert=stage.region==='dakar';
  const layouts=[
   [0,.3,-.55,.85,-.8,1.18,-1.18,-.35,.7,-.65,1.21,-1.21,.2,.94,-.95,.4,-.7,.8,-.3,0],
   [0,-.4,.65,-1.16,1.16,.3,-.8,.85,-.4,1.2,-1.2,-.2,.65,-.8,.9,-.6,.4,-.7,.3,0],
   [0,.55,-.7,.3,-.9,.95,-.3,1.22,-1.22,-.5,.7,-.85,1.18,-1.18,.2,.8,-.7,.55,-.3,0]
  ], headings=layouts[variant%3].map(v=>v*(technical?1:desert?.64:.83));
  const target=Math.max(2500,Math.min(4200,Number(stage.length)||3400)),rand=randomSource(7919+variant*511+stage.region.length*137);
  const runs=headings.map((_,i)=>i===0?85:105+rand()*100),factor=target/runs.reduce((a,b)=>a+b,0);let x=0,z=0,travel=0;
  for(let i=0;i<headings.length;i++){
   const run=runs[i]*factor,transition=desert?Math.min(run*.7,85):Math.min(run*.45,technical?42:58);
   for(let d=0;d<run;d+=4){const step=Math.min(4,run-d),u=T.MathUtils.clamp(d/transition,0,1),blend=u*u*(3-2*u),yaw=T.MathUtils.lerp(headings[Math.max(0,i-1)],headings[i],blend);x+=Math.sin(yaw)*step;z-=Math.cos(yaw)*step;travel+=step;points.push(new T.Vector3(x,0,z))}
  }
  const preview = new T.CatmullRomCurve3(points, false, 'centripetal');
  const scale = target / preview.getLength();
  for (let i=0;i<points.length;i++) {
    const p=points[i],t=i/(points.length-1),rise=T.MathUtils.smoothstep(t,.025,.975);p.x*=scale;p.z*=scale;
    p.y = palette.rise * (variant === 1 ? 1-rise : rise) + Math.sin(rise * Math.PI * 4 + variant*.4) * (desert ? 2 : 4) + 2;
  }
  const curve = new T.CatmullRomCurve3(points, false, 'centripetal'); curve.arcLengthDivisions = Math.max(6000,points.length*18);
  const samples = curve.getSpacedPoints(Math.ceil(curve.getLength() / 2)), distances = [0];
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

export function getStagePreview(stage){
 const route=makeRoute(stage,palettes[stage.region]||palettes.france),points=route.curve.getSpacedPoints(100);
 let ascent=0;for(let i=1;i<points.length;i++)ascent+=Math.max(0,points[i].y-points[i-1].y);
 return{points:points.map(p=>({x:p.x,y:p.y,z:p.z})),length:route.length,ascent:Math.round(ascent)};
}

export function makeWorld(scene, stage = STAGES[0], index = 0, options={}) {
  let textureQuality=options.textureQuality||'medium';const textured=[];
  function texturedMaterial(color,textureKind,seed,extra={}){
    const m=material(color,extra);textured.push({material:m,kind:textureKind,seed});
    m.map=canvasTexture(textureKind,0xffffff,seed,TEXTURE_SIZES[textureQuality]||512);m.bumpMap=m.map;m.bumpScale=textureKind==='bark'?.045:textureKind==='rock'?.07:.018;return m;
  }
  function setTextureQuality(quality){
    if(!TEXTURE_SIZES[quality]||quality===textureQuality)return;textureQuality=quality;
    for(const entry of textured){entry.material.map?.dispose();entry.material.map=canvasTexture(entry.kind,0xffffff,entry.seed,TEXTURE_SIZES[quality]);entry.material.bumpMap=entry.material.map;entry.material.needsUpdate=true}
  }
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

  // A continuous gradient sky and a separate distant relief frame the route.
  // They never replace the drivable height field or its collision sampling.
  let skyDome=null;
  if(typeof document!=='undefined'){
    const c=document.createElement('canvas');c.width=16;c.height=256;const g=c.getContext('2d'),gradient=g.createLinearGradient(0,0,0,256);
    const top=sky.clone().multiplyScalar(kind==='night'?.6:.72),horizon=sky.clone().lerp(new T.Color(0xf0e3c8),kind==='sun'?.26:.12);
    gradient.addColorStop(0,'#'+top.getHexString());gradient.addColorStop(.53,'#'+sky.getHexString());gradient.addColorStop(1,'#'+horizon.getHexString());g.fillStyle=gradient;g.fillRect(0,0,16,256);
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
    skyDome=new T.Mesh(new T.SphereGeometry(1100,24,16),new T.MeshBasicMaterial({map,side:T.BackSide,depthWrite:false,fog:false}));skyDome.name='gradient-sky';skyDome.renderOrder=-100;skyDome.frustumCulled=false;root.add(skyDome);
  }
  if(stage.region!=='dakar'&&stage.region!=='france')for(const side of [-1,1]){
    const vertices=[],colors=[],indices=[],ridgeColor=new T.Color(palette.rock).lerp(sky,.22);
    for(let i=0;i<=48;i++){
      const z=260-i/48*(Math.abs(samples.at(-1).z)+520),valley=atZ(z),wave=Math.sin(i*1.74+index)*.5+Math.sin(i*.63+side)*.35;
      const x=valley.x+side*(470+Math.sin(i*.77)*70),y=valley.y+90+palette.relief*420+wave*85;
      for(const [px,py]of [[x-side*200,valley.y-12],[x,y],[x+side*280,y-55]]){vertices.push(px,py,z);const snow=stage.region==='alps'&&py>y-8,c=snow?new T.Color(0xdde6e8):ridgeColor.clone().multiplyScalar(.8+Math.sin(i*.77)*.12);colors.push(c.r,c.g,c.b)}
      if(i){const k=i*3;for(let j=0;j<2;j++)indices.push(k+j,k-3+j,k+j+1,k+j+1,k-3+j,k-2+j)}
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
    const ridge=new T.Mesh(geo,material(0xffffff,{vertexColors:true,side:T.DoubleSide}));ridge.name='distant-ridge';root.add(ridge);
  }

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
        uvs.push(isRoad ? (offset / halfWidth + 1) * .5 : x / 14, isRoad ? distances[i] / 9 : z / 14);
        const c = base.clone().multiplyScalar(isRoad ? .96 + rand() * .08 : .83 + rand() * .25); colors.push(c.r, c.g, c.b);
      }
      if (n < path.length - 1) for (let j = 0; j < offsets.length - 1; j++) {
        const k = n * offsets.length + j, next = k + offsets.length; indices.push(k, k + 1, next, next, k + 1, next + 1);
      }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const textureKind=isRoad?stage.surface:stage.region==='dakar'?'sandground':stage.region==='alps'?'ground':'grass';
    const mesh = new T.Mesh(geo, texturedMaterial(0xffffff,textureKind,index+3, {vertexColors: true, side: T.DoubleSide, roughness: isRoad && kind === 'rain' ? .46 : .95 }));
    mesh.receiveShadow = true; mesh.name = isRoad ? 'road' : 'terrain'; root.add(mesh);
  }
  const groundOffsets = [...new Set([-480, -220, -100, -45, -23, -12, -halfWidth - 2, -halfWidth, 0, halfWidth, halfWidth + 2, 12, 23, 45, 100, 220, 480])].sort((a,b)=>a-b);
  // A regular terrain grid cannot fold over itself on the inside of a hairpin.
  {
   const xs=samples.map(p=>p.x),minX=Math.floor((Math.min(...xs)-520)/24)*24,maxX=Math.max(...xs)+520,minZ=samples.at(-1).z-300,maxZ=300,nx=Math.ceil((maxX-minX)/24),nz=Math.ceil((maxZ-minZ)/24),vertices=[],uvs=[],colors=[],indices=[],base=new T.Color(palette.ground);
   for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=minX+i/nx*(maxX-minX),z=minZ+j/nz*(maxZ-minZ),near=nearest(x,z);vertices.push(x,heightAt(x,z)-(near.dist<halfWidth+32?2.6:.20),z);uvs.push(x/14,z/14);const c=base.clone().multiplyScalar(.89+rand()*.20);colors.push(c.r,c.g,c.b);if(i&&j){const k=j*(nx+1)+i;indices.push(k,k-1,k-nx-2,k,k-nx-2,k-nx-1)}}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
   const ground=new T.Mesh(geo,texturedMaterial(0xffffff,stage.region==='dakar'?'sandground':stage.region==='alps'?'ground':'grass',index+3,{vertexColors:true,side:T.DoubleSide}));ground.name='terrain';ground.receiveShadow=true;root.add(ground);
  }
  ribbon([-halfWidth-7,-halfWidth-2,-halfWidth,0,halfWidth,halfWidth+2,halfWidth+7],1,false);root.children.at(-1).name='road-verge';
  ribbon([-halfWidth, -halfWidth * .5, 0, halfWidth * .5, halfWidth], 1, true);

  const dummy = new T.Object3D(),routeMinX=Math.min(...samples.map(p=>p.x)),routeMaxX=Math.max(...samples.map(p=>p.x));
  function instance(mesh, i, x, y, z, sx = 1, sy = 1, sz = 1, rotation = 0) {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  function roadsidePoint(i, side, offset) {
    i = T.MathUtils.clamp(i, 0, samples.length - 2);
    const p = samples[i], b = samples[i + 1], dx = b.x - p.x, dz = b.z - p.z, n = Math.hypot(dx, dz);
    const result={ x: p.x - dz / n * offset * side, z: p.z + dx / n * offset * side, yaw: Math.atan2(-dx, -dz), distance: distances[i] };
    if(offset>halfWidth+2){const clearance=halfWidth+Math.min(9,Math.max(1.7,offset-halfWidth-1));for(let attempt=0;attempt<5&&nearest(result.x,result.z).dist<clearance;attempt++){const candidate=attempt===4?halfWidth+10:offset*(.72-attempt*.10);result.x=p.x-dz/n*candidate*side;result.z=p.z+dx/n*candidate*side}if(nearest(result.x,result.z).dist<clearance){result.x=(side>0?routeMaxX+1:routeMinX-1)+side*(offset+12);result.z=p.z}}
    return result;
  }

  // Branches and five irregular foliage clusters produce volumetric, non-conical trees.
  const treeCount = stage.region === 'dakar' ? 65 : 620;
  const trunks = new T.InstancedMesh(new T.CylinderGeometry(.13, .23, 1, 7), texturedMaterial(0x695644,'bark',31), treeCount);
  const canopyPlanes=Array.from({length:3},(_,i)=>new T.PlaneGeometry(2,2).rotateY(i*Math.PI/3)),canopyGeometry=mergeGeometries(canopyPlanes);canopyPlanes.forEach(g=>g.dispose());
  let foliageMap=null;
  if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d'),r=randomSource(8191),conifer=stage.region==='alps'||stage.region==='usa';
   if(conifer){for(let j=0;j<20;j++){const y=50+j*20,spread=45+j*8;for(const side of [-1,1]){g.strokeStyle='#c6d0be';g.lineWidth=3;g.beginPath();g.moveTo(256,y-18);g.lineTo(256+side*spread,y+32);g.stroke();for(let k=0;k<35;k++){const u=k/35,x=256+side*spread*u,py=y-18+u*50;g.strokeStyle=k%3?'#d8dfd0':'#a5b19b';g.lineWidth=2;g.beginPath();g.moveTo(x,py);g.lineTo(x+side*(8+r()*14),py-8-r()*16);g.stroke()}}}}
   else for(let i=0;i<450;i++){const a=r()*Math.PI*2,d=Math.sqrt(r())*205,x=256+Math.cos(a)*d,y=256+Math.sin(a)*d*.8;g.fillStyle=i%3?'#d4dccb':'#a8b99d';g.beginPath();g.ellipse(x,y,8+r()*21,4+r()*12,r()*6,0,Math.PI*2);g.fill()}
   foliageMap=new T.CanvasTexture(c);foliageMap.colorSpace=T.SRGBColorSpace;
  }
  foliageMap?.dispose();foliageMap=typeof Image!=='undefined'?new T.TextureLoader().load(stage.region==='alps'||stage.region==='usa'?SCENERY.pine:SCENERY.broadleaf):null;if(foliageMap)foliageMap.colorSpace=T.SRGBColorSpace;
  const leaves = new T.InstancedMesh(canopyGeometry, material(0xffffff,{map:foliageMap,alphaTest:.42,side:T.DoubleSide}), treeCount);
  const branches = new T.InstancedMesh(new T.CylinderGeometry(.06, .13, 1, 5), material(0x6b5944), treeCount * 3);
  trunks.name = 'tree-trunks'; leaves.name = 'tree-canopies'; leaves.castShadow = true; trunks.castShadow = true;
  for (let i = 0; i < treeCount; i++) {
    const p = roadsidePoint(8 + Math.floor(rand() * (samples.length - 17)), rand() < .5 ? -1 : 1, halfWidth+4+rand()**2*150);
    const y = heightAt(p.x, p.z), scale = .75 + rand() * 1.15, desert = stage.region === 'dakar', tall = (desert ? 4.2 : 10.4) * scale;
    instance(trunks, i, p.x, y + tall * .43, p.z, scale, tall * .86, scale);
    const conifer=stage.region==='alps'||stage.region==='usa',wide=(conifer?2.65:desert?2.8:3.7)*scale;
    instance(leaves,i,p.x,y+tall*.5,p.z,wide,tall*.5,wide,rand()*Math.PI);
    leaves.setColorAt(i,new T.Color(conifer?0xa5c2aa:0xd0dfc3).multiplyScalar(.85+rand()*.25));
    for (let j = 0; j < 3; j++) {
      const angle = j * 2.094 + i, radius = 1.2 * scale;
      dummy.position.set(p.x + Math.cos(angle) * radius * .5, y + tall * .58, p.z + Math.sin(angle) * radius * .5);
      dummy.scale.set(scale, radius * 1.4, scale); dummy.rotation.set(Math.sin(angle) * .9, 0, Math.cos(angle) * .9); dummy.updateMatrix(); branches.setMatrixAt(i * 3 + j, dummy.matrix);
    }
    obstacles.push({ x: p.x, z: p.z, r: .7 * scale });
  }
  root.add(trunks, leaves, branches);

  const rockCount = stage.region === 'dakar' ? 100 : 170;
  const rocks = new T.InstancedMesh(new T.DodecahedronGeometry(1, 1), texturedMaterial(palette.rock,'rock',63), rockCount); rocks.castShadow = true;
  for (let i = 0; i < rockCount; i++) {
    const p = roadsidePoint(Math.floor(rand() * (samples.length - 1)), rand() < .5 ? -1 : 1, 11 + rand() * 130), scale = .7 + rand() * 3.5;
    instance(rocks, i, p.x, heightAt(p.x, p.z) + scale * .25, p.z, scale * 1.3, scale * .75, scale, rand() * 6);
    obstacles.push({ x: p.x, z: p.z, r: scale * .85 });
  }
  root.add(rocks);
  if (stage.region !== 'alps' && stage.region !== 'dakar') {
    const geo=canopyGeometry.clone().translate(0,1,0);let grassMap=null;
    if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.strokeStyle='#e4ebce';for(let i=0;i<55;i++){g.lineWidth=1+rand()*2;const x=rand()*128;g.beginPath();g.moveTo(x,128);g.quadraticCurveTo(x+(rand()-.5)*25,70,x+(rand()-.5)*40,15+rand()*65);g.stroke()}grassMap=new T.CanvasTexture(c);grassMap.colorSpace=T.SRGBColorSpace;}
    const grass = new T.InstancedMesh(geo, material(0x70864b,{map:grassMap,alphaTest:.4,side:T.DoubleSide}), 2200);
    for (let i = 0; i < grass.count; i++) {
      const p = roadsidePoint(Math.floor(rand() * (samples.length - 1)), rand() < .5 ? -1 : 1, halfWidth + .8 + rand() * 34), s = .45 + rand() * .9;
      instance(grass, i, p.x, heightAt(p.x, p.z), p.z, s*.55, s*.25, s*.55, rand() * 6.28);
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
    barriers.push({x:(p.x+q.x)/2,z:(p.z+q.z)/2,a:p,b:q,r:.12,kind:'barrier',distance:(p.distance+q.distance)/2});
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
  // A village crossing gives the last French special a distinct urban sector,
  // while preserving its one-way rally format and keeping buildings off-road.
  if(stage.region==='france'&&stage.variant===2){
    const count=44,walls=new T.InstancedMesh(new T.BoxGeometry(1,1,1),texturedMaterial(0xd6c6a8,'rock',71),count);
    const glazing=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(0x426875,{roughness:.3,metalness:.4}),count*6);
    const pavement=new T.InstancedMesh(new T.BoxGeometry(1,1,1),material(0x999b91),count);
    walls.name='village-buildings';
    for(let i=0;i<count;i++){
      const index=90+Math.floor(i/2)*5,side=i%2?1:-1,p=roadsidePoint(index,side,halfWidth+7),y=heightAt(p.x,p.z),h=7+(i%4)*1.3;
      instance(walls,i,p.x,y+h*.5,p.z,6,h,7,p.yaw);
      const foot=roadsidePoint(index,side,halfWidth+1.5);instance(pavement,i,foot.x,heightAt(foot.x,foot.z)+.07,foot.z,2,.14,11,p.yaw);
      for(let j=0;j<6;j++){const u=(j%2?1:-1)*1.55,front=-3.55;instance(glazing,i*6+j,p.x+Math.cos(p.yaw)*u+Math.sin(p.yaw)*front,y+2+(j>>1)*2.5,p.z-Math.sin(p.yaw)*u+Math.cos(p.yaw)*front,1.1,1.3,.1,p.yaw)}
      obstacles.push({x:p.x,z:p.z,r:4.5});
    }
    root.add(walls,glazing,pavement);
  }
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
  const surfaceNote=stage.surface==='snow'?'snow':stage.surface==='sand'?'sand':stage.surface==='broken'?'rough':null;
  const notes=surfaceNote?[{distance:15,text:stage.surfaceLabel,code:surfaceNote}]:[];let lastNote=-100;
  // Small spectator areas at selected sectors bring the rally service crews
  // to life. People remain behind the barriers and do not obstruct the road.
  const peopleCount=90,people=new T.InstancedMesh(new T.CylinderGeometry(.21,.25,.75,8),material(0xffffff),peopleCount),heads=new T.InstancedMesh(new T.SphereGeometry(.16,10,8),material(0xc79d79),peopleCount),legs=new T.InstancedMesh(new T.CylinderGeometry(.095,.09,.65,7),material(0x293b40),peopleCount*2),arms=new T.InstancedMesh(new T.CylinderGeometry(.065,.065,.55,6),material(0x596677),peopleCount*2),cameras=new T.InstancedMesh(new T.BoxGeometry(.25,.15,.14),material(0x20262b),9),lenses=new T.InstancedMesh(new T.CylinderGeometry(.045,.045,.10,8),material(0x637e8a,{metalness:.3}),9);
  people.name='spectator-jackets';
  for(let i=0;i<peopleCount;i++){
    const gate=2+Math.floor(Math.max(0,i-36)/18)*2,baseIndex=i<36?5+Math.floor(i/2)*2:worldIndex(gate),side=i<36?(i%2?1:-1):1,p=roadsidePoint(baseIndex+(i<36?0:i%6*2),side,halfWidth+2.8+(i%3)*.6),y=heightAt(p.x,p.z);
    instance(people,i,p.x,y+1.08,p.z,1,1,1,p.yaw);people.setColorAt(i,new T.Color([0xdc6b3e,0xe1d8b1,0x4d7c91,0x72885e][i%4]));instance(heads,i,p.x,y+1.64,p.z);
    for(const side of [-1,1])instance(legs,i*2+(side>0?1:0),p.x+side*.13,y+.34,p.z,1,1,1,p.yaw);
    for(const sign of [-1,1]){dummy.position.set(p.x+sign*.24,y+1.20,p.z);dummy.rotation.set(0,p.yaw,sign*.65);dummy.scale.set(1,1,1);dummy.updateMatrix();arms.setMatrixAt(i*2+(sign>0?1:0),dummy.matrix)}
    if(i<36&&i%4===0){const n=i/4;instance(cameras,n,p.x,y+1.53,p.z,1,1,1,p.yaw+side*Math.PI/2);dummy.position.set(p.x-side*.13,y+1.53,p.z);dummy.rotation.set(0,0,Math.PI/2);dummy.scale.set(1,1,1);dummy.updateMatrix();lenses.setMatrixAt(n,dummy.matrix)}
  }
  function worldIndex(gate){return gates[gate].index}
  cameras.name='start-photographers';root.add(people,heads,legs,arms,cameras,lenses);
  const startRig=new T.Group(),startSample=samples[7];startRig.name='start-light-gantry';startRig.position.copy(startSample);startRig.rotation.y=gates[0].yaw;
  const standMaterial=material(0x1c292d),signalMaterials=[0xe94e39,0xf5bd42,0x6fda62].map(color=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.02,roughness:.5}));
  for(const sign of [-1,1]){const post=new T.Mesh(new T.CylinderGeometry(.07,.07,4.3,8),standMaterial);post.position.set(sign*(halfWidth+.6),2.15,0);startRig.add(post)}
  const beam=new T.Mesh(new T.BoxGeometry(halfWidth*2+1.4,.15,.15),standMaterial);beam.position.y=4.2;startRig.add(beam);
  const housing=new T.Mesh(new T.BoxGeometry(2.0,.68,.20),standMaterial);housing.position.set(0,3.78,0);startRig.add(housing);
  signalMaterials.forEach((m,i)=>{const lamp=new T.Mesh(new T.SphereGeometry(.21,12,8),m);lamp.scale.z=.35;lamp.position.set((i-1)*.58,3.8,.14);startRig.add(lamp)});root.add(startRig);
  function setStartLights(number){const phase=number>=3?0:number>0?1:2;signalMaterials.forEach((m,i)=>{m.emissiveIntensity=i===phase?2.5:.01;m.color.setHex(i===phase?[0xe94e39,0xf5bd42,0x6fda62][i]:0x1c292d)})}
  setStartLights(3);
  if(typeof document!=='undefined'){
    const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.fillStyle='#e8ebda';g.fillRect(0,0,512,128);g.fillStyle='#20332d';g.font='italic 900 56px sans-serif';g.fillText('HORIZON RALLY',20,78);g.fillStyle='#c7e958';g.fillRect(0,110,512,18);const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const m=new T.MeshStandardMaterial({map,roughness:.95,side:T.DoubleSide});
    for(let i=0;i<10;i++){const p=roadsidePoint(9+i*4,i%2?-1:1,halfWidth+1.9),board=new T.Mesh(new T.PlaneGeometry(6,1.5),m);board.position.set(p.x,heightAt(p.x,p.z)+.85,p.z);board.rotation.y=p.yaw+(i%2?1:-1)*Math.PI/2;root.add(board)}
  }
  for(let i=30;i<samples.length-35;i+=8) {
    if(distances[i]>length-200)break;
    if(distances[i]-lastNote<105)continue;
    const a=samples[i-20],b=samples[i],c=samples[i+25];
    let turn=Math.atan2(c.x-b.x,-(c.z-b.z))-Math.atan2(b.x-a.x,-(b.z-a.z));
    while(turn>Math.PI)turn-=Math.PI*2;while(turn<-Math.PI)turn+=Math.PI*2;if(Math.abs(turn)<.13)continue;
    const number=Math.abs(turn)>1.5?1:Math.abs(turn)>.9?2:Math.abs(turn)>.65?3:Math.abs(turn)>.35?4:5,right=turn>0;
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
    if(skyDome&&carPosition)skyDome.position.copy(carPosition);
    if(precipitation&&carPosition) {
      precipitation.position.set(carPosition.x,carPosition.y??heightAt(carPosition.x,carPosition.z),carPosition.z);
      const fall=kind==='snow'?3.2:23;
      for(let i=0;i<particleCount;i++){const k=i*3;precipitationPositions[k+1]-=dt*fall;precipitationPositions[k]+=dt*(kind==='snow'?Math.sin(elapsed*.7+i)*.65:1.2);if(precipitationPositions[k+1]<-3)precipitationPositions[k+1]=42;if(precipitationPositions[k]>50)precipitationPositions[k]=-50}
      precipitation.geometry.attributes.position.needsUpdate=true;
    }
    if(scene.fog)scene.fog.far=fogFar*(1+Math.sin(elapsed*.015)*.07);
    weather.wetness=T.MathUtils.clamp((kind==='rain'?.75:kind==='snow'?.28:.04)+Math.sin(elapsed*.02)*.06,0,1);
  }
  // Spatial batches let the GPU cull distant scenery, rather than drawing every
  // detailed tree along the entire 3.5 km special in a single huge instance.
  for(const original of [...root.children]){
    if(!original.isInstancedMesh||original.count<100)continue;
    const chunks=new Map(),matrix=new T.Matrix4(),color=new T.Color();
    for(let i=0;i<original.count;i++){original.getMatrixAt(i,matrix);const key=Math.floor(matrix.elements[14]/220);if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(i)}
    for(const indices of chunks.values()){
      const part=new T.InstancedMesh(original.geometry,original.material,indices.length);part.name=original.name;part.castShadow=original.castShadow;part.receiveShadow=original.receiveShadow;
      indices.forEach((index,i)=>{original.getMatrixAt(index,matrix);part.setMatrixAt(i,matrix);if(original.instanceColor){original.getColorAt(index,color);part.setColorAt(i,color)}});
      part.computeBoundingSphere();root.add(part);
    }
    root.remove(original);original.dispose();
  }
  return {root,curve,samples,length,gates,nearest,heightAt,surfaceAt,notes,obstacles,barriers,weather,roadWidth:halfWidth*2,update,setStartLights,setTextureQuality,get textureSize(){return TEXTURE_SIZES[textureQuality]||512},
    dispose(){
      scene.remove(root);const geometries=new Set(),materials=new Set(),textures=new Set();
      root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value)}});
      for(const texture of textures)texture.dispose();for(const geo of geometries)geo.dispose();for(const m of materials)m.dispose();
    }
  };
}
