import {ACTIONS,DEFAULT_BINDINGS,keyLabel,validKey} from './settings.js';
const $=id=>document.getElementById(id);
const fields=['manual','copilot','cameraSetting','quality','textureQuality','resolution','windowMode','language','volume','musicVolume','engineVolume','copilotVolume','effectsVolume'];
export class SettingsPanel{
 constructor({career,apply,onImport,onClear,voiceInfo}){
  Object.assign(this,{career,apply,onImport,onClear,voiceInfo});this.capture=null;this.isOpen=false;
  for(const id of fields)$(id).addEventListener($(id).type==='range'?'input':'change',()=>this.save(id));
  $('bindings').onclick=e=>{const b=e.target.closest('[data-action]');if(!b)return;this.cancelCapture();this.capture={action:b.dataset.action,slot:Number(b.dataset.slot),button:b};b.classList.add('listening');b.textContent='…';$('bindingStatus').textContent='Appuyez sur une touche. Échap pour annuler.'};
  document.addEventListener('keydown',e=>this.captureKey(e),true);
  $('resetBindings').onclick=()=>{this.cancelCapture();career.setSettings({bindings:DEFAULT_BINDINGS});this.renderBindings();this.apply('bindings');$('bindingStatus').textContent='Commandes par défaut rétablies.'};
  $('voiceImport').onchange=async()=>{const f=$('voiceImport').files[0];if(!f)return;try{if(f.size>18*1024*1024)throw new Error('Le pack dépasse 18 Mo.');await onImport(JSON.parse(await f.text()));this.updateVoiceStatus()}catch(e){$('voiceStatus').textContent='Import impossible : '+e.message}finally{$('voiceImport').value=''}};
  $('clearVoice').onclick=async()=>{try{await onClear();this.updateVoiceStatus()}catch(e){$('voiceStatus').textContent='Suppression impossible : '+e.message}};
  const sources=$('recordingSources');if(sources){const b=document.createElement('button');b.className='secondary';b.textContent='SOURCES AUDIO AB (GPL)';b.onclick=()=>{const url=URL.createObjectURL(new Blob([sources.textContent],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Rally-Horizon-AB-sources.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};document.querySelector('.voice-help').append(b)}
  $('closeSettings').onclick=()=>this.close();this.sync();
 }
 save(id){
  const patch={};for(const field of fields){const el=$(field);patch[field==='cameraSetting'?'camera':field]=el.type==='checkbox'?el.checked:el.type==='range'||field==='cameraSetting'?Number(el.value):el.value}
  this.career.setSettings(patch);this.updateOutputs();this.apply(id);this.updateVoiceStatus();
 }
 sync(){
  for(const id of fields){const el=$(id),value=this.career.data.settings[id==='cameraSetting'?'camera':id];if(el.type==='checkbox')el.checked=value;else el.value=String(value)}
  this.updateOutputs();this.renderBindings();this.updateVoiceStatus();
 }
 updateOutputs(){for(const el of document.querySelectorAll('#optionsForm output'))el.textContent=$(el.htmlFor).value+' %'}
 updateVoiceStatus(){const info=this.voiceInfo?.();if(info)$('voiceStatus').textContent=info;$('clearVoice').disabled=!this.career.data.settings.language||!this.voiceInfo?.(true)}
 renderBindings(){
  $('bindings').replaceChildren(...ACTIONS.map(([action,label])=>{
   const row=document.createElement('div');row.className='binding-row';const name=document.createElement('span');name.textContent=label;row.append(name);
   for(let slot=0;slot<3;slot++){const button=document.createElement('button'),code=this.career.data.settings.bindings[action][slot];button.type='button';button.dataset.action=action;button.dataset.slot=slot;button.textContent=keyLabel(code);button.setAttribute('aria-label',label+' : '+(code?keyLabel(code):'ajouter une touche'));row.append(button)}return row;
  }));
 }
 cancelCapture(){if(this.capture){this.capture=null;this.renderBindings()}}
 captureKey(e){
  if(!this.capture)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
  const {action,slot}=this.capture;if(e.code==='Escape'){this.cancelCapture();$('bindingStatus').textContent='Modification annulée.';return}
  const bindings=structuredClone(this.career.data.settings.bindings);
  if(e.code==='Delete'||e.code==='Backspace')bindings[action].splice(slot,1);
  else{
   if(!validKey(e.code)){$('bindingStatus').textContent='Cette touche ne peut pas être utilisée.';return}
   const other=ACTIONS.find(([key])=>bindings[key].includes(e.code)&&!(key===action&&bindings[key][slot]===e.code));
   if(other){$('bindingStatus').textContent=`${keyLabel(e.code)} est déjà affectée à « ${other[1]} ». Retirez cette affectation avant de la réutiliser.`;return}
   bindings[action][Math.min(slot,bindings[action].length)]=e.code;
  }
  this.career.setSettings({bindings});this.capture=null;this.renderBindings();this.apply('bindings');$('bindingStatus').textContent='Commande enregistrée.';
 }
 open(){this.cancelCapture();this.isOpen=true;$('settingsContent').append($('optionsForm'));$('settingsOverlay').classList.remove('hidden');this.sync();$('closeSettings').focus()}
 close(){this.cancelCapture();this.isOpen=false;$('panel-options').append($('optionsForm'));$('settingsOverlay').classList.add('hidden');$('pauseSettings').focus()}
}
