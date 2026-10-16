import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {VEHICLE_SHAPES} from './vehicle-assets.js';

// Original procedural rally cars. Every surface and texture is made locally;
// none of the cars depends on a remote model, font, image or service.
const PROFILES = {
  club: { label: 'CLUB 1600', length: 3.98, width: 1.78, wheelbase: 2.48, roof: 1.61, roofRear: .85, tail: 1.05, lamp: 'round', spoiler: .16, color: 0xe5e9e9, accent: 0xed513b },
  alpine: { label: 'ALPINE SPORT', length: 4.10, width: 1.80, wheelbase: 2.40, roof: 1.50, roofRear: .60, tail: .89, lamp: 'round', spoiler: .08, color: 0x337db4, accent: 0xe8e6d5 },
  escort: { label: 'FOREST RS', length: 4.16, width: 1.80, wheelbase: 2.50, roof: 1.60, roofRear: .66, tail: 1.00, lamp: 'round', spoiler: .13, color: 0xf1f0e5, accent: 0x396ea1 },
  delta: { label: 'DELTA INTEGRALE', length: 3.96, width: 1.86, wheelbase: 2.48, roof: 1.61, roofRear: .96, tail: 1.10, lamp: 'quad', spoiler: .20, color: 0xf2f0df, accent: 0xd34136 },
  celica: { label: 'CELICA GT RALLY', length: 4.40, width: 1.87, wheelbase: 2.56, roof: 1.55, roofRear: .72, tail: .95, lamp: 'oval', spoiler: .28, color: 0xebefe7, accent: 0xcb333c },
  quattro: { label: 'AUDI QUATTRO WRC', length: 4.42, width: 1.90, wheelbase: 2.52, roof: 1.61, roofRear: .76, tail: 1.03, lamp: 'rect', spoiler: .31, color: 0xe7e5d8, accent: 0xa62c36 },
};
const AXIS_Y = new T.Vector3(0, 1, 0);
const clamp = T.MathUtils.clamp;
const mat = (color, roughness = .72, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });

function roundedGeometry(w, h, d, radius = .04) {
  if(radius<=.012||Math.min(w,h,d)<.025)return new T.BoxGeometry(w,h,d);
  return new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 2, h / 2, d / 2));
}

function disposeGroup(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.isInstancedMesh) object.dispose();
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const [key,value] of Object.entries(material)) if (value?.isTexture&&key!=='envMap') textures.add(value);
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

// Each instrument set has a recognisable period layout and live needles.
// Pixel-sized labels and nearest filtering keep it legible at retro resolution.
function drawDashboard(context,shape,{gear,rpm,speed}) {
  const gearText=gear===0?'N':gear<0?'R':String(gear),kph=Math.round(Math.abs(speed)*3.6);
  context.clearRect(0,0,768,256);
  if(shape.gauges==='digital') {
    context.fillStyle='#07181a';context.fillRect(0,0,768,256);context.fillStyle=shape.instrument;context.font='bold 154px monospace';context.fillText(gearText,27,168);context.font='bold 112px monospace';context.fillText(String(kph).padStart(3,'0'),235,149);context.font='29px monospace';context.fillText('KM/H',488,193);context.fillText(Math.round(rpm)+' RPM',235,193);
    context.fillStyle='#263a3d';context.fillRect(24,221,720,13);context.fillStyle=rpm>6500?'#f37a4c':shape.instrument;context.fillRect(24,221,clamp(rpm/7800,0,1)*720,13);
    for(let k=0;k<12;k++){context.fillStyle=rpm>2600+k*410?(k>8?'#f48543':'#b7dc57'):'#243438';context.fillRect(239+k*39,20,29,10)}
    return;
  }
  function dial(cx,cy,r,value,max,label,redAt=Infinity) {
    context.fillStyle='#12171b';context.beginPath();context.arc(cx,cy,r,0,Math.PI*2);context.fill();context.strokeStyle='#7b8586';context.lineWidth=5;context.stroke();
    for(let i=0;i<=10;i++) {
      const a=(-.77+i/10*1.54)*Math.PI-Math.PI/2;
      context.strokeStyle=i/10>=redAt?'#e85d4b':shape.instrument;context.lineWidth=3;context.beginPath();context.moveTo(cx+Math.cos(a)*r*.78,cy+Math.sin(a)*r*.78);context.lineTo(cx+Math.cos(a)*r*.91,cy+Math.sin(a)*r*.91);context.stroke();
      if(i%2===0){context.fillStyle=shape.instrument;context.font='19px monospace';context.textAlign='center';context.fillText(String(Math.round(i/10*max)),cx+Math.cos(a)*r*.62,cy+Math.sin(a)*r*.62+6)}
    }
    const a=(-.77+clamp(value/max,0,1)*1.54)*Math.PI-Math.PI/2;
    context.strokeStyle='#ff663f';context.lineWidth=6;context.beginPath();context.moveTo(cx-Math.cos(a)*r*.16,cy-Math.sin(a)*r*.16);context.lineTo(cx+Math.cos(a)*r*.75,cy+Math.sin(a)*r*.75);context.stroke();context.fillStyle='#d6d8cd';context.beginPath();context.arc(cx,cy,9,0,Math.PI*2);context.fill();context.fillStyle=shape.instrument;context.font='17px monospace';context.textAlign='center';context.fillText(label,cx,cy+r*.46);
  }
  if(shape.gauges==='triple') {dial(142,130,91,kph,240,'KM/H');dial(384,127,117,rpm/1000,8,'RPM x1000',.8);dial(625,130,91,90+rpm/170,140,'WATER');}
  else if(shape.gauges==='square') {
    context.fillStyle='#17181b';context.fillRect(0,0,768,256);dial(207,128,111,rpm/1000,8,'RPM x1000',.8);dial(540,128,111,kph,240,'KM/H');context.fillStyle=shape.instrument;context.font='bold 37px monospace';context.textAlign='center';context.fillText(gearText,380,151);
  } else {
    dial(194,128,117,shape.gauges==='group-b'?rpm/1000:kph,shape.gauges==='group-b'?8:240,shape.gauges==='group-b'?'RPM x1000':'KM/H',shape.gauges==='group-b'?.8:Infinity);
    dial(575,128,117,shape.gauges==='group-b'?kph:rpm/1000,shape.gauges==='group-b'?260:8,shape.gauges==='group-b'?'KM/H':'RPM x1000',shape.gauges==='group-b'?Infinity:.8);
    context.fillStyle=shape.instrument;context.font='bold 38px monospace';context.textAlign='center';context.fillText(gearText,385,147);
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
        model.asset?.dispose();disposeGroup(root); root.clear(); build();
        update({...latestInput,dt:0});
      } else {
        if(model.asset)model.asset.paint(config.color??'#'+new T.Color(model.profile.color).getHexString());else model.paint.color.set(config.color ?? model.profile.color);
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
      disposed = true;model.asset?.dispose();disposeGroup(root); root.removeFromParent(); root.clear();
    },
    update(input = {}) { latestInput=input;if (!disposed) update(input); },
  };

  function build() {
    const profile = PROFILES[config.id] || PROFILES.club;
    const shape = VEHICLE_SHAPES[config.id] || VEHICLE_SHAPES.club;
    const L = profile.length, W = profile.width, half = L / 2, axle = profile.wheelbase / 2;
    const paint = new T.MeshStandardMaterial({color:config.color ?? profile.color,roughness:.48,metalness:.14,flatShading:true});
    const accent = mat(profile.accent, .37, .15), dark = mat(shape.dashboard, .80), rubber = mat(0x101419, .94);
    const satin = mat(0x333c43, .58), silver = mat(0xbac1bf, .28, .82), rimMaterial = mat(shape.rim==='gold'?0xb79b59:shape.rim==='silver'?0xbfc5c7:0xe3e5dc, .45, .35);
    const blackMetal = mat(0x272e33, .33, .68), seatMaterial = mat(config.id==='alpine'?0x183046:config.id==='escort'?0x282b24:config.id==='quattro'?0x31302b:0x222b35, .97), beltMaterial = mat(profile.accent, .9);
    for(const material of [paint,silver,rimMaterial])if(config.environment){material.envMap=config.environment;material.envMapIntensity=.6}
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
    const yScale=config.id==='alpine'?.84:config.id==='celica'?.86:.89;
    const baseWidth=W*.44,roofWidth=W*shape.roofWidth,frontBase=shape.frontBase,frontRoof=shape.frontRoof,rearRoof=shape.rearRoof,rearBase=shape.rearBase,roofY=profile.roof;
    let asset=null;

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

    function polygon(parent,points,material){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));const indices=[];for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);geometry.setIndex(indices);geometry.computeVertexNormals();return mesh(parent,geometry,material)}

    // One coherent, purpose-built silhouette per car. Cross sections have
    // rounded shoulders, tapered noses and actual open wheel arches; there is
    // no solid slab across the cabin or a stack of cube-shaped body panels.
    const roundedCoupe=config.id==='celica';
    const stations = 80, cross = 12, shellPositions = [], shellIndices = [];
    const archRadius=.442, archCenter=.40;
    function section(z) {
      const u=z/half, nose=Math.pow(Math.max(-u,0),3), tail=Math.pow(Math.max(u,0),4);
      const width=W*.5*(1-shape.noseTaper*nose-shape.rearTaper*tail);
      const top=shape.bonnet+(shape.nose-shape.bonnet)*nose+(shape.tail-shape.bonnet)*tail;
      let bottom=.39;
      for(const center of [-axle,axle])if(Math.abs(z-center)<archRadius)bottom=Math.max(bottom,archCenter+Math.sqrt(archRadius**2-(z-center)**2));
      return {width,top,bottom};
    }
    for(let i=0;i<=stations;i++) {
      const z=-half+i/stations*L,p=section(z);
      for(let j=0;j<=cross;j++) {
        const angle=-Math.PI/2+j/cross*Math.PI,edge=Math.abs(Math.sin(angle));
        const isBottom=j===0||j===cross;
        const x=Math.sin(angle)*p.width*(roundedCoupe&&isBottom?.96:1);
        const fender=roundedCoupe?.055*(Math.exp(-Math.pow((z+axle)/.46,2))+Math.exp(-Math.pow((z-axle)/.46,2)))*edge**2:0;
        const y=isBottom?p.bottom:p.top+Math.cos(angle)*shape.roundness*(.58+.42*(1-Math.abs(z/half)))+fender;
        const wrappedZ=z+(roundedCoupe?.18*edge**4*Math.pow(Math.max(-z/half,0),5)-.10*edge**4*Math.pow(Math.max(z/half,0),5):0);
        shellPositions.push(x,y,wrappedZ);
        const cabin=z>frontBase&&z<rearBase;
        if(i&&j&&!(cabin&&j>2&&j<cross-1)) {
          const k=i*(cross+1)+j;shellIndices.push(k,k-cross-2,k-1,k,k-cross-1,k-cross-2);
        }
      }
    }
    const shellGeometry=new T.BufferGeometry();shellGeometry.setAttribute('position',new T.Float32BufferAttribute(shellPositions,3));shellGeometry.setIndex(shellIndices);shellGeometry.computeVertexNormals();
    const shell=mesh(body,shellGeometry,paint);shell.name='sculpted-'+shape.kind;body.userData.silhouette=shape.kind;
    const front=section(-half),back=section(half);
    function endPanel(z,p,isFront) {
      const y=p.top-.06;
      const points=[[-p.width*(roundedCoupe?.96:1),.43,z],[-p.width*.98,y,z],[-p.width*.72,p.top+.045,z],[0,p.top+.075,z],[p.width*.72,p.top+.045,z],[p.width*.98,y,z],[p.width*(roundedCoupe?.96:1),.43,z]];
      if(roundedCoupe)for(const point of points)point[2]+=Math.pow(Math.abs(point[0]/p.width),4)*(isFront?.18:-.10);
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));const idx=[];for(let i=1;i<points.length-1;i++)idx.push(...(isFront?[0,i,i+1]:[0,i+1,i]));g.setIndex(idx);g.computeVertexNormals();mesh(body,g,paint);
      if(!roundedCoupe)box(body,p.width*2.02,.11,.13,0,.455,z+(isFront?-.02:.02),dark,.025);
    }
    endPanel(-half,front,true);endPanel(half,back,false);
    if(roundedCoupe){
      for(const isFront of [true,false]){
        const p=isFront?front:back,z=isFront?-half:half,positions=[],indices=[];
        for(let row=0;row<3;row++)for(let k=0;k<=16;k++){
          const x=(k/8-1)*p.width*1.01,edge=Math.abs(x/p.width),wrap=(isFront?.18:-.10)*Math.pow(edge,4);
          positions.push(x,[.38,.48,.565][row],z+wrap+(isFront?-.035:.025)*(1-edge*edge));
          if(row&&k){const n=row*17+k;indices.push(...(isFront?[n,n-18,n-1,n,n-17,n-18]:[n,n-1,n-18,n,n-18,n-17]))}
        }
        const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(body,geometry,paint);
      }
    }

    const noseY=front.top-.13;
    box(body,W*(roundedCoupe?.37:.54),roundedCoupe?.075:.115,.035,0,noseY,-half-.025,blackMetal,.015);
    for(let k=0;k<4;k++)box(body,W*(roundedCoupe?.34:.51),.009,.012,0,noseY-.043+k*(roundedCoupe?.016:.026),-half-.049,satin,0);
    box(body,W*.90,.027,.22,0,.38,-half+.035,blackMetal,.008);
    for(const side of [-1,1]) {
      // The tyre's outer sidewall sits just inside the arch, not outside it.
      const x=side*W*.498;
      box(body,.07,.085,L*.48,x,.425,.05,dark,.015);
      for(const z of [-axle,axle]) {
        const arch=mesh(body,new T.TorusGeometry(archRadius,.028,4,18,Math.PI),paint,x,archCenter,z);arch.rotation.y=Math.PI/2;
        const inner=mesh(body,new T.TorusGeometry(archRadius-.016,.012,3,18,Math.PI),dark,x-side*.025,archCenter,z);inner.rotation.y=Math.PI/2;
        box(body,.16,.21,.026,side*(W*.5-.085),.285,z+.42,rubber,.003);
        if(config.id==='delta'||config.id==='quattro') {
          // Low polygon flares follow the openings rather than hiding wheels
          // behind the solid rectangular extensions of the old car.
          const flare=mesh(body,new T.TorusGeometry(archRadius+.014,.044,4,16,Math.PI),paint,side*(W*.5+.01),archCenter+.008,z);flare.rotation.y=Math.PI/2;
        }
      }
      const doorFront=frontBase+.09,doorRear=config.id==='club'||config.id==='delta'?.62:.70;
      line(body,[[x,.95,doorFront],[x,.49,doorFront+.06],[x,.47,doorRear],[x,.96,doorRear]],dark,.0038);
      box(body,.016,.035,.14,x+side*.009,.92,doorRear-.12,blackMetal,.006);
      beam(body,new T.Vector3(side*W*.43,1.09,frontBase+.04),new T.Vector3(side*W*.52,1.11,frontBase),.016,dark);
      const mirror=box(body,.16,.105,.21,side*W*.54,1.13,frontBase-.015,paint,.03);box(mirror,.127,.068,.007,0,0,.108,silver,.003);
      // A narrow contrasting rally sill makes the proportions easy to read.
      box(body,.012,.07,Math.max(.75,profile.wheelbase-.94),x+side*.008,.52,0,accent,.002);
    }
    function shellY(x,z){const p=section(z);return p.top+Math.sqrt(Math.max(0,1-(x/p.width)**2))*shape.roundness*(.58+.42*(1-Math.abs(z/half)))}
    for(const side of [-1,1]) {
      line(body,Array.from({length:12},(_,i)=>{const z=-half+.25+i*(half+frontBase-.28)/11;return[side*.47,shellY(side*.47,z)+.008,z]}),blackMetal,.003);
      for(let k=0;k<5;k++){const z=frontBase-.09-k*.04;box(body,.18,.008,.014,side*.32,shellY(side*.32,z)+.009,z,dark,.002)}
      box(body,.035,.012,.045,side*.52,shellY(side*.52,-half+.28)+.01,-half+.28,silver,.003);
    }
    if(config.id==='celica'||config.id==='quattro') {
      const scoopZ=frontBase-.48,scoopY=shellY(0,scoopZ);
      const scoop=box(body,.36,.058,.31,0,scoopY+.028,scoopZ,paint,.025);scoop.rotation.x=.04;
      box(body,.29,.032,.012,0,scoopY+.025,scoopZ-.16,dark,.004);
    }
    const tow=mesh(body,new T.TorusGeometry(.039,.012,5,12),accent,-.44,.43,-half-.105);
    const roofShape=new T.Shape();roofShape.moveTo(-roofWidth,-.025);roofShape.quadraticCurveTo(0,.085,roofWidth,-.025);roofShape.lineTo(roofWidth,-.060);roofShape.quadraticCurveTo(0,.035,-roofWidth,-.060);roofShape.closePath();
    function roofWidthAt(z){const t=clamp((z-frontRoof)/(rearRoof-frontRoof)*2-1,-1,1);return roofWidth*(roundedCoupe?1-.11*t*t:1)}
    if(roundedCoupe) {
      const vertices=[],indices=[];
      for(let i=0;i<=12;i++){const t=i/12,z=frontRoof-.025+t*(rearRoof-frontRoof+.05),w=roofWidthAt(z);for(let j=0;j<=12;j++){const u=j/6-1;vertices.push(u*w,roofY+.055*(1-u*u)-.018*Math.pow(t*2-1,4),z);if(i&&j){const k=i*13+j;indices.push(k,k-14,k-1,k,k-13,k-14)}}}
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();mesh(body,geometry,paint);
    }else{
      const roofGeo=new T.ExtrudeGeometry(roofShape,{depth:rearRoof-frontRoof+.08,bevelEnabled:true,bevelThickness:.009,bevelSize:.009,bevelSegments:1,steps:1,curveSegments:8});mesh(body,roofGeo,paint,0,roofY,frontRoof-.04);
    }
    for(const side of [-1,1]) {
      const bx=side*baseWidth,tx=side*roofWidth,frontX=side*roofWidthAt(frontRoof),rearX=side*roofWidthAt(rearRoof);
      if(roundedCoupe)line(body,[[bx,1.035,frontBase],[side*roofWidth*.97,roofY-.13,frontRoof-.13],[frontX,roofY-.025,frontRoof]],paint,.032);else beam(body,new T.Vector3(bx,1.035,frontBase),new T.Vector3(frontX,roofY-.025,frontRoof),.034,paint,6);
      if(roundedCoupe)line(body,[[rearX,roofY-.02,rearRoof],[side*roofWidth*.99,roofY-.14,rearRoof+.20],[bx,1.035,rearBase]],paint,.047);else beam(body,new T.Vector3(rearX,roofY-.02,rearRoof),new T.Vector3(bx,1.035,rearBase),config.id==='delta'?.052:.042,paint,6);
      if(roundedCoupe)line(body,Array.from({length:9},(_,i)=>{const z=frontRoof+i/8*(rearRoof-frontRoof);return[side*roofWidthAt(z),roofY-.02,z]}),dark,.018);else beam(body,new T.Vector3(tx,roofY-.035,frontRoof),new T.Vector3(tx,roofY-.035,rearRoof),.019,dark,5);
      const pillarZ=config.id==='club'||config.id==='delta'?.42:.24;
      beam(body,new T.Vector3(tx,roofY-.035,pillarZ),new T.Vector3(bx,1.035,pillarZ),.022,dark,5);
      const points=[[bx,1.045,frontBase+.04],[bx,1.045,rearBase-.045],[rearX,roofY-.055,rearRoof-.025],[frontX,roofY-.055,frontRoof+.025]];
      if(roundedCoupe){const curved=[[bx,1.045,frontBase+.04],[bx,1.045,rearBase-.045],[side*roofWidth*.99,roofY-.16,rearRoof+.17],[rearX,roofY-.055,rearRoof-.025],[frontX,roofY-.055,frontRoof+.025],[side*roofWidth*.97,roofY-.14,frontRoof-.10]];polygon(body,side>0?curved:[...curved].reverse(),glass)}else quad(body,side>0?points:[...points].reverse(),glass);
      beam(body,new T.Vector3(bx,1.034,frontBase),new T.Vector3(bx,1.034,rearBase),.018,blackMetal,5);
    }
    quad(body,[[-baseWidth,1.045,frontBase],[-roofWidthAt(frontRoof),roofY-.045,frontRoof],[roofWidthAt(frontRoof),roofY-.045,frontRoof],[baseWidth,1.045,frontBase]],glass);
    quad(body,[[baseWidth,1.04,rearBase],[roofWidthAt(rearRoof),roofY-.045,rearRoof],[-roofWidthAt(rearRoof),roofY-.045,rearRoof],[-baseWidth,1.04,rearBase]],glass);
    // Dark rubber surrounds and actual wiper arms separate the glass from paint.
    for(const side of [-1,1]) {
      const wiper=box(body,.01,.01,.31,side*.24,1.082,frontBase+.015,dark,.002);wiper.rotation.set(-.48,side*.5,0);
      if(config.id==='alpine')for(let k=0;k<7;k++){const z=rearBase+.06+k*.042;if(z<half-.12)box(body,.35,.007,.015,side*.30,shellY(side*.30,z)+.01,z,dark,.001)}
    }
    // Original pixel-sharp liveries: each car has a number and fictional team.
    const sponsor=['NOVA MOTORSPORT','ALTITUDE / 11','FOREST WORKS','APEX CORSE','KUMO RACING','NORD SPORT'][Object.keys(PROFILES).indexOf(config.id)]||'HORIZON RALLY';
    const livery=canvasTexture(256,192,(ctx,w,h)=>{
      ctx.fillStyle='#ececdd';ctx.fillRect(0,0,w,h);ctx.fillStyle='#'+accent.color.getHexString();ctx.fillRect(0,0,w,26);ctx.fillRect(0,h-30,w,30);
      ctx.fillStyle='#172027';ctx.textAlign='center';ctx.font='bold 106px monospace';ctx.fillText(shape.number,w/2,143);ctx.fillStyle='#ffffff';ctx.font='bold 13px monospace';ctx.fillText(sponsor,w/2,h-10);
    });
    const banner=canvasTexture(256,32,(ctx,w,h)=>{ctx.fillStyle='#152129';ctx.fillRect(0,0,w,h);ctx.fillStyle='#f5eddc';ctx.font='bold 19px monospace';ctx.textAlign='center';ctx.fillText(sponsor,w/2,23)});
    for(const item of [livery,banner])if(item){item.texture.magFilter=T.NearestFilter;item.texture.minFilter=T.NearestMipmapNearestFilter;item.texture.anisotropy=1}
    if(livery)for(const side of [-1,1]){const plate=mesh(body,new T.PlaneGeometry(.48,.36),new T.MeshBasicMaterial({map:livery.texture}),side*(W*.5+.012),.745,-.02);plate.rotation.y=side*Math.PI/2}
    if(banner)for(const side of [-1,1]){const decal=mesh(body,new T.PlaneGeometry(.88,.11),new T.MeshBasicMaterial({map:banner.texture}),side*(W*.5+.016),.54,.12);decal.rotation.y=side*Math.PI/2}
    if(banner){const strip=mesh(body,new T.PlaneGeometry(roofWidth*1.82,.075),new T.MeshBasicMaterial({map:banner.texture,side:T.DoubleSide}),0,roofY-.09,frontRoof-.024);strip.rotation.x=-Math.atan2(frontRoof-frontBase,roofY-1.045)}
    // Two broad stripes follow the bonnet contour instead of floating above it.
    for(const side of [-1,1])for(let k=0;k<10;k++){const z=-half+.15+k*(half+frontBase-.22)/10,nz=z+(half+frontBase-.22)/10,x=side*.22;quad(body,[[x-.045,shellY(x-.045,z)+.006,z],[x-.045,shellY(x-.045,nz)+.006,nz],[x+.045,shellY(x+.045,nz)+.006,nz],[x+.045,shellY(x+.045,z)+.006,z]],accent)}
    const rearZ=half-.18,spoilerY=Math.max(shape.tail+.05,section(rearZ).top)+profile.spoiler;
    for(const side of [-1,1])box(body,.035,profile.spoiler,.11,side*W*.29,spoilerY-profile.spoiler/2,rearZ,blackMetal,.006);
    const foil=box(body,W*(config.id==='celica'?.91:.82),.055,.25,0,spoilerY,rearZ,paint,.015);foil.rotation.x=-.055;
    const exhaust=mesh(body,new T.CylinderGeometry(.045,.045,.18,10,1,true),silver,.55,.40,half+.025);exhaust.rotation.x=Math.PI/2;mesh(body,new T.CircleGeometry(.037,10),dark,.55,.40,half+.118);
    for(const side of [-1,1]) {
      const y=back.top-.11;
      box(body,config.id==='celica'?.41:.29,.115,.018,side*W*.32,y,half+.016,rearMaterial,.012);
      box(body,.055,.055,.021,side*W*.25,y,half+.028,mat(0xe6b54f,.4),.003);
    }
    box(body,.33,.065,.012,0,.62,half+.023,mat(0xe5e7dd),.002);
    function roundLamp(x,y,z,radius) {
      const bucket=mesh(body,new T.CylinderGeometry(radius+.018,radius+.01,.07,12),roundedCoupe?paint:blackMetal,x,y,z);bucket.rotation.x=Math.PI/2;
      const lens=mesh(body,new T.CylinderGeometry(radius,radius,.016,16),lampMaterial,x,y,z-.043);lens.rotation.x=Math.PI/2;
      mesh(body,new T.TorusGeometry(radius+.003,.008,4,16),silver,x,y,z-.055);
      for(let k=-1;k<=1;k++)box(body,radius*1.55,.004,.005,x,y+k*radius*.5,z-.056,silver,0);
    }
    for(const side of [-1,1]) {
      if(profile.lamp==='round'||profile.lamp==='quad'||config.id==='celica') {
        roundLamp(side*W*(roundedCoupe?.305:.34),roundedCoupe?front.top-.035:noseY+.015,-half+(roundedCoupe?.015:-.025),config.id==='alpine'?.106:.102);
        if(profile.lamp==='quad'||config.id==='celica'||config.id==='alpine')roundLamp(side*W*(roundedCoupe?.195:.20),roundedCoupe?front.top-.045:noseY+.015,-half-.025,config.id==='alpine'?.077:.085);
      }else {
        box(body,.37,.12,.035,side*W*.32,noseY+.018,-half-.025,blackMetal,profile.lamp==='oval'?.04:.005);
        box(body,.32,.086,.012,side*W*.32,noseY+.018,-half-.047,lampMaterial,profile.lamp==='oval'?.035:.003);
        for(let k=0;k<5;k++)box(body,.005,.075,.005,side*W*.32-.12+k*.06,noseY+.018,-half-.056,silver,0);
      }
      if(!roundedCoupe)roundLamp(side*.235,Math.max(.54,noseY-.17),-half-.095,.09);
      box(body,.065,.035,.015,side*W*.45,noseY-.065,-half-.035,mat(0xe6a13e,.4),.003);
    }
    body.scale.y=yScale;

    // Cast-rim wheels with thick, rounded shoulders and instanced tread blocks.
    const wheels = [];
    for (const side of [-1, 1]) for (const z of [-axle, axle]) {
      const pivot = new T.Group(), spin = new T.Group();
      pivot.name = `${z < 0 ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}-wheel`;
      pivot.position.set(side * (W*.5-.133), .355, z);pivot.add(spin); root.add(pivot);
      const tire = mesh(spin, new T.CylinderGeometry(.34, .34, .245, 20, 1), rubber); tire.rotation.z = Math.PI / 2;
      for (const face of [-1, 1]) {
        const shoulder = mesh(spin, new T.TorusGeometry(.302, .045, 5, 20), rubber, face * .105, 0, 0);
        shoulder.rotation.y = Math.PI / 2;
        const sidewallRing = mesh(spin, new T.TorusGeometry(.272, .004, 3, 20), satin, face * .150, 0, 0);
        sidewallRing.rotation.y = Math.PI / 2;
      }
      const barrel = mesh(spin, new T.CylinderGeometry(.235, .235, .255, 16, 1), blackMetal); barrel.rotation.z = Math.PI / 2;
      const brake = mesh(spin, new T.CylinderGeometry(.197, .197, .018, 16), silver, side * .097, 0, 0); brake.rotation.z = Math.PI / 2;
      const rim = mesh(spin, new T.TorusGeometry(.215, .016, 4, 20), rimMaterial, side * .137, 0, 0); rim.rotation.y = Math.PI / 2;
      const hub = mesh(spin, new T.CylinderGeometry(.060, .060, .036, 12), rimMaterial, side * .137, 0, 0); hub.rotation.z = Math.PI / 2;
      for (let k = 0; k < shape.spokes; k++) {
        const angle = k * Math.PI * 2 / shape.spokes;
        const spoke = box(spin, .026, .185, .032, side * .137, Math.cos(angle) * .128, Math.sin(angle) * .128, rimMaterial, .007);
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
      const sidewall=canvasTexture(128,128,(ctx,w,h)=>{ctx.clearRect(0,0,w,h);ctx.fillStyle='#b8bcad';ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillText('GEARSTONE',64,29);ctx.font='bold 8px monospace';ctx.fillText(config.tuning.tires==='snow'?'ICE / 16':'RALLY / 16',64,107)});
      if(sidewall){sidewall.texture.magFilter=T.NearestFilter;const lettering=mesh(spin,new T.PlaneGeometry(.55,.55),new T.MeshBasicMaterial({map:sidewall.texture,transparent:true,depthWrite:false}),side*.155,0,0);lettering.rotation.y=side*Math.PI/2}
      const caliper = box(pivot, .04, .11, .09, side * .10, .01, .15, accent, .015);
      wheels.push({ pivot, spin, front: z < 0, side, baseY: .355, caliper, physicsIndex:(z < 0 ? 0 : 2)+(side>0?1:0) });
    }

    // The cockpit is real geometry with a clear driver's eye position. There
    // are no glass planes, arbitrary camera offsets or floating dashboard.
    box(inside, W * .85, .12, 3.0, 0, .35, .20, dark, .02);
    // Opaque firewall and footwell enclose the cabin independently of exterior
    // wheel/body visibility. These panels remain safely below the sight line.
    box(inside, W * .86, .58, .09, 0, .68, -.94, dark, .045);
    for (const side of [-1,1]) box(inside, .12, .50, 1.15, side*W*.43, .63, -.45, dark, .05);
    box(inside, .31, .37, 1.42, .08, .55, .15, satin, .03);
    // Real dashboard variants: the berlinette has two hooded round dials,
    // the saloon has timber trim and auxiliary clocks, the hatch has a square
    // instrument binnacle, and the competition cars have their own consoles.
    inside.userData.cockpitStyle=shape.cockpit;
    const dashboard = new T.Group();dashboard.name='dashboard-'+shape.cockpit;inside.add(dashboard);
    const dashboardTrim=mat(shape.trim,.77,.05);
    if(fabric&&config.id==='escort'){dashboardTrim.map=fabric.texture;dashboardTrim.map.repeat.set(3,.2)}
    box(dashboard,W*.84,.24,.43,0,.95,-.62,dark,.055);
    box(dashboard,W*.82,.045,.40,0,1.087,-.65,config.id==='alpine'?dark:satin,.02);
    if(shape.gauges==='twin') {
      for(const x of [-.49,-.275]){const pod=mesh(dashboard,new T.CylinderGeometry(.113,.113,.12,16),dark,x,1.115,-.39);pod.rotation.x=Math.PI/2;const rim=mesh(dashboard,new T.TorusGeometry(.099,.007,4,20),silver,x,1.115,-.322)}
      box(dashboard,.35,.09,.018,.33,.99,-.393,dashboardTrim,.008);
      for(const x of [.23,.34,.45]){const knob=mesh(dashboard,new T.CylinderGeometry(.018,.018,.025,8),silver,x,.99,-.372);knob.rotation.x=Math.PI/2}
    } else if(shape.gauges==='six') {
      box(dashboard,W*.78,.16,.045,0,1.05,-.395,dashboardTrim,.012);
      for(const x of [-.49,-.28]){const pod=mesh(dashboard,new T.CylinderGeometry(.105,.105,.075,16),blackMetal,x,1.125,-.36);pod.rotation.x=Math.PI/2;mesh(dashboard,new T.TorusGeometry(.099,.006,4,20),silver,x,1.125,-.314)}
      for(const x of [.11,.25,.39,.53]){const clock=mesh(dashboard,new T.CylinderGeometry(.053,.053,.018,12),blackMetal,x,1.065,-.355);clock.rotation.x=Math.PI/2;mesh(dashboard,new T.TorusGeometry(.047,.005,4,14),silver,x,1.065,-.342)}
    } else if(shape.gauges==='square') {
      box(dashboard,.50,.185,.15,-.39,1.125,-.41,blackMetal,.008);
      box(dashboard,.26,.265,.06,.27,.944,-.365,satin,.008);
      for(let row=0;row<3;row++)for(let col=0;col<2;col++)box(dashboard,.032,.018,.021,.20+col*.12,.89+row*.063,-.325,row===2?accent:silver,.002);
    } else if(shape.gauges==='triple') {
      for(const x of [-.53,-.39,-.25]){const pod=mesh(dashboard,new T.CylinderGeometry(x===-.39?.101:.079,x===-.39?.101:.079,.14,16),blackMetal,x,1.13,-.41);pod.rotation.x=Math.PI/2}
      const console=box(dashboard,.22,.28,.10,.18,.92,-.36,satin,.025);console.rotation.z=-.05;
      for(const y of [.88,.95,1.02])box(dashboard,.12,.028,.015,.18,y,-.30,dashboardTrim,.003);
    } else if(shape.gauges==='group-b') {
      box(dashboard,.48,.185,.16,-.39,1.12,-.415,blackMetal,.012);
      box(dashboard,.36,.23,.08,.31,1.035,-.36,blackMetal,.005);
      for(const x of [.20,.31,.42]){const pod=mesh(dashboard,new T.CylinderGeometry(.047,.047,.024,12),dark,x,1.09,-.308);pod.rotation.x=Math.PI/2;mesh(dashboard,new T.TorusGeometry(.043,.005,4,12),silver,x,1.09,-.291)}
      for(let k=0;k<5;k++){box(dashboard,.018,.032,.018,.19+k*.06,.975,-.304,k%2?accent:silver,.002);box(dashboard,.035,.008,.006,.19+k*.06,.945,-.294,dashboardTrim,0)}
    } else {
      box(dashboard,.44,.175,.13,-.39,1.12,-.408,blackMetal,.025);
      box(dashboard,.26,.20,.075,.26,.97,-.365,satin,.022);
      for(let k=0;k<5;k++)box(dashboard,.024,.021,.026,.12+k*.065,.985,-.32,k===0?accent:silver,.004);
    }
    for(const x of shape.vents==='round'?[-.66,.63]:[-.68,.56]) {
      if(shape.vents==='round') {
        const vent=mesh(dashboard,new T.CylinderGeometry(.046,.046,.018,12),blackMetal,x,1.02,-.37);vent.rotation.x=Math.PI/2;
        for(let k=-1;k<=1;k++)box(dashboard,.066,.006,.008,x,1.02+k*.018,-.355,satin,.001);
      }else {
        box(dashboard,shape.vents==='oval'?.15:.12,.065,.024,x,1.015,-.37,blackMetal,shape.vents==='oval'?.027:.003);
        for(let k=0;k<4;k++)box(dashboard,.009,.045,.008,x-.038+k*.026,1.015,-.353,satin,0);
      }
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
      gauge.texture.magFilter=T.NearestFilter;gauge.texture.minFilter=T.LinearFilter;gauge.texture.anisotropy=1;
      const display = mesh(inside, new T.PlaneGeometry(shape.gauges==='digital'?.378:shape.gauges==='triple'?.43:.43, shape.gauges==='digital'?.126:.18), new T.MeshBasicMaterial({ map: gauge.texture,transparent:shape.gauges!=='digital',depthWrite:false }), -.39, 1.13, -.307);
      display.name = 'live-dashboard';
    }
    let auxiliary=null;
    if(shape.gauges==='six'||shape.gauges==='group-b') {
      const count=shape.gauges==='six'?4:3;
      auxiliary=canvasTexture(count*128,128,ctx=>{});
      if(auxiliary){auxiliary.texture.magFilter=T.NearestFilter;for(let k=0;k<count;k++){const material=new T.MeshBasicMaterial({map:auxiliary.texture,transparent:true,depthWrite:false}),g=new T.PlaneGeometry(.086,.086);const uv=g.attributes.uv;for(let n=0;n<uv.count;n++)uv.setX(n,(uv.getX(n)+k)/count);mesh(inside,g,material,(shape.gauges==='six'?.11:.20)+k*(shape.gauges==='six'?.14:.11),shape.gauges==='six'?1.065:1.09,shape.gauges==='six'?-.335:-.284)}}
    }
    const plaque = canvasTexture(512, 128, context => {
      context.fillStyle = shape.dashboard; context.fillRect(0, 0, 512, 128);
      context.fillStyle = '#d9ded7'; context.font = 'bold 38px sans-serif'; context.textAlign = 'center'; context.fillText(profile.label, 256, 60);
      context.fillStyle = shape.trim; context.font = '21px sans-serif'; context.fillText('RALLY HORIZON · FIRST EDITION', 256, 104);
    });
    if (plaque) mesh(inside, new T.PlaneGeometry(.42, .105), new T.MeshBasicMaterial({ map: plaque.texture }), .48, .82, -.375);

    const wheelBase = new T.Group();
    wheelBase.position.set(-.39, 1.035, -.22); wheelBase.rotation.x = -.25; inside.add(wheelBase);
    beam(inside, new T.Vector3(-.39, .96, -.48), new T.Vector3(-.39, 1.035, -.22), .035, dark);
    const wheelSpin = new T.Group(); wheelBase.add(wheelSpin);
    const steeringLeather = dark.clone();steeringLeather.color.setHex(0x151b20);
    mesh(wheelSpin, new T.TorusGeometry(.235, .024, 8, 40), steeringLeather);
    for (let k = 0; k < shape.wheelSpokes; k++) {
      const angle = k * Math.PI * 2 / shape.wheelSpokes + (shape.wheelSpokes===2?0:shape.wheelSpokes===4?Math.PI/4:-Math.PI/2);
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
    const hoodPositions=[],hoodIndices=[];
    for(let i=0;i<=14;i++){const z=-half+i/14*(half+frontBase+.015),p=section(z);for(let j=0;j<=8;j++){const x=(j/8*2-1)*p.width;hoodPositions.push(x,shellY(x,z),z);if(i&&j){const k=i*9+j;hoodIndices.push(k,k-10,k-1,k,k-9,k-10)}}}
    const hoodGeometry=new T.BufferGeometry();hoodGeometry.setAttribute('position',new T.Float32BufferAttribute(hoodPositions,3));hoodGeometry.setIndex(hoodIndices);hoodGeometry.computeVertexNormals();mesh(cockpitShell,hoodGeometry,paint);
    for (const side of [-1, 1]) {
      for(let k=0;k<8;k++){const z=-half+.16+k*(half+frontBase-.20)/8,nz=z+(half+frontBase-.20)/8,x=side*.22;quad(cockpitShell,[[x-.045,shellY(x-.045,z)+.006,z],[x-.045,shellY(x-.045,nz)+.006,nz],[x+.045,shellY(x+.045,nz)+.006,nz],[x+.045,shellY(x+.045,z)+.006,z]],accent)}
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
      light.position.set(side * W * .34, .86*yScale, -half - .10);
      light.target.position.set(side * .7, .38, -40);
      light.visible = false; light.castShadow = false;
      root.add(light, light.target); lights.push(light);
    }
    inside.scale.y=yScale;cockpitShell.scale.y=yScale;
    // Only the onboard view needs the detailed dashboard, animated fingers
    // and upholstery. A compact cabin remains visible through exterior glass.
    const exteriorCabin=new T.Group();exteriorCabin.name='exterior-cabin';exteriorCabin.scale.y=yScale;root.add(exteriorCabin);
    box(exteriorCabin,W*.84,.10,1.75,0,.38,.18,dark,0);
    box(exteriorCabin,W*.82,.20,.36,0,.95,-.64,dark,.04);
    for(const x of [-.39,.40]){const seat=box(exteriorCabin,.45,.73,.18,x,.92,.72,seatMaterial,.04);seat.rotation.x=-.12;box(exteriorCabin,.29,.20,.15,x,1.35,.78,dark,.035)}
    mesh(exteriorCabin,new T.SphereGeometry(.12,12,8),glove,-.39,1.26,.47);
    batchStatic(exteriorCabin);
    const eyeHeight=Math.min(1.40,roofY-.16)*yScale;
    const cameraAnchors = {
      chasePosition: new T.Vector3(0, 1.95, 5.6), chaseTarget: new T.Vector3(0, .80, -12),
      hoodPosition: new T.Vector3(0, 1.245*yScale, -.985), hoodTarget: new T.Vector3(0, 1.16*yScale, -45),
      cockpitPosition: new T.Vector3(-.39, eyeHeight, .56),
      cockpitTarget: new T.Vector3(-.39, eyeHeight-.11*yScale, -45),
    };
    const dirtMaterial=new T.MeshStandardMaterial({color:0x77664e,roughness:1,transparent:true,opacity:0,depthWrite:false}),dirtLayer=new T.Group();body.add(dirtLayer);
    for(const sign of [-1,1])for(let k=0;k<40;k++){const z=-half+.2+(k*1.618%1)*(L-.4),y=.47+(Math.sin(k*4.71)*.5+.5)*.33;const mark=mesh(dirtLayer,new T.CircleGeometry(.012+(k%5)*.007,7),dirtMaterial,sign*(W*.5+.025),y,z);mark.rotation.y=sign*Math.PI/2;mark.scale.set(1,.6+(k%3)*.5,1);mark.castShadow=false}
    batchStatic(dirtLayer);
    batchStatic(body,new Set([dirtLayer]));
    batchStatic(cockpitShell);
    for (const wheel of wheels) batchStatic(wheel.spin);
    for (const hand of hands) batchStatic(hand.hand);
    const animated = new Set([wheelBase, lever, ...hands.flatMap(hand => [hand.hand, hand.arm, hand.forearm])]);
    batchStatic(inside, animated);
    const deformation=[];body.traverse(o=>{if(o.isMesh&&o.geometry.attributes.position&&!o.material.transparent){const positions=o.geometry.attributes.position;deformation.push({object:o,positions,rest:positions.array.slice()})}});
    const crackMaterial=new T.MeshBasicMaterial({color:0xb6d2d6,transparent:true,opacity:.8,depthWrite:false}),cracks=new T.Group();cracks.name='cracked-windscreen';cracks.visible=false;
    for(let i=0;i<9;i++){const angle=i*Math.PI*2/9,points=[];for(let j=0;j<4;j++){const r=j*.065;points.push(new T.Vector3(.27+Math.cos(angle)*r,1.19+j*.03,frontBase+(1.19+j*.03-1.05)/(roofY-1.09)*(frontRoof-frontBase)+.012))}const line=new T.Line(new T.BufferGeometry().setFromPoints(points),crackMaterial);cracks.add(line)}
    cracks.scale.y=yScale;root.add(cracks);
    model = { profile, shape, auxiliary, asset, exteriorCabin, yScale, damageKey:'',deformation,cracks, paint, reflective:[paint,silver,rimMaterial], tire: rubber, lights, lampMaterial, rearMaterial, body, dirtMaterial, cockpitShell, gauge, gaugeTick: 1, wheelBase, wheelSpin, wheels, hands, lever };
    Object.assign(api, { exterior, inside, wheels, wheelSpin, hands, lever, cameraAnchors, textureSize:size, cockpitStyle:shape.cockpit, silhouette:shape.kind });
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
  function update({ steer = 0, speed = 0, dt = 0, shift = 0, rpm = 900, gear = 1, brake = false, cameraMode = 0, suspension = 0, roll = 0, dirt = 0, damage=0,damageZones={}, environmentLight = .6, wheels: wheelStates } = {}) {
    const { wheelSpin, wheels, body, hands, lever, gauge, cockpitShell } = model;
    model.dirtMaterial.opacity=clamp(Math.max(Number(dirt)||0,damage*.5),0,.65);for(const m of model.reflective)m.envMapIntensity=clamp(Number(environmentLight)||0,0,1.5);
    model.cracks.visible=damage>.35&&cameraMode!==1;
    const damageKey=JSON.stringify(damageZones);
    if(damageKey!==model.damageKey){model.damageKey=damageKey;for(const {object,positions,rest}of model.deformation){object.updateMatrix();const matrix=object.matrix,inverse=matrix.clone().invert(),v=new T.Vector3();for(let i=0;i<positions.count;i++){v.fromArray(rest,i*3).applyMatrix4(matrix);const front=clamp((-v.z-.5)/1.5,0,1)*(damageZones.front||0),rear=clamp((v.z-.5)/1.5,0,1)*(damageZones.rear||0),side=clamp((Math.abs(v.x)-.45)/.5,0,1)*(damageZones[v.x<0?'left':'right']||0),crush=front+rear;v.z+=(front-rear)*.56;v.y-=crush*.12*Math.max(0,v.y-.55);v.x*=1-side*.22;v.x+=Math.sin(i*1.71)*crush*.018;v.applyMatrix4(inverse);positions.setXYZ(i,v.x,v.y,v.z)}positions.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingSphere()}}
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
    api.inside.visible=cameraMode===2;model.exteriorCabin.visible=cameraMode!==2;
    cockpitShell.visible = cameraMode === 2;
    root.updateMatrixWorld(true);
    inverseQuaternion.copy(root.quaternion).invert();
    wheelSpin.getWorldQuaternion(localQuaternion); localQuaternion.premultiply(inverseQuaternion);
    const reach = Math.sin(clamp(Number(shift) || 0, 0, 1) * Math.PI);
    for (const hand of hands) {
      target.set(hand.sign * .221, .064, .025);
      wheelSpin.localToWorld(target); api.inside.worldToLocal(target);
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
      drawDashboard(context,model.shape,{gear,rpm,speed:finiteSpeed});
      if(model.auxiliary){const aux=model.auxiliary,ctx=aux.context,count=model.shape.gauges==='six'?4:3;ctx.clearRect(0,0,count*128,128);for(let k=0;k<count;k++){const cx=k*128+64;ctx.fillStyle='#101719';ctx.beginPath();ctx.arc(cx,64,62,0,Math.PI*2);ctx.fill();for(let n=0;n<=6;n++){const a=(-.72+n*.24)*Math.PI-Math.PI/2;ctx.strokeStyle=model.shape.instrument;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*47,64+Math.sin(a)*47);ctx.lineTo(cx+Math.cos(a)*55,64+Math.sin(a)*55);ctx.stroke()}const a=(-.54+(k===2?clamp(rpm/7800,0,1):.45+k*.05)*1.3)*Math.PI-Math.PI/2;ctx.strokeStyle='#e95c3a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx,64);ctx.lineTo(cx+Math.cos(a)*44,64+Math.sin(a)*44);ctx.stroke();ctx.fillStyle=model.shape.instrument;ctx.textAlign='center';ctx.font='13px monospace';ctx.fillText(['OIL','WATER','BOOST','FUEL'][k],cx,96)}aux.texture.needsUpdate=true}

      gauge.texture.needsUpdate = true;
    }
    root.updateMatrixWorld(true);
  }
  build();
  update();
  return api;
}
