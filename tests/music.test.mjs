import test from 'node:test';
import assert from 'node:assert/strict';
import {HouseMusic} from '../app/music.js';
test('music is audible in menus and muted throughout the driving session',()=>{
 const m=new HouseMusic();m.ready=true;m.ctx={currentTime:2};const values=[];m.gain={gain:{setTargetAtTime:v=>values.push(v)}};
 m.update({mode:'menu',volume:1});assert.ok(m.level>0);
 for(const mode of ['countdown','race','paused','finished','wrecked']){m.update({mode,volume:1});assert.equal(m.level,0);assert.equal(values.at(-1),0)}
 m.update({mode:'menu',enabled:false});assert.equal(m.level,0);
});
