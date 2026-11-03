import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, recordTurn, undoTurn, getCheckout, dartValue, dartLabel, MODES, isX01, getTargets, getStatus } from '../src/engine.js';

const d = (number, multiplier = 1) => ({ number, multiplier });
const game = (mode = '501', options = {}) => createGame({ mode, players: ['Alex', 'Sam'], ...options });

test('all Galaxy modes initialize with their supported player counts', () => {
  assert.equal(MODES.some(mode => mode.id === 'clock'), false);
  for (const mode of MODES) {
    assert.equal(game(mode.id, { players: Array.from({ length: mode.minPlayers }, (_, i) => `P${i}`) }).mode, mode.id);
  }
  assert.equal(game('301').players[0].score, 301);
  assert.equal(game('701').players[0].score, 701);
  assert.equal(game('501', { players: Array.from({ length: 8 }, (_, i) => `Player ${i}`) }).players.length, 8);
  assert.equal(game('501', { players: [' Alex '] }).players[0].name, 'Alex');
  for (const players of [[], Array(9).fill('A'), [' '], ['a'.repeat(25)], [7]]) {
    assert.throws(() => game('501', { players }));
  }
  assert.throws(() => game('invalid'));
  assert.throws(() => game('countup', { rounds: 0 }));
  assert.throws(() => game('countup', { rounds: 1.5 }));
});

test('X01 rotates players, records history, and leaves the input untouched', () => {
  const original = game();
  const next = recordTurn(original, [d(20, 3), d(20, 3), d(20, 3)]);
  assert.equal(next.players[0].score, 321);
  assert.equal(next.players[0].totalScored, 180);
  assert.equal(next.players[0].best, 180);
  assert.equal(next.activePlayer, 1);
  assert.equal(next.history[0].scored, 180);
  assert.equal(original.players[0].score, 501);
  assert.equal(original.history.length, 0);
  const roundTwo = recordTurn(next, [d(0), d(0), d(0)]);
  assert.equal(roundTwo.round, 2);
  assert.equal(roundTwo.activePlayer, 0);
});

test('double-out bust restores whole turn for overshoot, leaving one, and non-double zero', () => {
  for (const [start, darts] of [
    [60, [d(20), d(20, 3)]],
    [41, [d(20), d(20)]],
    [60, [d(20, 3)]],
  ]) {
    const original = game();
    original.players[0].score = start;
    const next = recordTurn(original, darts);
    assert.equal(next.players[0].score, start);
    assert.equal(next.history[0].bust, true);
    assert.equal(next.history[0].scored, 0);
    assert.equal(next.players[0].totalScored, 0);
    assert.equal(next.players[0].darts, 3);
    assert.equal(next.activePlayer, 1);
  }
});

test('double checkout wins immediately and ignores later darts', () => {
  const original = game();
  original.players[0].score = 100;
  const next = recordTurn(original, [d(20, 3), d(20, 2), d(20, 3)]);
  assert.equal(next.status, 'finished');
  assert.equal(next.winner, 0);
  assert.deepEqual(next.winners, [0]);
  assert.equal(next.players[0].score, 0);
  assert.equal(next.players[0].darts, 2);
  assert.equal(next.history[0].total, 100);
  assert.throws(() => recordTurn(next, [d(1)]));
});

test('bull is a double checkout; straight-out permits one and a single finish', () => {
  const original = game();
  original.players[0].score = 50;
  assert.equal(recordTurn(original, [d(25, 2)]).status, 'finished');
  const straight = game('301', { players: ['Alex'], doubleOut: false });
  straight.players[0].score = 21;
  const one = recordTurn(straight, [d(20)]);
  assert.equal(one.players[0].score, 1);
  assert.equal(recordTurn(one, [d(1)]).status, 'finished');
});

test('cricket closes targets and scores only against open opponents', () => {
  let current = game('cricket');
  current = recordTurn(current, [d(20, 3), d(20, 2), d(14, 3)]);
  assert.equal(current.players[0].marks[20], 3);
  assert.equal(current.players[0].score, 40);
  current = recordTurn(current, [d(20, 3), d(20, 3)]);
  assert.equal(current.players[1].score, 0);
  current = recordTurn(current, [d(20, 3)]);
  assert.equal(current.players[0].score, 40);
});

test('cricket excess marks in the closing dart score and bull is worth 25 per mark', () => {
  const current = game('cricket');
  current.players[0].marks[20] = 2;
  current.players[0].marks[25] = 2;
  const next = recordTurn(current, [d(20, 3), d(25, 2)]);
  assert.equal(next.players[0].score, 65);
});

test('cricket can score against any open player in a group of eight', () => {
  const current = game('cricket', { players: Array.from({ length: 8 }, (_, i) => `P${i}`) });
  current.players.forEach(player => { player.marks[20] = 3; });
  current.players[7].marks[20] = 2;
  assert.equal(recordTurn(current, [d(20, 3)]).players[0].score, 60);
});

test('cricket requires all targets closed and points at least tied', () => {
  const original = game('cricket');
  for (const n of [15, 16, 17, 18, 19, 20, 25]) original.players[0].marks[n] = 3;
  original.players[0].marks[25] = 2;
  original.players[1].score = 25;
  const behind = recordTurn(original, [d(25)]);
  assert.equal(behind.status, 'playing');
  const tied = recordTurn(original, [d(25, 2)]);
  assert.equal(tied.status, 'finished');
  assert.equal(tied.winner, 0);
});

test('solo cricket finishes by closing all numbers', () => {
  let current = game('cricket', { players: ['Solo'] });
  for (const n of [20, 19, 18, 17, 16, 15]) current = recordTurn(current, [d(n, 3)]);
  current = recordTurn(current, [d(25, 2), d(25)]);
  assert.equal(current.status, 'finished');
  assert.equal(current.players[0].score, 0);
});

test('countup gives every player equal turns and handles ties', () => {
  let current = game('countup', { rounds: 1 });
  current = recordTurn(current, [d(20, 3)]);
  assert.equal(current.status, 'playing');
  current = recordTurn(current, [d(20), d(20), d(20)]);
  assert.equal(current.status, 'finished');
  assert.equal(current.winner, null);
  assert.deepEqual(current.winners, [0, 1]);
  let solo = game('countup', { players: ['Solo'], rounds: 2 });
  solo = recordTurn(solo, [d(20)]);
  assert.equal(solo.round, 2);
  solo = recordTurn(solo, [d(20, 3)]);
  assert.equal(solo.winner, 0);
  assert.equal(solo.players[0].score, 80);
});

test('undo restores exact game, including a win, and survives JSON persistence', () => {
  const original = game('301');
  original.players[0].score = 40;
  const finished = recordTurn(original, [d(20, 2)]);
  assert.deepEqual(undoTurn(JSON.parse(JSON.stringify(finished))), original);
  assert.strictEqual(undoTurn(original), original);
  let current = game('cricket');
  const before = recordTurn(current, [d(20, 3), d(20)]);
  const after = recordTurn(before, [d(19, 3)]);
  assert.deepEqual(undoTurn(after), before);
});

test('dart validation excludes impossible scores and invalid turn sizes', () => {
  for (const dart of [d(25, 3), d(0, 2), d(21), d(-1), d(20, 4), d(1.5), d(1, 1.5), null]) {
    assert.throws(() => recordTurn(game(), [dart]));
  }
  assert.throws(() => recordTurn(game(), []));
  assert.throws(() => recordTurn(game(), Array(4).fill(d(1))));
  assert.equal(dartValue(d(20, 3)), 60);
  assert.equal(dartLabel(d(25, 2)), 'BULL');
  assert.equal(dartLabel(d(0)), 'MISS');
});

test('checkout route identifies known finishes and bogey numbers', () => {
  assert.deepEqual(getCheckout(170), ['T20', 'T20', 'BULL']);
  assert.deepEqual(getCheckout(40), ['D20']);
  assert.deepEqual(getCheckout(50), ['BULL']);
  assert.deepEqual(getCheckout(180, false), ['T20', 'T20', 'T20']);
  assert.deepEqual(getCheckout(1, false), ['1']);
  for (const score of [0, 1, 159, 162, 163, 165, 166, 168, 169, 171, NaN]) {
    assert.equal(getCheckout(score), null, `No double-out finish for ${score}`);
  }
});

test('every suggested route is legal, adds to its target, and finishes on a double', () => {
  const parse = label => label === 'BULL' ? d(25, 2) : label.startsWith('T') ? d(Number(label.slice(1)), 3)
    : label.startsWith('D') ? d(Number(label.slice(1)), 2) : d(Number(label));
  for (const doubleOut of [true, false]) {
    for (let score = 1; score <= 180; score += 1) {
      const route = getCheckout(score, doubleOut);
      if (!route) continue;
      assert.ok(route.length >= 1 && route.length <= 3);
      const darts = route.map(parse);
      assert.equal(darts.reduce((sum, dart) => sum + dartValue(dart), 0), score);
      if (doubleOut) assert.equal(darts.at(-1).multiplier, 2);
      const current = game('501', { doubleOut });
      current.players[0].score = score;
      assert.equal(recordTurn(current, darts).status, 'finished');
    }
  }
});

test('expanded 01 starting scores and practice modes use the declared limits', () => {
  for (const id of ['301', '501', '701', '901', '1101', '1501']) {
    assert.equal(game(id).players[0].score, Number(id));
    assert.equal(isX01(id), true);
  }
  const countdown = game('countdown', { players: ['Solo'] });
  assert.equal(countdown.players[0].score, 901);
  assert.equal(countdown.outRule, 'open');
  assert.equal(countdown.timed, true);
  assert.throws(() => game('countdown'));
  assert.throws(() => game('quickcricket'));
  assert.throws(() => game('teamcricket'));
  assert.throws(() => game('doubledown', { players: ['1', '2', '3', '4', '5'] }));
});

test('double and master in ignore non-opening darts and score from the opening dart', () => {
  const double = game('501', { inRule: 'double' });
  assert.equal(double.players[0].opened, false);
  const next = recordTurn(double, [d(20), d(20, 2), d(20, 3)]);
  assert.equal(next.players[0].score, 401);
  assert.equal(next.players[0].opened, true);
  assert.equal(next.history[0].scored, 100);
  assert.equal(recordTurn(double, [d(25)]).players[0].score, 476);
  const master = game('501', { inRule: 'master' });
  assert.equal(recordTurn(master, [d(20), d(20, 3)]).players[0].score, 441);
  assert.equal(recordTurn(master, [d(20), d(20)]).players[0].score, 501);
});

test('master out accepts triples and either bull but rejects a plain single', () => {
  for (const [score, dart, finished] of [[60, d(20, 3), true], [25, d(25), true], [50, d(25, 2), true], [20, d(20), false]]) {
    const current = game('501', { outRule: 'master' });
    current.players[0].score = score;
    const next = recordTurn(current, [dart]);
    assert.equal(next.status === 'finished', finished);
    assert.equal(next.history[0].bust, !finished);
  }
});

test('full bull gives 50 to either bull while keeping actual double-out rules', () => {
  const current = game('501', { bullMode: 'full', outRule: 'open' });
  assert.equal(recordTurn(current, [d(25), d(25, 2)]).players[0].score, 401);
  current.outRule = 'double'; current.players[0].score = 50;
  assert.equal(recordTurn(current, [d(25)]).history[0].bust, true);
  assert.equal(recordTurn(current, [d(25, 2)]).status, 'finished');
  assert.equal(dartValue(d(25), 'full'), 50);
});

test('501 Quickie uses exactly ten rounds and lowest score wins after equal turns', () => {
  let current = game('501quickie');
  assert.equal(current.roundLimit, 10);
  assert.equal(current.inRule, 'open');
  assert.equal(current.outRule, 'open');
  for (let round = 1; round <= 10; round++) {
    current = recordTurn(current, [d(1)]);
    assert.equal(current.status, 'playing');
    current = recordTurn(current, [d(0)]);
  }
  assert.equal(current.status, 'finished');
  assert.deepEqual(current.winners, [0]);
  assert.ok(current.finishedAt);
  assert.equal(game('501quickie', { outRule: 'master' }).outRule, 'master');
});

test('Cricket/200 stops points at the spread cap and resumes when opponents score', () => {
  let current = game('cricket');
  current.players[0].marks[20] = 3;
  current.players[0].score = 190;
  current = recordTurn(current, [d(20, 3)]);
  assert.equal(current.players[0].score, 200);
  assert.equal(current.history[0].scored, 10);
  current.players[1].marks[19] = 3;
  current = recordTurn(current, [d(19)]);
  current = recordTurn(current, [d(20, 3)]);
  assert.equal(current.players[0].score, 219);
});

test('Cut-Throat adds uncapped points to every open rival and requires the lowest score', () => {
  const current = game('cutthroat', { players: ['A', 'B', 'C'] });
  current.players[0].marks[20] = 3;
  current.players[1].marks[20] = 3;
  const next = recordTurn(current, [d(20, 3)]);
  assert.deepEqual(next.players.map(p => p.score), [0, 0, 60]);
  for (const target of getTargets(next)) next.players[0].marks[target] = 3;
  next.activePlayer = 0; next.players[0].score = 1;
  assert.equal(recordTurn(next, [d(0)]).status, 'playing');
  next.players[0].score = 0;
  assert.equal(recordTurn(next, [d(0)]).status, 'finished');
});

test('Team Cricket needs both partners closed to score and applies the shared 400 cap', () => {
  let current = game('teamcricket', { players: ['A', 'B', 'C', 'D'] });
  current.players[0].marks[20] = 3;
  current = recordTurn(current, [d(20, 3)]);
  assert.deepEqual(current.teamScores, [0, 0]);
  current.activePlayer = 2; current.players[2].marks[20] = 2;
  current = recordTurn(current, [d(20, 3)]);
  assert.deepEqual(current.teamScores, [40, 0]);
  assert.equal(current.players[0].score, 40);
  assert.equal(current.players[2].score, 40);
  current.activePlayer = 0; current.teamScores[0] = 390;
  current.players[0].score = 390; current.players[2].score = 390;
  current = recordTurn(current, [d(20, 3)]);
  assert.equal(current.teamScores[0], 400);
  for (const target of getTargets(current)) current.players[0].marks[target] = 3;
  current.activePlayer = 0;
  assert.equal(recordTurn(current, [d(0)]).status, 'playing');
  for (const target of getTargets(current)) current.players[2].marks[target] = 3;
  const won = recordTurn(current, [d(0)]);
  assert.equal(won.status, 'finished');
  assert.deepEqual(won.winners, [0, 2]);
});

test('Wildcard randomizes only unmarked numbers after every turn and replay is deterministic', () => {
  const current = game('wildcard');
  const locked = current.cricketNumbers[0];
  const next = recordTurn(current, [d(locked)]);
  assert.equal(next.cricketNumbers.length, 7);
  assert.equal(new Set(next.cricketNumbers).size, 7);
  assert.ok(next.cricketNumbers.includes(25));
  assert.ok(next.cricketNumbers.includes(locked));
  assert.equal(next.players[0].marks[locked], 1);
  assert.deepEqual(recordTurn(current, [d(locked)]).cricketNumbers, next.cricketNumbers);
  assert.notEqual(next.randomState, current.randomState);
  const again = recordTurn(next, [d(0)]);
  assert.ok(again.cricketNumbers.includes(locked));
  assert.notEqual(again.randomState, next.randomState);
  assert.deepEqual(undoTurn(next), current);
});

test('Cricket Quickie has no spread limit and resolves at ten complete rounds', () => {
  let current = game('cricketquickie');
  current.players[0].marks[20] = 3;
  for (let round = 1; round <= 10; round++) {
    current = recordTurn(current, [d(20, 3)]);
    assert.equal(current.status, 'playing');
    current = recordTurn(current, [d(0)]);
  }
  assert.equal(current.players[0].score, 600);
  assert.equal(current.status, 'finished');
  assert.deepEqual(current.winners, [0]);
});

test('Double Down requires both random doubles, Cricket closures, then D1', () => {
  let current = game('doubledown', { players: ['Solo'] });
  current.doubleTargets = [2, 14];
  assert.equal(getStatus(current), 'Double in: D2 + D14');
  current = recordTurn(current, [d(20, 3), d(2, 2), d(14)]);
  assert.equal(current.players[0].marks[20], 0);
  assert.deepEqual(current.players[0].doubleHits, [true, false]);
  current = recordTurn(current, [d(14, 2), d(20, 3), d(19, 3)]);
  assert.equal(current.players[0].marks[20], 3);
  current = recordTurn(current, [d(18, 3), d(17, 3), d(16, 3)]);
  current = recordTurn(current, [d(15, 3), d(1), d(1, 2)]);
  assert.equal(current.history.at(-1).bust, true);
  assert.equal(current.players[0].marks[15], 3);
  assert.equal(current.status, 'playing');
  assert.equal(getStatus(current), 'Finish on D1');
  current = recordTurn(current, [d(1, 2)]);
  assert.equal(current.status, 'finished');
  assert.equal(current.players[0].score, 0);
});

test('Quick Cricket closes bull with 1/2 marks even under full bull and records a timed finish', () => {
  let current = game('quickcricket', { players: ['Solo'], bullMode: 'full' });
  for (const n of [20, 19, 18, 17, 16, 15]) current = recordTurn(current, [d(n, 3)]);
  current = recordTurn(current, [d(25)]);
  assert.equal(current.players[0].marks[25], 1);
  current = recordTurn(current, [d(25, 2)]);
  assert.equal(current.status, 'finished');
  assert.equal(current.players[0].score, 0);
  assert.ok(Date.parse(current.finishedAt) >= Date.parse(current.createdAt));
});

test('checkout suggestions respect every open/master/double and bull setting', () => {
  const parse = label => label === 'BULL' ? d(25, 2) : label.startsWith('T') ? d(Number(label.slice(1)), 3)
    : label.startsWith('D') ? d(Number(label.slice(1)), 2) : d(Number(label));
  for (const outRule of ['open', 'double', 'master']) for (const bullMode of ['split', 'full']) {
    for (let score = 1; score <= 180; score++) {
      const route = getCheckout(score, outRule, bullMode);
      if (!route) continue;
      const current = game('501', { outRule, bullMode });
      current.players[0].score = score;
      const next = recordTurn(current, route.map(parse));
      assert.equal(next.status, 'finished', `${score}: ${outRule}/${bullMode}: ${route}`);
    }
  }
});

test('checkout suggestions only use the darts remaining in the turn', () => {
  assert.deepEqual(getCheckout(40, 'double', 'split', 1), ['D20']);
  assert.equal(getCheckout(100, 'double', 'split', 1), null);
  assert.deepEqual(getCheckout(100, 'double', 'split', 2), ['T20', 'D20']);
  assert.equal(getCheckout(170, 'double', 'split', 2), null);
  assert.deepEqual(getCheckout(170, 'double', 'split', 3), ['T20', 'T20', 'BULL']);
  for (const invalid of [0, -1, 4, 1.5, NaN, Infinity, '2', null]) {
    assert.equal(getCheckout(40, 'double', 'split', invalid), null);
  }
  for (const outRule of ['open', 'double', 'master']) for (const bullMode of ['split', 'full']) {
    for (let score = 1; score <= 180; score++) {
      const complete = getCheckout(score, outRule, bullMode);
      assert.deepEqual(getCheckout(score, outRule, bullMode, 3), complete);
      for (const maxDarts of [1, 2]) {
        const route = getCheckout(score, outRule, bullMode, maxDarts);
        if (complete && complete.length <= maxDarts) assert.deepEqual(route, complete);
        else assert.equal(route, null);
        if (route) assert.ok(route.length <= maxDarts);
      }
    }
  }
});

test('turnEnded distinguishes an intrinsic dart finish from a preview at the round limit', () => {
  const x01 = game('501');
  x01.players[0].score = 40;
  assert.equal(recordTurn(x01, [d(20, 2)]).history.at(-1).turnEnded, true);
  assert.equal(recordTurn(x01, [d(20, 3)]).history.at(-1).turnEnded, true);
  assert.equal(recordTurn(x01, [d(20)]).history.at(-1).turnEnded, false);
  const countup = game('countup', { players: ['Solo'], rounds: 1 });
  const preview = recordTurn(countup, [d(20)]);
  assert.equal(preview.status, 'finished');
  assert.equal(preview.history.at(-1).turnEnded, false);
  const final = recordTurn(countup, [d(20), d(20, 3), d(20, 3)]);
  assert.equal(final.players[0].score, 140);
  assert.equal(final.players[0].darts, 3);
  const cricket = game('cricketquickie', { players: ['Solo'] });
  cricket.round = 10;
  assert.equal(recordTurn(cricket, [d(20)]).history.at(-1).turnEnded, false);
  for (const target of getTargets(cricket)) cricket.players[0].marks[target] = 3;
  cricket.players[0].marks[20] = 2;
  assert.equal(recordTurn(cricket, [d(20)]).history.at(-1).turnEnded, true);
});
