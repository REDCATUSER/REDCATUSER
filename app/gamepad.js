const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:0));
export function deadzone(value,zone=.12){const v=clamp(value,-1,1),z=clamp(zone,0,.4);return Math.abs(v)<=z?0:Math.sign(v)*(Math.abs(v)-z)/(1-z)}
const MAP={0:'handbrake',1:'headlights',2:'recover',3:'camera',4:'shiftDown',5:'shiftUp',8:'transmission',9:'pause',12:'up',13:'down',14:'left',15:'right'};
export class GamepadInput{
 constructor(){this.previous=new Set();this.pad=null;this.connected=false;this.armed=true;this.input={throttle:0,brake:0,steer:0,handbrake:false};this.pressed=new Set()}
 block(){this.armed=false;this.input={throttle:0,brake:0,steer:0,handbrake:false};this.pressed.clear()}
 poll(pads=[],{gamepad=true,deadzone:zone=12,sensitivity=100}={}){
  const pad=gamepad&&Array.from(pads||[]).find(p=>p?.connected&&p.mapping==='standard');this.pressed=new Set();
  if(!pad){this.pad=null;this.connected=false;this.previous.clear();this.input={throttle:0,brake:0,steer:0,handbrake:false};return this}
  this.pad=pad;this.connected=true;
  const value=i=>clamp(pad.buttons?.[i]?.value??(pad.buttons?.[i]?.pressed?1:0),0,1),buttons=new Set(Object.entries(MAP).filter(([i])=>value(i)>.5).map(([,action])=>action));
  const steer=clamp(deadzone(pad.axes?.[0],zone/100)*clamp(sensitivity/100,.5,1.5),-1,1),throttle=value(7),brake=value(6);
  if(!this.armed){if(!buttons.size&&Math.abs(steer)<.05&&throttle<.05&&brake<.05)this.armed=true;this.previous=buttons;return this}
  this.pressed=new Set([...buttons].filter(action=>!this.previous.has(action)));this.previous=buttons;
  this.input={throttle,brake,steer,handbrake:buttons.has('handbrake')};return this;
 }
 rumble(strength=.4){
  const actuator=this.pad?.vibrationActuator;if(!actuator?.playEffect)return;
  try{Promise.resolve(actuator.playEffect('dual-rumble',{duration:120,strongMagnitude:clamp(strength,0,1),weakMagnitude:clamp(strength*.55,0,1)})).catch(()=>{})}catch{}
 }
}
