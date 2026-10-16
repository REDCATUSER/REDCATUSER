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

function scheduledCopilot(){
 const created=[];
 const context={currentTime:0,createGain:()=>({gain:{value:1},connect(){return this},disconnect(){}}),createBufferSource(){
  const source={connect(){return this},disconnect(){},stop(){this.stopped=true},start(...args){this.startArgs=args}};created.push(source);return source;
 }};
 const copilot=new Copilot({context});copilot.ready=true;copilot.master={gain:{setValueAtTime(){}}};
 copilot.buffers=new Map(['count3','count2','count1','go','crash1','crash2'].map(code=>[code,{duration:code.startsWith('crash')?2.1:1.8,code}]));
 return{copilot,context,created};
}

test('start-light speech interrupts stale clips and never queues after GO',()=>{
 const {copilot,context,created}=scheduledCopilot();
 assert.equal(copilot.countdown(3),true);assert.equal(copilot.countdown(3),false);assert.equal(created.length,1);
 assert.deepEqual(created[0].startArgs,[.008,0,.87]);
 for(const number of [2,1,0]){
  context.currentTime++;
  assert.equal(copilot.countdown(number),true);assert.equal(copilot.sources.size,1);
  assert.equal(created.at(-2).stopped,true);assert.equal(created.at(-1).buffer.code,number?'count'+number:'go');
  assert.equal(created.at(-1).startArgs[0],context.currentTime+.008);
 }
 assert.equal(created.at(-1).startArgs[2],1.1);
 copilot.reset([]);assert.equal(copilot.countdown(3),true);
});

test('a not-yet-decoded countdown is retriable and crash dialogue is rate limited',()=>{
 const {copilot,context,created}=scheduledCopilot();
 copilot.ready=false;assert.equal(copilot.countdown(3),false);assert.equal(copilot.lastCountdown,null);
 copilot.ready=true;assert.equal(copilot.countdown(3),true);
 assert.equal(copilot.crash(.1),false);assert.equal(copilot.crash(.5),true);assert.equal(created.at(-1).buffer.code,'crash1');
 context.currentTime=5;assert.equal(copilot.crash(1),false);
 assert.equal(copilot.crash(1,{force:true}),true);assert.equal(created.at(-1).buffer.code,'crash2');assert.equal(copilot.sources.size,1);
 context.currentTime=18;assert.equal(copilot.crash(.5),true);assert.equal(created.at(-1).buffer.code,'crash1');
});
