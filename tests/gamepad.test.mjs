import test from 'node:test';
import assert from 'node:assert/strict';
import {GamepadInput,deadzone} from '../app/gamepad.js';
const pad=(axis=0,buttons={})=>({connected:true,mapping:'standard',axes:[axis,0],buttons:Array.from({length:16},(_,i)=>({value:buttons[i]||0}))});
test('analog steering filters noise without clipping full stick travel',()=>{assert.equal(deadzone(.1),0);assert.equal(deadzone(1),1);assert.equal(deadzone(-1),-1);assert.ok(deadzone(.5)>.4);assert.equal(deadzone(NaN),0)});
test('triggers remain proportional and held gear buttons only fire once',()=>{const input=new GamepadInput();input.poll([pad(.5,{7:.7,5:1})]);assert.equal(input.input.throttle,.7);assert.ok(input.input.steer>.4);assert.ok(input.pressed.has('shiftUp'));input.poll([pad(.5,{5:1})]);assert.equal(input.pressed.has('shiftUp'),false);input.poll([pad()]);input.poll([pad(0,{5:1})]);assert.equal(input.pressed.has('shiftUp'),true)});
test('pause, disconnect and unsupported devices cannot leave a stuck throttle',()=>{const input=new GamepadInput();input.poll([pad(0,{7:1})]);input.block();input.poll([pad(0,{7:1})]);assert.equal(input.input.throttle,0);input.poll([pad()]);input.poll([pad(0,{7:1})]);assert.equal(input.input.throttle,1);input.poll([]);assert.equal(input.input.throttle,0);assert.equal(input.connected,false);input.poll([{...pad(1),mapping:''}]);assert.equal(input.connected,false)});
