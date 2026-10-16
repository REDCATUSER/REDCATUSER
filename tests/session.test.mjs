import test from 'node:test';
import assert from 'node:assert/strict';
import {StageSession} from '../app/session.js';

test('Hardcore requires a completed blind reconnaissance before the timed run', () => {
  const session = new StageSession();
  session.begin('alps-1', 'hardcore');
  assert.equal(session.reconnaissance, true);
  assert.equal(session.startTimed(), false);
  session.completeRecon();
  assert.equal(session.repeatRecon(), true);
  assert.equal(session.startTimed(), false);
  session.completeRecon();
  assert.equal(session.startTimed(), true);
  assert.equal(session.reconnaissance, false);
  assert.equal(session.repeatRecon(), false);
});

test('a different stage or a resumed Hardcore attempt requires reconnaissance again', () => {
  const session = new StageSession();
  session.begin('alps-1', 'hardcore');
  session.completeRecon(); session.startTimed();
  session.begin('alps-2', 'hardcore');
  assert.equal(session.reconnaissance, true);
  assert.equal(session.reconComplete, false);
  session.begin('alps-1', 'hardcore');
  assert.equal(session.startTimed(), false);
  session.begin('alps-1', 'easy');
  assert.equal(session.reconnaissance, false);
});
