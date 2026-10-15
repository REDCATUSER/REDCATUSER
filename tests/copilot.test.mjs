import test from 'node:test';
import assert from 'node:assert/strict';
import {Copilot,noteCode} from '../app/copilot.js';
import {NOTE_AUDIO} from '../src/audio/notes-data.js';
import {ENGINE_AUDIO} from '../src/audio/engine-data.js';

function readyCopilot(notes){
 const copilot=new Copilot();copilot.reset(notes);copilot.ready=true;
 copilot.ctx={currentTime:0};copilot.master={gain:{setTargetAtTime(){}}};
 const spoken=[];copilot.speak=note=>{spoken.push(note.code);return true};
 return {copilot,spoken};
}

test('French notes resolve to offline spoken clips, including accented hairpins',()=>{
 assert.equal(noteCode('Gauche 2'),'left2');
 assert.equal(noteCode('Droite à fond'),'rightFlat');
 assert.equal(noteCode('Épingle gauche'),'hairpinLeft');
 assert.equal(noteCode('Attention, route dégradée'),'rough');
 for(const code of ['left1','left2','left3','left4','left5','left6','right1','right2','right3','right4','right5','right6','finish']){
  assert.ok(NOTE_AUDIO[code],`missing recorded phrase ${code}`);
 }
 for(const asset of [...Object.values(NOTE_AUDIO).map(note=>note.url),...Object.values(ENGINE_AUDIO)]){
  const bytes=Buffer.from(asset.split(',')[1],'base64');
  assert.equal(bytes.subarray(0,4).toString(),'OggS');
  assert.ok(bytes.length>1000,'audio data must contain actual sound, not an empty placeholder');
 }
});

test('anticipates a turn at racing speed and speaks it once across repeated updates',()=>{
 const {copilot,spoken}=readyCopilot([{distance:300,code:'left2',text:'Gauche 2'},{distance:650,code:'right3',text:'Droite 3'}]);
 assert.equal(copilot.update(100,30,true),null);
 assert.equal(copilot.update(170,30,true)?.code,'left2');
 for(let d=171;d<280;d++)copilot.update(d,30,true);
 assert.deepEqual(spoken,['left2']);
 copilot.update(540,30,true);assert.deepEqual(spoken,['left2','right3']);
});

test('a checkpoint recovery skips missed corners instead of playing stale instructions',()=>{
 const {copilot,spoken}=readyCopilot([{distance:80,code:'left2'},{distance:200,code:'right1'},{distance:510,code:'right3'}]);
 copilot.update(410,30,true);
 assert.deepEqual(spoken,['right3']);
});

test('audio decoding and pauses do not consume an upcoming cue',()=>{
 const copilot=new Copilot();copilot.reset([{distance:120,code:'left2'}]);
 assert.equal(copilot.update(60,20,true)?.code,'left2');
 assert.equal(copilot.cursor,0);
 copilot.update(70,20,false);assert.equal(copilot.cursor,0);
});
