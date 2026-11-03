import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, recordTurn, undoTurn } from '../src/engine.js';
import { PARTY_MODES, getPartyStatus } from '../src/party.js';

const dart = (number, multiplier = 1) => ({ number, multiplier });
const miss = dart(0);
const game = (mode, options = {}) => createGame({ mode, players: mode === 'teamhammer' ? ['A', 'B', 'C', 'D'] : ['A', 'B'], ...options });

test('party modes enforce player limits', () => {
  for (const mode of PARTY_MODES) {
    assert.throws(() => game(mode.id, { players: Array.from({ length: mode.maxPlayers + 1 }, (_, i) => `P${i}`) }));
    if (mode.minPlayers > 1) assert.throws(() => game(mode.id, { players: ['A'] }));
  }
});

test('Hammer weights by dart position including misses', () => {
  const next = recordTurn(game('hammer'), [miss, dart(20), dart(20, 3)]);
  assert.equal(next.players[0].score, 220);
  assert.equal(next.players[0].hammerMarks, 4);
});

test('Hammer miss penalty is reflected in score and history', () => {
  const next = recordTurn(game('hammer'), [miss, miss, miss]);
  assert.equal(next.players[0].score, -60);
  assert.equal(next.history[0].scored, -60);
  assert.equal(next.history[0].remaining, -60);
});

test('Hammer master needs triples, or inner bull in bull rounds', () => {
  let initial = game('hammer', { hammerMaster: true });
  assert.equal(recordTurn(initial, [dart(20), dart(20, 2), dart(20, 3)]).players[0].score, 180);
  initial.round = 7; initial.partyTarget = 25;
  assert.equal(recordTurn(initial, [dart(25), dart(25, 2), miss]).players[0].score, 100);
});

test('Hammer final round uses 1, 3, 5 weighting', () => {
  const initial = game('hammer'); initial.round = 9; initial.partyTarget = 20;
  const next = recordTurn(initial, [dart(20), dart(20), dart(20)]);
  assert.equal(next.players[0].score, 180);
});

test('Hammer tie round random target is stable across previews and undo', () => {
  const initial = game('hammer'); initial.round = 9; initial.partyTarget = 20; initial.activePlayer = 1;
  initial.players[0].score = -60;
  const a = recordTurn(initial, [miss, miss, miss]);
  const b = recordTurn(initial, [miss, miss, miss]);
  assert.equal(a.round, 10); assert.equal(a.status, 'playing'); assert.equal(a.tieBreak, true);
  assert.equal(a.partyTarget, b.partyTarget);
  assert.deepEqual(undoTurn(a), initial);
});

test('Hammer tied final score is resolved by MPR after tie break', () => {
  const initial = game('hammer'); initial.round = 10; initial.rounds = 10; initial.partyTarget = 20; initial.activePlayer = 1;
  initial.players[0].score = -60;
  initial.players[0].hammerMarks = 4; initial.players[0].darts = 3;
  const next = recordTurn(initial, [miss, miss, miss]);
  assert.equal(next.status, 'finished'); assert.deepEqual(next.winners, [0]);
});

test('Team Hammer alternates teams and combines partner scores', () => {
  let next = game('teamhammer');
  next = recordTurn(next, [dart(20), miss, miss]);
  next = recordTurn(next, [dart(20, 2), miss, miss]);
  next = recordTurn(next, [dart(20, 3), miss, miss]);
  assert.deepEqual(next.teamScores, [80, 40]);
  assert.deepEqual(next.players.map(p => p.team), [0, 1, 0, 1]);
});

test('Count Up gives every player the configured number of rounds and shares ties', () => {
  let next = game('countup', { rounds: 1 });
  next = recordTurn(next, [dart(20)]); assert.equal(next.status, 'playing');
  next = recordTurn(next, [dart(20)]); assert.equal(next.status, 'finished');
  assert.deepEqual(next.winners, [0, 1]);
});

test('Count Up respects full bull mode', () => {
  assert.equal(recordTurn(game('countup', { bullMode: 'full' }), [dart(25), dart(25, 2)]).players[0].score, 100);
});

test('Gotcha bombs every rival whose score matches each dart', () => {
  const initial = game('gotcha', { players: ['A', 'B', 'C'] });
  initial.players[1].score = 20; initial.players[2].score = 40;
  const next = recordTurn(initial, [dart(20), dart(20)]);
  assert.deepEqual(next.players.map(p => p.score), [40, 0, 0]);
  assert.deepEqual(undoTurn(next), initial);
});

test('Gotcha overshoot deducts excess from turn-start and reverses this turn’s bombs', () => {
  const initial = game('gotcha'); initial.players[0].score = 260; initial.players[1].score = 280;
  const next = recordTurn(initial, [dart(20), dart(20, 2)]);
  assert.deepEqual(next.players.map(p => p.score), [241, 280]);
  assert.equal(next.history[0].bust, true); assert.equal(next.history[0].scored, -19);
});

test('Gotcha master out rejects a single finish and accepts a triple', () => {
  let initial = game('gotcha', { masterOut: true }); initial.players[0].score = 281;
  let next = recordTurn(initial, [dart(20)]);
  assert.equal(next.status, 'playing'); assert.equal(next.players[0].score, 281);
  initial = game('gotcha', { masterOut: true }); initial.players[0].score = 241;
  next = recordTurn(initial, [dart(20, 3)]);
  assert.equal(next.status, 'finished'); assert.equal(next.winner, 0);
});

test('Bermuda ignores off-target darts and halves missed rounds downward', () => {
  const initial = game('bermuda'); initial.players[0].score = 101;
  const next = recordTurn(initial, [dart(20), miss, miss]);
  assert.equal(next.players[0].score, 50); assert.equal(next.history[0].scored, -51);
  assert.equal(recordTurn(game('bermuda'), [dart(12, 3)]).players[0].score, 36);
});

test('Bermuda double, triple and inner bull targets only accept matching segments', () => {
  const initial = game('bermuda'); initial.round = 4; initial.partyTarget = 'double';
  assert.equal(recordTurn(initial, [dart(20), dart(18, 2), dart(20, 3)]).players[0].score, 36);
  initial.round = 13; initial.partyTarget = 'doubleBull';
  assert.equal(recordTurn(initial, [dart(25), dart(25, 2)]).players[0].score, 50);
});

test('Bermuda ends after thirteen complete rounds', () => {
  const initial = game('bermuda'); initial.round = 13; initial.partyTarget = 'doubleBull'; initial.activePlayer = 1;
  initial.players[0].score = 70;
  const next = recordTurn(initial, [dart(25, 2)]);
  assert.equal(next.status, 'finished'); assert.equal(next.winner, 0);
});

test('Tic Tac Darts uses eight unique numbered cells and center bull', () => {
  const initial = game('tictac');
  assert.equal(initial.ticTac.length, 9); assert.equal(new Set(initial.ticTac.map(c => c.number)).size, 9);
  assert.equal(initial.ticTac[4].number, 25);
});

test('Tic Tac Darts requires four marks and blocks scoring on owned cells', () => {
  const initial = game('tictac'); const target = initial.ticTac[0].number;
  let next = recordTurn(initial, [dart(target, 3)]);
  assert.equal(next.ticTac[0].owner, null);
  next = recordTurn(next, [miss]);
  next = recordTurn(next, [dart(target)]); assert.equal(next.ticTac[0].owner, 0);
  next = recordTurn(next, [dart(target, 3)]); assert.equal(next.players[1].score, 0);
});

test('Tic Tac Darts ends immediately on a line and ignores remaining darts', () => {
  const initial = game('tictac'); initial.ticTac[0].owner = 0; initial.ticTac[1].owner = 0;
  const target = initial.ticTac[2].number; initial.ticTac[2].marks[0] = 3;
  const next = recordTurn(initial, [dart(target), dart(20, 3)]);
  assert.equal(next.winner, 0); assert.equal(next.history[0].darts.length, 1);
});

test('Tic Tac Darts detects cats before every square is taken', () => {
  const initial = game('tictac');
  // X O X / X O O / O X [unclaimed]; neither player can complete a line.
  [0,1,0,0,1,1,1,null,null].forEach((owner, i) => { initial.ticTac[i].owner = owner; });
  initial.ticTac[7].marks[0] = 3; initial.players[1].score = 200;
  const next = recordTurn(initial, [dart(initial.ticTac[7].number)]);
  assert.equal(next.status, 'finished'); assert.equal(next.winner, 1);
  assert.equal(next.ticTac[8].owner, null);
});

test('Shark Tank ignores bulls and bites opponents twice for a doubled score', () => {
  let next = game('shark');
  next = recordTurn(next, [dart(20), dart(20), dart(25, 2)]);
  next = recordTurn(next, [dart(20)]);
  assert.deepEqual(next.players.map(p => p.bites), [0, 2]);
  assert.deepEqual(next.players.map(p => p.score), [40, 20]);
});

test('Shark tied leaders bite everyone once', () => {
  let next = game('shark', { players: ['A', 'B', 'C'] });
  next = recordTurn(next, [dart(20)]); next = recordTurn(next, [dart(20)]); next = recordTurn(next, [miss]);
  assert.deepEqual(next.players.map(p => p.bites), [1, 1, 1]);
});

test('Shark eliminates at six bites and skips eliminated players', () => {
  let next = game('shark', { players: ['A', 'B', 'C'] }); next.players[1].bites = 4;
  next = recordTurn(next, [dart(20, 3)]); next = recordTurn(next, [miss]); next = recordTurn(next, [dart(20, 2)]);
  assert.equal(next.players[1].eliminated, true); assert.equal(next.activePlayer, 0);
  next = recordTurn(next, [dart(20)]); assert.equal(next.activePlayer, 2);
  next = recordTurn(next, [dart(20)]); assert.equal(next.round, 3); assert.equal(next.activePlayer, 0);
});

test('Shark declares the sole survivor and safely resolves simultaneous elimination', () => {
  let initial = game('shark'); initial.players[1].bites = 4;
  let next = recordTurn(initial, [dart(20)]); next = recordTurn(next, [miss]);
  assert.equal(next.winner, 0);
  initial = game('shark'); initial.players.forEach(p => { p.bites = 5; });
  next = recordTurn(initial, [miss]); next = recordTurn(next, [miss]);
  assert.equal(next.status, 'finished'); assert.deepEqual(next.winners, [0, 1]);
});

test('every party mode provides display status without mutating state', () => {
  for (const mode of PARTY_MODES) {
    const initial = game(mode.id); const copy = structuredClone(initial);
    assert.ok(getPartyStatus(initial).value); assert.deepEqual(initial, copy);
  }
});
