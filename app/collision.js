// Capsule chassis against trees/rocks and continuous guardrail segments.
// Normal impulses remove the velocity into an obstacle, preserving a glancing
// slide along it. The lever arm produces a bounded yaw impulse.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function collisionIndex(objects,cellSize=32){
 const cells=new Map();
 for(const o of objects){const a=o.a||o,b=o.b||o,r=(o.r||.4)+3;
  for(let x=Math.floor((Math.min(a.x,b.x)-r)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+r)/cellSize);x++)for(let z=Math.floor((Math.min(a.z,b.z)-r)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+r)/cellSize);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(o)}
 }
 return{x:0,z:0,query(x,z){return cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))||[]}};
}
export function resolveContacts(state,objects,{length=4.1,width=1.76,mass=1100}={}){
 const fx=-Math.sin(state.yaw),fz=-Math.cos(state.yaw),halfWidth=width*.48,extent=length*.5-halfWidth,inertia=Math.max(1,(length*length+width*width)/12);
 let hit=null;
 for(const object of objects){
  const a=object.a||object,b=object.b||object,dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
  const contacts=[];
  for(const offset of [-extent,0,extent]){
   const px=state.x+fx*offset,pz=state.z+fz*offset,t=len2?clamp(((px-a.x)*dx+(pz-a.z)*dz)/len2,0,1):0,qx=a.x+dx*t,qz=a.z+dz*t;
   const ex=px-qx,ez=pz-qz,d=Math.hypot(ex,ez),radius=halfWidth+(object.r||.4);
   if(d>=radius)continue;
   const nx=d>.0001?ex/d:-fx,nz=d>.0001?ez/d:-fz,penetration=radius-d;
   contacts.push({nx,nz,penetration,rx:fx*offset-nx*halfWidth,rz:fz*offset-nz*halfWidth});
  }
  if(!contacts.length)continue;
  const depth=Math.max(...contacts.map(c=>c.penetration)),support=contacts.filter(c=>c.penetration>=depth-.01),contact={nx:0,nz:0,rx:0,rz:0,penetration:depth};
  for(const c of support)for(const k of ['nx','nz','rx','rz'])contact[k]+=c[k]/support.length;
  const normalLength=Math.hypot(contact.nx,contact.nz);if(normalLength>.001){contact.nx/=normalLength;contact.nz/=normalLength}
  const {nx,nz,rx,rz}=contact;state.x+=nx*(contact.penetration+.003);state.z+=nz*(contact.penetration+.003);
  const vx=state.vx+state.yawRate*rz,vz=state.vz-state.yawRate*rx,normalSpeed=vx*nx+vz*nz;
  if(normalSpeed>=0)continue;
  const lever=rz*nx-rx*nz,impulse=-(1.04)*normalSpeed/(1+lever*lever/inertia);
  state.vx+=nx*impulse;state.vz+=nz*impulse;state.yawRate=clamp(state.yawRate+lever*impulse/inertia,-1.25,1.25);
  const tx=-nz,tz=nx,tangent=state.vx*tx+state.vz*tz,friction=clamp(-tangent,-impulse*.16,impulse*.16);state.vx+=tx*friction;state.vz+=tz*friction;
  if(!hit||-normalSpeed>hit.speed){const longitudinal=rx*fx+rz*fz,lateral=rx*Math.cos(state.yaw)-rz*Math.sin(state.yaw);hit={speed:-normalSpeed,zone:Math.abs(longitudinal)>Math.abs(lateral)?longitudinal>0?'front':'rear':lateral>0?'right':'left',x:state.x+rx,z:state.z+rz,mass,kind:object.kind||'solid'}}
 }
 state.speed=state.vx*fx+state.vz*fz;state.side=state.vx*Math.cos(state.yaw)-state.vz*Math.sin(state.yaw);
 if(hit&&hit.speed>1)state.collision=.16;
 return hit;
}
export function impactDamage(damage,speed){return clamp(damage+.5*(Math.max(0,speed-3)/23)**2,0,1)}
export const isCritical=damage=>damage>=.9;
