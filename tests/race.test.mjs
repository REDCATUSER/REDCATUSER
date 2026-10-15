import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRaceProgress} from '../app/race.js';

const gates = [0, 100, 200, 300].map(x => ({point: {x, z: 0}, radius: 10}));

test('a sprint starts after gate zero and requires all gates in order', () => {
  const race = createRaceProgress(gates);
  assert.equal(race.nextGate, 1);
  assert.equal(race.update(0, 0, 0), null);
  assert.equal(race.update(300, 0, 2), null, 'reaching the finish early cannot end the sprint');
  assert.equal(race.update(200, 0, 3), null, 'an out-of-order checkpoint cannot be accepted');
  const first = race.update(100, 0, 10);
  assert.equal(first.index, 1);
  assert.equal(first.checkpoint, true);
  assert.equal(race.completed, 1);
  assert.equal(race.lastValidIndex, 1);
  assert.equal(race.finished, false);
});

test('sector and cumulative times are recorded once and finish does not loop', () => {
  const race = createRaceProgress(gates);
  assert.deepEqual(race.update(100, 0, 12), {index: 1, finished: false, split: 12, total: 12, checkpoint: true});
  assert.equal(race.update(100, 0, 15), null);
  assert.equal(race.update(200, 0, 31).split, 19);
  assert.deepEqual(race.update(300, 0, 54), {index: 3, finished: true, split: 23, total: 54, checkpoint: false});
  assert.deepEqual(race.splits, [12, 31, 54]);
  assert.equal(race.nextGate, gates.length);
  assert.equal(race.completed, gates.length - 1);
  assert.equal(race.update(0, 0, 60), null);
  assert.equal(race.update(300, 0, 61), null);
  assert.deepEqual(race.splits, [12, 31, 54]);
});

test('swept movement catches a gate missed between rendering frames', () => {
  const race = createRaceProgress(gates);
  race.update(70, 0, 1);
  const crossed = race.update(130, 0, 2);
  assert.equal(crossed.index, 1);
  assert.equal(race.completed, 1);
});

test('a sweep accepts at most one gate and a distant teleport cannot unlock the course', () => {
  const nearby = createRaceProgress([0, 40, 70, 95].map(x => ({x, z: 0})), {radius: 4});
  nearby.update(0, 0, 0);
  nearby.update(98, 0, 2);
  assert.equal(nearby.completed, 1);
  assert.equal(nearby.finished, false);
  const race = createRaceProgress(gates);
  race.update(0, 0, 0);
  assert.equal(race.update(300, 0, 5), null);
  assert.equal(race.completed, 0);
});

test('recovery resets the swept segment without discarding checkpoint progress', () => {
  const race = createRaceProgress(gates);
  race.update(100, 0, 5);
  race.resetPosition(240, 0);
  assert.equal(race.update(245, 0, 6), null, 'recovery line must not pass checkpoint two');
  assert.equal(race.nextGate, 2);
  assert.equal(race.lastValidIndex, 1);
  assert.deepEqual(race.splits, [5]);
  assert.equal(race.update(200, 0, 9).index, 2);
});

test('gate width, immutable input, and resetting a completed race are supported', () => {
  const input = Object.freeze([Object.freeze({point: Object.freeze({x: 0, z: 0})}), Object.freeze({point: Object.freeze({x: 100, z: 0}), radius: 4})]);
  const race = createRaceProgress(input, {radius: 10});
  assert.equal(race.update(100, 5, 2), null);
  assert.equal(race.update(100, 3, 3).finished, true);
  const copy = race.splits;
  copy.push(99);
  assert.deepEqual(race.splits, [3]);
  race.reset();
  assert.equal(race.nextGate, 1);
  assert.equal(race.completed, 0);
  assert.equal(race.finished, false);
  assert.equal(race.lastValidIndex, 0);
  assert.deepEqual(race.splits, []);
});

test('invalid positions and backwards timers do not corrupt a race', () => {
  const race = createRaceProgress(gates);
  assert.equal(race.update(NaN, 0, 1), null);
  assert.equal(race.update(100, 0, -1), null);
  race.update(100, 0, 10);
  assert.equal(race.update(200, 0, 9), null);
  assert.equal(race.nextGate, 2);
  assert.equal(race.update(200, 0, 11).split, 1);
});
