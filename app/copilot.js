import {NOTE_AUDIO} from '../src/audio/notes-data.js';
import {decodeEmbeddedAudio} from './audio.js';
import {VOICE_PACKS,voiceText} from './voices.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function noteCode(note){
 const code=typeof note==='object'?note.code:note;
 if(Object.hasOwn(NOTE_AUDIO,code))return code;
 const text=String(typeof note==='object'?note.text:note).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const left=/gauche|\bleft|\blinks/.test(text),right=/droite|\bright|\brechts/.test(text);
 if(left||right){
  const side=left?'left':'right';
  if(/epingle|hairpin|haarnadel/.test(text))return left?'hairpinLeft':'hairpinRight';
  if(/fond|flat|voll/.test(text))return side+'Flat';
  const number=text.match(/[1-6]/);return side+(number?number[0]:'3');
 }
 if(/arrivee|finish|ziel/.test(text))return 'finish';
 if(/saut|jump/.test(text))return 'jump';
 if(/ciel|crest/.test(text))return 'crest';
 if(/neige|snow|gliss/.test(text))return 'snow';
 if(/sable|sand/.test(text))return 'sand';
 if(/degrade|rough/.test(text))return 'rough';
 if(/frein|brak/.test(text))return 'brake';
 if(/ne coupe|dontcut/.test(text))return 'dontCut';
 if(/tout droit|straight/.test(text))return 'straight';
 if(/depart|partez|start/.test(text))return 'start';
 if(/200|deux cents/.test(text))return '200';
 if(/300|trois cents/.test(text))return '300';
 if(/100|cent metres/.test(text))return '100';
 return 'caution';
}

/**
 * Offline multilingual copilot. Notes use {distance (metres), text, code}.
 * update returns the visual note; audio is anticipated by vehicle speed.
 * start(context?) can share RallyAudio.ctx, or create its own Web Audio context.
 */
export class Copilot{
 constructor(options={}){
  this.ctx=options.context||options.ctx||(options.createGain?options:null);
  this.enabled=true;this.volume=.86;this.ready=false;this.buffers=new Map();
  this.notes=[];this.cursor=0;this.current=null;this.text='';this.lastDistance=0;
  this.sources=new Set();this.nextVoiceTime=0;this._starting=null;this._wasActive=false;
  this.language='fr';this.packs={...VOICE_PACKS};this._voiceRevision=0;
  this.lastCountdown=null;this.lastCrashTime=-Infinity;this.crashCount=0;
 }
 get voiceReady(){return this.ready}
 get speaking(){return Boolean(this.enabled&&this.volume>.001&&this.ctx&&this.sources.size&&this.ctx.currentTime<this.nextVoiceTime)}
 async start(context){
  if(this._starting)return this._starting;
  if(this.ready){await this.ctx.resume();return}
  if(context&&!this.ctx)this.ctx=context.ctx||context;
  this._starting=this._initialize().finally(()=>{this._starting=null});return this._starting;
 }
 unlock(context){return this.start(context)}
 async _initialize(){
  const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(!this.ctx&&!AudioContext)throw new Error('Web Audio indisponible pour le copilote');
  const c=this.ctx||(this.ctx=new AudioContext());await c.resume();
  if(!this.master){this.master=c.createGain();this.master.gain.value=clamp(this.volume,0,1);
   const compressor=c.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=3;
   this.master.connect(compressor);compressor.connect(c.destination);}
  await this.loadLanguage();this.nextVoiceTime=c.currentTime;
 }
 async loadLanguage(){
  const revision=++this._voiceRevision;this.ready=false;this.stop();
  const clips={...VOICE_PACKS[this.language].clips,...this.packs[this.language].clips};
  const entries=await Promise.all(Object.entries(clips).map(async([code,asset])=>[code,await decodeEmbeddedAudio(this.ctx,asset.url)]));
  if(revision!==this._voiceRevision)return;
  this.buffers=new Map(entries);this.ready=true;
 }
 async setLanguage(language){
  if(!VOICE_PACKS[language])return;if(this.language===language&&this.ready)return;
  this.language=language;this.localize();if(this.ctx&&this.master)await this.loadLanguage();
 }
 async setPack(pack){this.packs[pack.language]=pack;if(pack.language===this.language&&this.ctx&&this.master)await this.loadLanguage()}
 async clearPack(language){this.packs[language]=VOICE_PACKS[language];if(language===this.language&&this.ctx&&this.master)await this.loadLanguage()}
 localize(){for(const note of this.notes)note.text=voiceText(note.code,this.language);if(this.current){this.current.text=voiceText(this.current.code,this.language);this.text=this.current.text}}
 get voiceInfo(){return this.packs[this.language]}
 reset(notes=[]){
  this.stop();
  this.notes=notes.filter(note=>Number.isFinite(note.distance)).map(note=>({
   ...note,distance:Math.max(0,note.distance),code:noteCode(note),text:voiceText(noteCode(note),this.language)
  })).sort((a,b)=>a.distance-b.distance);
  this.cursor=0;this.current=null;this.text='';this.lastDistance=0;
  this.lastCountdown=null;this.lastCrashTime=-Infinity;this.crashCount=0;
 }
 update(distance,speed,active=true){
  if(!Number.isFinite(distance))return this.current;
  if(!active){if(this.sources.size)this.stop();this._wasActive=false;return this.current}
  this._wasActive=true;
  if(!this.enabled&&this.sources.size)this.stop();
  if(this.ready)this.master.gain.setTargetAtTime(this.enabled?clamp(this.volume,0,1):0,this.ctx.currentTime,.035);
  const anticipation=clamp(Math.abs(Number.isFinite(speed)?speed:0)*3.5+35,55,180);
  // A recovery or checkpoint teleport must not speak a queue of missed turns.
  while(this.cursor<this.notes.length&&this.notes[this.cursor].distance<distance-35)this.cursor++;
  if(this.current&&distance>this.current.distance+38){this.current=null;this.text=''}
  const next=this.notes[this.cursor];
  if(next&&next.distance-distance<=anticipation){
   this.current=next;this.text=next.text;
   // Wait for offline clips to decode before consuming the first voice cue.
   if(this.ready){
    this.speak(next);this.cursor++;
   }
  }
  this.lastDistance=distance;return this.current;
 }
 // Countdown clips replace one another on the actual start-light transition.
 // A late decode or an unusually long imported clip cannot queue "three" after GO.
 countdown(number){
  if(!Number.isInteger(number)||number<0||number>3||number===this.lastCountdown)return false;
  const spoken=this.speak(number===0?'go':'count'+number,{interrupt:true,maxDuration:number===0?1.1:.87});
  if(spoken)this.lastCountdown=number;
  return spoken;
 }
 crash(severity=1,{force=false}={}){
  if(!this.ready||!this.enabled||!Number.isFinite(severity)||severity<.13||(!force&&this.ctx.currentTime-this.lastCrashTime<12))return false;
  const spoken=this.speak('crash'+(this.crashCount%2+1),{interrupt:true});
  if(spoken){this.lastCrashTime=this.ctx.currentTime;this.crashCount++}
  return spoken;
 }
 speak(note,{interrupt=false,maxDuration=Infinity}={}){
  if(!this.ready||!this.enabled)return false;
  const code=noteCode(note),buffer=this.buffers.get(code);if(!buffer)return false;
  if(interrupt)this.stop();
  const c=this.ctx,now=c.currentTime;
  this.master.gain.setValueAtTime(clamp(this.volume,0,1),now);
  // A newer close turn supersedes an unstarted queued cue. Never overlap voices.
  for(const queued of [...this.sources]){
   if(queued.at>now+.06){try{queued.source.stop()}catch{}this.sources.delete(queued)}
  }
  let playingUntil=now;
  for(const queued of this.sources)playingUntil=Math.max(playingUntil,queued.until);
  const at=interrupt?now+.008:Math.max(now+.008,playingUntil+.065),source=c.createBufferSource();source.buffer=buffer;
  const gain=c.createGain();gain.gain.value=1;source.connect(gain).connect(this.master);
  const duration=Math.min(buffer.duration,maxDuration),entry={source,gain,at,until:at+duration};this.sources.add(entry);this.nextVoiceTime=entry.until;
  source.onended=()=>{source.disconnect();gain.disconnect();this.sources.delete(entry)};
  source.start(at,0,duration);return true;
 }
 stop(){
  for(const entry of this.sources){try{entry.source.stop()}catch{}entry.source.disconnect();entry.gain.disconnect()}
  this.sources.clear();this.nextVoiceTime=this.ctx?this.ctx.currentTime:0;
 }
}
