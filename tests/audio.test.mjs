import test from 'node:test';
import assert from 'node:assert/strict';
import {RallyAudio} from '../app/audio.js';

test('neutral and reverse selection do not make a forward downshift blip or turbo bang',()=>{
 const oscillators=[],selections=[],pops=[],boosts=[];
 const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({gain:parameter(),frequency:parameter(),playbackRate:parameter(),connect(){return this},disconnect(){},start(){},stop(){}});
 const audio=new RallyAudio();audio.ready=true;audio.gearBuffer={};audio.engineBus=node();audio.effectsBus=node();audio.car.turbo=true;
 audio.ctx={currentTime:0,createGain:node,createBufferSource(){const source=node();selections.push(source);return source},createOscillator(){const oscillator=node();oscillators.push(oscillator);return oscillator}};
 audio.exhaustPop=level=>pops.push(level);audio.blowoff=level=>boosts.push(level);
 for(const [from,to] of [[1,0],[0,-1],[-1,0],[0,1]])audio.shiftSound(from,to,6500);
 assert.equal(selections.length,4,'all gearbox selections retain an audible mechanical effect');
 assert.equal(oscillators.length,0);assert.equal(pops.length,0);assert.equal(boosts.length,0);
 audio.shiftSound(2,1,6500);assert.equal(oscillators.length,1,'a real forward downshift still blips');
 audio.shiftSound(1,2,6500);assert.equal(pops.length,1);assert.equal(boosts.length,1,'a loaded turbo upshift still releases boost');
});
