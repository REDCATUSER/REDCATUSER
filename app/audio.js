import {ENGINE_AUDIO} from '../src/audio/engine-data.js';

// Real CC0 recording layered with combustion, intake, turbo and tire synthesis.
// Original WAVs and per-file attribution are preserved in src/audio/.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const COMBUSTION_WORKLET=`
class RallyCombustion extends AudioWorkletProcessor {
 static get parameterDescriptors(){return [
  {name:'rpm',defaultValue:950,minValue:500,maxValue:10000,automationRate:'k-rate'},
  {name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
  {name:'cylinders',defaultValue:4,minValue:3,maxValue:8,automationRate:'k-rate'},
  {name:'limiter',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}
 ]}
 constructor(){super();this.cycle=0;this.crank=0;this.body=0;this.dc=0;this.fire=0;this.seed=924531;this.time=0}
 random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/2147483648-1}
 process(inputs,outputs,parameters){
  const output=outputs[0][0],rpm=parameters.rpm[0],load=parameters.load[0],cyl=parameters.cylinders[0],limit=parameters.limiter[0];
  for(let i=0;i<output.length;i++){
   this.time+=1/sampleRate;this.crank+=rpm/(60*sampleRate);this.cycle+=rpm*cyl/(120*sampleRate);
   if(this.cycle>=1){this.cycle-=1;this.fire=.93+this.random()*.07}
   const pulse=Math.exp(-this.cycle*(8+load*10))*this.fire;
   this.dc+=(pulse-this.dc)*.003;
   const exhaust=(pulse-this.dc)*(Math.sin(this.cycle*Math.PI*1.2)+.32);
   this.body+=((this.random()*(.04+load*.12))-this.body)*.07;
   const uneven=cyl===5?Math.sin(this.crank*6.283185*.5)*.045:0;
   const mechanical=Math.sin(this.crank*6.283185)*.05+Math.sin(this.crank*12.56637)*.025+uneven;
   const cut=limit>.5&&Math.sin(this.time*139)>0?.12:1;
   output[i]=Math.tanh((exhaust*(.24+load*.6)+mechanical+this.body)*1.7)*cut;
  }
  return true;
 }
}
registerProcessor('rally-combustion-v2',RallyCombustion);`;

export async function decodeEmbeddedAudio(context,url){
 // Avoid fetch: standalone file:// Windows builds remain fully offline.
 const raw=atob(url.slice(url.indexOf(',')+1)),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return context.decodeAudioData(bytes.buffer);
}

function seamlessLoop(context,buffer,seconds=.025){
 const crossfade=Math.min(Math.floor(buffer.sampleRate*seconds),Math.floor(buffer.length/4));
 const loop=context.createBuffer(buffer.numberOfChannels,buffer.length-crossfade,buffer.sampleRate);
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const source=buffer.getChannelData(channel),out=loop.getChannelData(channel),body=buffer.length-2*crossfade;
  out.set(source.subarray(crossfade,buffer.length-crossfade));
  for(let i=0;i<crossfade;i++){const mix=i/(crossfade-1);out[body+i]=source[buffer.length-crossfade+i]*(1-mix)+source[i]*mix}
 }
 return loop;
}

export class RallyAudio{
 constructor(){
  this.ctx=null;this.enabled=true;this.volume=.65;this.duck=1;this.ready=false;
  this.lastGear=null;this.lastThrottle=0;this.shiftUntil=0;this.nextPop=0;this.engineVolume=1;this.effectsVolume=.75;this.lastCollision=0;
  this.car={cylinders:4,turbo:true,redline:7400,sampleRPM:2525};this._starting=null;
 }
 setMix({engine=1,effects=.75}={}){this.engineVolume=clamp(finite(engine,1),0,1);this.effectsVolume=clamp(finite(effects,.75),0,1)}
 setCar(spec={}){
  const audio=spec.audio||spec,identity=String(spec.id||spec.name||'').toLowerCase();
  this.car={cylinders:clamp(finite(audio.cylinders,identity.includes('quattro')?5:4),3,8),turbo:audio.turbo!==false,
   redline:clamp(finite(audio.redline||spec.redline,7400),5500,10000),sampleRPM:clamp(finite(audio.sampleRPM,2525),1500,5000)};
  if(this.cylinderParam)this.cylinderParam.setValueAtTime(this.car.cylinders,this.ctx.currentTime);
 }
 async start(){
  if(this._starting)return this._starting;
  if(this.ready){await this.ctx.resume();return}
  this._starting=this._initialize().finally(()=>{this._starting=null});return this._starting;
 }
 async _initialize(){
  const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!AudioContext)throw new Error('Web Audio indisponible');
  const c=this.ctx||new AudioContext();this.ctx=c;
  await c.resume(); // Resume while still handling the initial user gesture.
  this.master=c.createGain();this.master.gain.value=0;
  this.engineBus=c.createGain();this.effectsBus=c.createGain();this.engineBus.connect(this.master);this.effectsBus.connect(this.master);
  const compressor=c.createDynamicsCompressor();compressor.threshold.value=-13;compressor.knee.value=15;compressor.ratio.value=4;compressor.attack.value=.006;compressor.release.value=.14;
  this.master.connect(compressor);this.analyser=c.createAnalyser();this.analyser.fftSize=512;compressor.connect(this.analyser);this.analyser.connect(c.destination);this.wave=new Float32Array(this.analyser.fftSize);
  const [engineBuffer,gearBuffer,gravelBuffer]=await Promise.all([decodeEmbeddedAudio(c,ENGINE_AUDIO.engine),decodeEmbeddedAudio(c,ENGINE_AUDIO.gear),decodeEmbeddedAudio(c,ENGINE_AUDIO.gravel)]);
  this.gearBuffer=gearBuffer;
  this.recorded=c.createBufferSource();this.recorded.buffer=seamlessLoop(c,engineBuffer,.055);this.recorded.loop=true;this.recorded.playbackRate.value=950/this.car.sampleRPM;
  this.engineGain=c.createGain();this.engineGain.gain.value=0;this.filter=c.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=1600;this.filter.Q.value=.6;
  this.recorded.connect(this.filter).connect(this.engineGain).connect(this.engineBus);this.recorded.start();
  let workletURL;
  try{
   if(!c.audioWorklet)throw new Error('AudioWorklet absent');
   workletURL=URL.createObjectURL(new Blob([COMBUSTION_WORKLET],{type:'text/javascript'}));await c.audioWorklet.addModule(workletURL);
   this.engine=new AudioWorkletNode(c,'rally-combustion-v2');this.rpmParam=this.engine.parameters.get('rpm');this.loadParam=this.engine.parameters.get('load');this.cylinderParam=this.engine.parameters.get('cylinders');this.limiterParam=this.engine.parameters.get('limiter');this.cylinderParam.value=this.car.cylinders;
  }catch{
   // The real recorded loop remains intact when an old file:// host lacks worklets.
   this.engine=c.createOscillator();this.engine.type='triangle';this.engine.frequency.value=32;this.engine.start();
  }finally{if(workletURL)URL.revokeObjectURL(workletURL)}
  const body=c.createBiquadFilter();body.type='lowpass';body.frequency.value=700;body.Q.value=.7;
  this.combustionGain=c.createGain();this.combustionGain.gain.value=.13;this.engine.connect(body).connect(this.combustionGain).connect(this.engineBus);
  const noiseBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate),noiseData=noiseBuffer.getChannelData(0);let pink=0;
  for(let i=0;i<noiseData.length;i++){pink=(pink+Math.random()*.04-.02)/1.025;noiseData[i]=pink*5}
  const noise=c.createBufferSource();noise.buffer=noiseBuffer;noise.loop=true;noise.start();
  this.windFilter=c.createBiquadFilter();this.windFilter.type='lowpass';this.windFilter.frequency.value=450;this.windGain=c.createGain();this.windGain.gain.value=0;noise.connect(this.windFilter).connect(this.windGain).connect(this.effectsBus);
  this.intakeFilter=c.createBiquadFilter();this.intakeFilter.type='bandpass';this.intakeFilter.frequency.value=800;this.intakeFilter.Q.value=1;this.intakeGain=c.createGain();this.intakeGain.gain.value=0;noise.connect(this.intakeFilter).connect(this.intakeGain).connect(this.engineBus);
  this.airFilter=c.createBiquadFilter();this.airFilter.type='highpass';this.airFilter.frequency.value=2000;this.airGain=c.createGain();this.airGain.gain.value=0;noise.connect(this.airFilter).connect(this.airGain).connect(this.engineBus);
  this.gravel=c.createBufferSource();this.gravel.buffer=seamlessLoop(c,gravelBuffer);this.gravel.loop=true;this.gravel.start();this.gravelFilter=c.createBiquadFilter();this.gravelFilter.type='lowpass';this.gravelFilter.frequency.value=2600;this.gravelGain=c.createGain();this.gravelGain.gain.value=0;this.gravel.connect(this.gravelFilter).connect(this.gravelGain).connect(this.effectsBus);
  this.tire=c.createOscillator();this.tire.type='sawtooth';this.tire.frequency.value=430;this.tireFilter=c.createBiquadFilter();this.tireFilter.type='bandpass';this.tireFilter.frequency.value=1150;this.tireFilter.Q.value=1.7;this.tireGain=c.createGain();this.tireGain.gain.value=0;this.tire.connect(this.tireFilter).connect(this.tireGain).connect(this.effectsBus);this.tire.start();
  this.turbo=c.createOscillator();this.turbo.type='sine';this.turbo.frequency.value=1300;this.turboGain=c.createGain();this.turboGain.gain.value=0;this.turbo.connect(this.turboGain).connect(this.engineBus);this.turbo.start();this.ready=true;
 }
 level(){
  if(!this.ready||this.ctx.state!=='running')return 0;
  this.analyser.getFloatTimeDomainData(this.wave);let energy=0;for(const sample of this.wave)energy+=sample*sample;return Math.sqrt(energy/this.wave.length);
 }
 smooth(param,value,time=.06){if(param&&Number.isFinite(value))param.setTargetAtTime(value,this.ctx.currentTime,time)}
 update(state,active,camera=0){
  if(!this.ready)return;
  const c=this.ctx,now=c.currentTime,rpm=clamp(finite(state.rpm,950),600,10000),speed=Math.abs(finite(state.speed)),throttle=clamp(finite(state.throttle),0,1),side=Math.abs(finite(state.side));
  const shift=finite(state.shiftRemaining)>0||now<this.shiftUntil,load=shift?throttle*.05:clamp(finite(state.engineLoad,throttle),0,1),interior=camera===2;
  this.smooth(this.engineBus.gain,this.engineVolume,.035);this.smooth(this.effectsBus.gain,this.effectsVolume,.035);
  this.smooth(this.master.gain,this.enabled&&active?clamp(this.volume,0,1)*clamp(this.duck,0,1)*.78:0,.065);
  this.smooth(this.recorded.playbackRate,clamp(rpm/this.car.sampleRPM*(this.car.cylinders/4),.25,3.8),shift?.018:.045);
  this.smooth(this.engineGain.gain,(.25+load*.25)*(shift?.30:1)*(interior?.70:1),shift?.015:.045);
  this.smooth(this.filter.frequency,(interior?1050:1900)+rpm*.36+load*2100,.06);this.smooth(this.combustionGain.gain,(.10+load*.075)*(interior?.85:1)*(shift?.45:1));
  if(this.rpmParam){this.smooth(this.rpmParam,rpm,.025);this.smooth(this.loadParam,load,.035);this.smooth(this.limiterParam,rpm>this.car.redline-110?1:0,.012)}else this.smooth(this.engine.frequency,rpm*this.car.cylinders/120,.035);
  this.smooth(this.intakeFilter.frequency,500+rpm*.18);this.smooth(this.intakeGain.gain,load*.19*(interior?.5:1));this.smooth(this.windGain.gain,Math.min(speed/65,1)**2*(interior?.035:.13),.13);
  const surface=String(state.surface||state.roadSurface||'gravel').toLowerCase(),asphalt=/asphalt|tarmac|pavement/.test(surface),snow=/snow|ice|neige/.test(surface),sand=/sand|sable/.test(surface),loose=!asphalt||state.offroad;
  const roll=Math.min(speed/34,1),slip=clamp(side/9+finite(state.wheelSlip)*.25,0,1);
  this.smooth(this.gravel.playbackRate,.65+Math.min(speed/65,1.1));this.smooth(this.gravelGain.gain,roll*(loose?(sand?.19:snow?.11:.17):.017)*(state.offroad?1.35:1)*(interior?.63:1));this.smooth(this.gravelFilter.frequency,snow?1050:sand?1800:3000,.12);
  this.smooth(this.tire.frequency,390+side*21+Math.sin(now*15)*14);this.smooth(this.tireGain.gain,asphalt?slip*(state.handbrake?.16:.08)*roll:.002*slip,.08);
  this.smooth(this.turbo.frequency,1000+rpm*.27,.13);const boost=this.car.turbo?Math.max(0,(rpm-2600)/6000)*load:0;this.smooth(this.turboGain.gain,boost*.028,.10);this.smooth(this.airGain.gain,boost*.025,.10);
  if(active&&this.lastGear!==null&&state.gear!==this.lastGear){this.shiftSound(this.lastGear,state.gear,rpm);this.shiftUntil=now+.14}
  if(active&&this.lastThrottle>.65&&throttle<.2&&rpm>3800&&this.car.turbo)this.blowoff();
  if(active&&throttle<.06&&rpm>4400&&now>this.nextPop){this.nextPop=now+.65+Math.random()*.8;this.exhaustPop(.025)}
  if(active&&state.collision>0&&this.lastCollision<=0)this.impact();this.lastCollision=state.collision||0;
  this.lastGear=state.gear;this.lastThrottle=throttle;
 }
 impact(){
  const c=this.ctx,t=c.currentTime,b=c.createBuffer(1,Math.floor(c.sampleRate*.16),c.sampleRate),d=b.getChannelData(0);
  for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*9);
  const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type='lowpass';f.frequency.value=650;g.gain.value=.32;s.connect(f).connect(g).connect(this.effectsBus);s.start(t);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect()};
 }
 shiftSound(from,to,rpm=4000){
  if(!this.ready)return;
  const c=this.ctx,source=c.createBufferSource(),gain=c.createGain();source.buffer=this.gearBuffer;gain.gain.value=.21;source.playbackRate.value=to>from?1.05:.9;source.connect(gain).connect(this.effectsBus);source.start();source.onended=()=>{source.disconnect();gain.disconnect()};
  if(to>from&&rpm>4200){this.exhaustPop(.09);if(this.car.turbo)this.blowoff(.10)}
  if(to<from){const blip=c.createOscillator(),g=c.createGain(),t=c.currentTime;blip.type='triangle';blip.frequency.setValueAtTime(rpm/30,t);blip.frequency.exponentialRampToValueAtTime(rpm/23,t+.045);blip.frequency.exponentialRampToValueAtTime(rpm/30,t+.14);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(.055,t+.018);g.gain.exponentialRampToValueAtTime(.001,t+.16);blip.connect(g).connect(this.engineBus);blip.start();blip.stop(t+.17);blip.onended=()=>{blip.disconnect();g.disconnect()}}
 }
 click(){this.shiftSound(this.lastGear||1,(this.lastGear||1)+1)}
 exhaustPop(amount=.055){
  const c=this.ctx,t=c.currentTime,osc=c.createOscillator(),gain=c.createGain();osc.type='triangle';osc.frequency.setValueAtTime(130,t);osc.frequency.exponentialRampToValueAtTime(42,t+.07);gain.gain.setValueAtTime(amount,t);gain.gain.exponentialRampToValueAtTime(.0001,t+.09);osc.connect(gain).connect(this.engineBus);osc.start();osc.stop(t+.10);osc.onended=()=>{osc.disconnect();gain.disconnect()};
 }
 blowoff(amount=.08){
  if(!this.ready||!this.car.turbo)return;
  const c=this.ctx,t=c.currentTime,b=c.createBuffer(1,Math.floor(c.sampleRate*.22),c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*7);
  const n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=b;f.type='highpass';f.frequency.value=1800;g.gain.value=amount;n.connect(f).connect(g).connect(this.engineBus);n.start(t);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect()};
 }
}
