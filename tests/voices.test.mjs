import test from 'node:test';
import assert from 'node:assert/strict';
import {VOICE_PACKS,voiceText,validateVoicePack} from '../app/voices.js';
import {noteCode} from '../app/copilot.js';
test('three languages contain actual offline clips and disclose the voice source',()=>{
 for(const language of ['fr','en','de'])for(const code of Object.keys(VOICE_PACKS.fr.clips)){
  const clip=VOICE_PACKS[language].clips[code];assert.ok(clip?.text);const bytes=Buffer.from(clip.url.split(',')[1],'base64');assert.equal(bytes.subarray(0,4).toString(),'OggS');assert.ok(bytes.length>1000);
 }
 assert.equal(VOICE_PACKS.fr.kind,'neural');assert.equal(VOICE_PACKS.de.kind,'neural');assert.equal(VOICE_PACKS.en.kind,'mixed');assert.equal(VOICE_PACKS.en.clips.left2.kind,'neural');assert.equal(VOICE_PACKS.en.clips.hairpinLeft.kind,'recorded');
 assert.equal(voiceText('left2','de'),'Links 2.');assert.equal(noteCode('Haarnadel rechts'),'hairpinRight');
});
test('numeric turn audio, light countdowns and crash phrases exist in all languages',()=>{
 for(const language of ['fr','en','de']){
  const pack=VOICE_PACKS[language];
  for(const side of ['left','right'])for(let number=1;number<=6;number++){
   const clip=pack.clips[side+number];assert.ok(clip.text.includes(String(number)));assert.equal(clip.kind,'neural');
  }
  for(const code of ['count3','count2','count1','go','crash1','crash2']){
   assert.equal(noteCode(code),code);assert.equal(pack.clips[code].kind,'neural');
  }
 }
});
test('import accepts self-contained audio with author, license and all essential notes',()=>{
 const clips=Object.fromEntries([...['left','right'].flatMap(side=>Array.from({length:6},(_,i)=>side+(i+1))),'finish'].map(code=>[code,VOICE_PACKS.fr.clips[code].url]));
 const pack=validateVoicePack({language:'fr',name:'Mon copilote',author:'Pilote',license:'CC0',clips:{...clips,count3:VOICE_PACKS.fr.clips.count3.url}});assert.equal(pack.kind,'imported');assert.equal(pack.clips.left2.text,'Gauche 2.');assert.equal(pack.clips.count3.text,'Trois !');
 assert.throws(()=>validateVoicePack({...pack,clips:{...clips,left2:'https://example.org/voice.ogg'}}),/local invalide/);
 delete clips.finish;assert.throws(()=>validateVoicePack({...pack,clips}),/obligatoire/);
});
