// Original 124 BPM House arrangement. Rendered once locally; no streaming,
// downloaded track, repeated oscillator allocation or network requirement.
export class HouseMusic{
 constructor(){this.ready=false;this._starting=null;this.volume=.22;this.level=0}
 async start(context){
  if(this.ready){await this.ctx.resume();return}
  if(this._starting)return this._starting;
  this._starting=this.initialize(context).finally(()=>this._starting=null);return this._starting;
 }
 async initialize(context){
  this.ctx=context;const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)return;
  const beat=60/124,bars=8,duration=beat*4*bars,c=new Offline(2,Math.ceil(duration*24000),24000);
  const mix=c.createGain();mix.gain.value=.56;
  const compressor=c.createDynamicsCompressor();compressor.threshold.value=-13;compressor.ratio.value=3;mix.connect(compressor).connect(c.destination);
  const noise=c.createBuffer(1,24000,24000);let seed=6291;const n=noise.getChannelData(0);for(let i=0;i<n.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;n[i]=seed/2147483648-1}
  function tone(type,freq,time,length,volume,fall=freq){const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,time);o.frequency.exponentialRampToValueAtTime(fall,time+length);g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(volume,time+.006);g.gain.exponentialRampToValueAtTime(.0001,time+length);o.connect(g).connect(mix);o.start(time);o.stop(time+length+.01)}
  function hiss(time,length,level,frequency){const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=noise;f.type='highpass';f.frequency.value=frequency;g.gain.setValueAtTime(level,time);g.gain.exponentialRampToValueAtTime(.0001,time+length);s.connect(f).connect(g).connect(mix);s.start(time);s.stop(time+length)}
  const roots=[48,44,51,46];
  for(let bar=0;bar<bars;bar++){
   const root=roots[Math.floor(bar/2)],hz=m=>440*Math.pow(2,(m-69)/12);
   for(let step=0;step<8;step++){
    const t=(bar*4+step*.5)*beat+.003;
    if(step%2===0)tone('sine',148,t,.24,.73,43);
    hiss(t+.002,step%2?.12:.035,step%2?.10:.035,step%2?6500:8500);
    if(step===2||step===6){hiss(t+.002,.13,.16,1600);tone('triangle',180,t,.07,.07,110)}
    const m=root-12+(step===6?7:step===7?12:0);tone('triangle',hz(m),t+.023,beat*.43,.20);
   }
   for(const offset of [.75,1.5,2.75,3.5]){
    const t=(bar*4+offset)*beat+.006;
    for(const interval of [0,3,7,10])tone('triangle',hz(root+12+interval),t,beat*.38,.024);
   }
   if(bar>=4)for(const [index,interval] of [0,7,12,10,7,3,7,10].entries())tone('sine',hz(root+24+interval),(bar*4+index*.5)*beat+.007,.15,.014);
  }
  const buffer=await c.startRendering();this.gain=this.ctx.createGain();this.gain.gain.value=0;this.gain.connect(this.ctx.destination);
  this.source=this.ctx.createBufferSource();this.source.buffer=buffer;this.source.loop=true;this.source.connect(this.gain);this.source.start();this.ready=true;
 }
 update({enabled=true,master=1,volume=.22,mode='menu',duck=1}={}){
  if(!this.ready)return;
  this.level=enabled&&mode==='menu'?Math.max(0,Math.min(1,master))*Math.max(0,Math.min(1,volume))*.85*duck:0;
  this.gain.gain.setTargetAtTime(this.level,this.ctx.currentTime,.12);
 }
}
