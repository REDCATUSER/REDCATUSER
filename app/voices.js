import {NOTE_AUDIO} from '../src/audio/notes-data.js';
import {INTERNATIONAL_AUDIO} from '../src/audio/international-data.js';
export const VOICE_PACKS={
 fr:{name:'Français · radio',kind:'synthetic',author:'Rally Horizon / eSpeak NG',clips:NOTE_AUDIO},
 en:{name:'English · AB',kind:'mixed',author:'Andrei Bondor / Trigger Rally',clips:INTERNATIONAL_AUDIO.en},
 de:{name:'Deutsch · Funk',kind:'synthetic',author:'Rally Horizon / eSpeak NG',clips:INTERNATIONAL_AUDIO.de}
};
export function voiceText(code,language='fr'){return VOICE_PACKS[language]?.clips[code]?.text||NOTE_AUDIO[code]?.text||code}
export function validateVoicePack(input){
 if(!input||typeof input!=='object'||!['fr','en','de'].includes(input.language))throw new Error('Langue attendue : fr, en ou de.');
 for(const field of ['name','author','license'])if(typeof input[field]!=='string'||!input[field].trim()||input[field].length>180)throw new Error('Champ manquant ou invalide : '+field);
 if(!input.clips||typeof input.clips!=='object'||Array.isArray(input.clips))throw new Error('Le champ clips doit contenir les annonces audio.');
 const clips={};let bytes=0;
 for(const [code,url] of Object.entries(input.clips)){
  if(!Object.hasOwn(NOTE_AUDIO,code))throw new Error('Note inconnue : '+code);
  if(typeof url!=='string'||url.length>1500000||!/^data:audio\/(ogg|wav|x-wav|mpeg|mp4|webm);base64,[A-Za-z0-9+/]+={0,2}$/.test(url))throw new Error('Audio local invalide : '+code);
  bytes+=url.length;if(bytes>18*1024*1024)throw new Error('Le pack dépasse 18 Mo.');
  clips[code]={url,text:voiceText(code,input.language),kind:'imported'};
 }
 for(const code of [...['left','right'].flatMap(side=>Array.from({length:6},(_,i)=>side+(i+1))),'finish'])if(!clips[code])throw new Error('Annonce obligatoire manquante : '+code);
 return{version:1,language:input.language,name:input.name.trim(),author:input.author.trim(),license:input.license.trim(),kind:'imported',clips};
}

// Audio packs belong in IndexedDB, not the small localStorage career save.
async function database(){
 return new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(new Error('Stockage des packs vocaux indisponible.'));return}const r=indexedDB.open('rally-horizon-voices',1);r.onupgradeneeded=()=>r.result.createObjectStore('packs',{keyPath:'language'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
}
async function operation(mode,callback){
 const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('packs',mode),request=callback(tx.objectStore('packs'));let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Stockage interrompu.'))})}finally{db.close()}
}
export const loadVoicePacks=()=>operation('readonly',s=>s.getAll());
export const saveVoicePack=pack=>operation('readwrite',s=>s.put(pack));
export const deleteVoicePack=language=>operation('readwrite',s=>s.delete(language));
