/** DOM contract tests: actual app module/event handlers, without a browser layout engine. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, createGame, recordTurn } from '../src/engine.js';

const originals = Object.fromEntries(['document', 'window', 'localStorage', 'setTimeout', 'clearTimeout', 'setInterval'].map(key => [key, globalThis[key]]));
after(() => { for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
let session = 0;

async function launch(saved = null, { storageFails = false, removeFails = false, otherStorage = {} } = {}) {
  const listeners = {};
  const storage = new Map(saved === null ? [] : [['oche-v1', typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  for (const [key, value] of Object.entries(otherStorage)) storage.set(key, value);
  function element() {
    const classes = new Set();
    return { innerHTML: '', textContent: '', open: false, classList: { add: name => classes.add(name), remove: name => classes.delete(name) }, addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; }, focus() {}, select() {}, getBoundingClientRect() { return { left: 0, top: 0, right: 500, bottom: 500 }; } };
  }
  const nodes = { '#app': element(), '#toast': element(), '#modal': element(), '#elapsed': element() };
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#elapsed') return nodes['#app'].innerHTML.includes('id="elapsed"') ? nodes[selector] : null;
      if (nodes[selector]) return nodes[selector];
      if (/^\[data-player=/.test(selector)) return element();
      return null;
    },
    addEventListener(type, handler) { listeners[type] = handler; },
  };
  globalThis.window = { scrollTo() {} };
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) { if (storageFails) throw new Error('Quota exceeded'); storage.set(key, value); },
    removeItem(key) { if (removeFails) throw new Error('Storage access denied'); storage.delete(key); },
  };
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};
  globalThis.setInterval = () => 1;
  await import(`../src/app.js?ui-session=${session++}`);
  function button(key, value) {
    const html = (nodes['#modal'].open ? nodes['#modal'].innerHTML : '') + nodes['#app'].innerHTML;
    const tag = [...html.matchAll(/<button\b([^>]*)>/g)].find(match => match[1].includes(`data-${key}="${value}"`));
    assert.ok(tag, `Missing button data-${key}="${value}"`);
    const dataset = Object.fromEntries([...tag[1].matchAll(/data-([\w-]+)="([^"]*)"/g)].map(match => [match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), match[2]]));
    return { dataset, disabled: /\sdisabled(?:\s|$|=)/.test(tag[1]), closest() { return this; } };
  }
  return {
    html: () => nodes['#app'].innerHTML,
    toast: () => nodes['#toast'].textContent,
    modal: () => nodes['#modal'],
    state: () => JSON.parse(storage.get('oche-v1') || 'null'),
    raw: () => storage.get('oche-v1'),
    storageValue: key => storage.get(key),
    button,
    click(key, value) { listeners.click({ target: button(key, value) }); },
    action(value) { this.click('action', value); },
    name(index, value) { listeners.input({ target: { dataset: { player: String(index) }, value, matches: selector => selector === '[data-player]', previousElementSibling: element() } }); },
    setting(name, value) { listeners.change({ target: { dataset: { setting: name }, value: String(value) } }); },
    dart(number, multiplier = 1) {
      if (number === 0 || number === 25) this.click('dart', `${number},${multiplier}`);
      else { if (multiplier !== 1) this.click('multiplier', String(multiplier)); this.click('number', String(number)); }
    },
    select(id) { const mode = MODES.find(m => m.id === id); this.click('category', mode.category); this.click('mode', id); },
  };
}

test('setup supports eight customizable players and removes players', async () => {
  const ui = await launch();
  for (let i = 2; i < 8; i++) ui.action('add');
  assert.equal(ui.button('action', 'add').disabled, true);
  ui.name(0, 'Alex'); ui.name(7, 'Robin'); ui.action('start');
  assert.equal(ui.state().game.players.length, 8);
  assert.equal(ui.state().game.players[0].name, 'Alex'); assert.equal(ui.state().game.players[7].name, 'Robin');
  ui.action('setup'); ui.click('remove', '7');
  assert.match(ui.html(), /7 \/ 8/);
});

test('invalid names are rejected and user names are escaped in rendered HTML', async () => {
  const ui = await launch(); ui.name(0, '   '); ui.action('start');
  assert.equal(ui.state(), null); assert.match(ui.toast(), /name/);
  ui.name(0, '<img src=x>'); ui.action('start');
  assert.equal(ui.state().game.players[0].name, '<img src=x>');
  assert.ok(!ui.html().includes('<img src=x>')); assert.ok(ui.html().includes('&lt;img src=x&gt;'));
});

test('every menu mode can start with its supported lineup and renders useful status', async () => {
  for (const mode of MODES) {
    const ui = await launch(); ui.select(mode.id);
    const count = Math.max(mode.minPlayers, Math.min(2, mode.maxPlayers));
    for (let n = 2; n < count; n++) ui.action('add');
    if (count === 1) ui.click('remove', '1');
    ui.action('start');
    assert.equal(ui.state()?.game.mode, mode.id, `${mode.id} starts`);
    assert.ok(!ui.html().includes('[object Object]'), `${mode.id} status must be human-readable`);
    assert.ok(!ui.html().includes('undefined'), `${mode.id} must not display missing state`);
  }
});

test('entering darts, removing a dart, saving and undoing preserves player rotation', async () => {
  const ui = await launch(); ui.action('start');
  ui.dart(20, 3); ui.dart(18, 2); ui.click('slot', '1'); ui.dart(20);
  ui.action('submit');
  let g = ui.state().game;
  assert.equal(g.players[0].score, 421); assert.equal(g.activePlayer, 1);
  assert.deepEqual(g.history[0].darts, [{ number: 20, multiplier: 3 }, { number: 20, multiplier: 1 }, { number: 0, multiplier: 1 }]);
  ui.action('undo'); g = ui.state().game;
  assert.equal(g.activePlayer, 0); assert.equal(g.players[0].score, 501); assert.equal(g.history.length, 0);
});

test('a saved match resumes on module reload with the same scores and next player', async () => {
  let ui = await launch(); ui.action('start'); ui.dart(20, 3); ui.action('submit');
  const before = ui.state().game;
  ui = await launch(ui.raw());
  assert.match(ui.html(), /The scoreboard/); assert.deepEqual(ui.state().game, before);
  ui.dart(19, 3); ui.action('submit');
  assert.equal(ui.state().game.players[1].score, 444); assert.equal(ui.state().game.round, 2);
});

test('finishing a game saves history; undo removes result; rematch uses previous settings', async () => {
  const ui = await launch(); ui.select('301'); ui.click('remove', '1'); ui.action('start');
  ui.dart(20, 3); ui.dart(20, 3); ui.dart(20, 3); ui.action('submit');
  ui.dart(20, 3); ui.dart(17, 3); ui.dart(5, 2); ui.action('submit');
  assert.equal(ui.state().game.status, 'finished'); assert.equal(ui.state().matches.length, 1);
  ui.action('history'); assert.match(ui.html(), /data-match=/); ui.action('play'); ui.action('undo');
  assert.equal(ui.state().game.status, 'playing'); assert.equal(ui.state().matches.length, 0);
  ui.dart(20, 3); ui.dart(17, 3); ui.dart(5, 2); ui.action('submit'); ui.action('rematch');
  assert.equal(ui.state().game.mode, '301'); assert.equal(ui.state().game.players[0].score, 301);
  assert.equal(ui.state().matches.length, 1);
});

test('final Count Up turn accepts all three darts and counts unused darts as misses', async () => {
  const initial = createGame({ mode: 'countup', players: ['A', 'B'], rounds: 1 });
  const half = recordTurn(initial, [{ number: 20, multiplier: 1 }]);
  const ui = await launch({ names: ['A', 'B'], matches: [], game: half });
  ui.dart(20, 3);
  assert.equal(ui.button('number', '20').disabled, false, 'a partial final round preview must allow remaining darts');
  ui.dart(20, 3); ui.dart(20, 3); ui.action('submit');
  assert.equal(ui.state().game.players[1].score, 180); assert.equal(ui.state().game.players[1].darts, 3);
  const ui2 = await launch({ names: ['A', 'B'], matches: [], game: half });
  ui2.dart(20); ui2.action('submit');
  assert.equal(ui2.state().game.players[1].darts, 3, 'early save still consumes a full final-round visit');
});

test('Gotcha master-out setting survives starting and rematching', async () => {
  let ui = await launch(); ui.select('gotcha'); ui.setting('outRule', 'master'); ui.action('start');
  assert.equal(ui.state().game.masterOut, true);
  const saved = ui.state(); saved.game.players[0].score = 241;
  ui = await launch(saved); ui.dart(20, 3); ui.action('submit'); ui.action('rematch');
  assert.equal(ui.state().game.masterOut, true); assert.equal(ui.state().game.players[0].score, 0);
});

test('Tic Tac Darts renders nine numbered cells and both players marks', async () => {
  const ui = await launch(); ui.select('tictac'); ui.action('start');
  const cells = ui.state().game.ticTac;
  assert.match(ui.html(), /tic-board/);
  const board = ui.html().split('class="tic-board"')[1]?.split('recent-turns')[0] || '';
  for (const cell of cells) assert.ok(board.includes(cell.number === 25 ? 'BULL' : String(cell.number)), `board includes ${cell.number}`);
});

test('new-game replacement requires its in-app confirmation and cancel preserves game', async () => {
  const ui = await launch(); ui.action('start'); const id = ui.state().game.id;
  ui.action('setup'); ui.select('301'); ui.action('start');
  assert.equal(ui.modal().open, true); assert.equal(ui.state().game.id, id);
  ui.action('close-modal'); assert.equal(ui.state().game.id, id);
  ui.action('start'); ui.action('confirm-start'); assert.notEqual(ui.state().game.id, id); assert.equal(ui.state().game.mode, '301');
});

test('storage failures preserve the in-memory game and communicate session-only status', async () => {
  const ui = await launch(null, { storageFails: true }); ui.action('start');
  assert.match(ui.html(), /Session only/); assert.match(ui.html(), /The scoreboard/);
  assert.match(ui.toast(), /Storage is unavailable/);
  ui.dart(20); ui.action('submit'); assert.match(ui.html(), /481/);
});

test('invalid JSON storage recovers to a usable setup screen', async () => {
  const ui = await launch('{broken'); assert.match(ui.html(), /Pick your game/);
  ui.action('start'); assert.equal(ui.state().game.mode, '501');
});

test('malformed saved game and match entries recover without breaking navigation', async () => {
  const ui = await launch({ names: [null], game: { mode: '501', players: [null] }, matches: [null, {}, { mode: '301' }] });
  assert.match(ui.html(), /Pick your game/);
  ui.action('history'); assert.match(ui.html(), /A clean slate/);
  ui.action('setup'); ui.action('start'); assert.equal(ui.state().game.players.length, 2);
});

test('hydrated names remain escaped and only the last thirty valid matches are kept', async () => {
  const initial = createGame({ mode: 'countup', players: ['<img src=x>'], rounds: 1 });
  const finished = recordTurn(initial, [{ number: 20, multiplier: 1 }]);
  const matches = Array.from({ length: 35 }, (_, i) => ({ ...finished, id: `match-${i}` }));
  const ui = await launch({ names: ['<img src=x>'], matches, game: finished });
  assert.ok(!ui.html().includes('<img src=x>')); assert.ok(ui.html().includes('&lt;img src=x&gt;'));
  ui.action('history');
  assert.equal([...ui.html().matchAll(/data-match=/g)].length, 30);
  assert.ok(!ui.html().includes('data-match="match-4"'));
  assert.ok(ui.html().includes('data-match="match-34"'));
});

const currentScore = ui => Number(ui.html().match(/class="score-card [^"]*current[^\"]*"[\s\S]*?class="score-number"><strong>(-?\d+)<\/strong>/)?.[1]);
const liveScoreText = ui => ui.html().match(/class="live-score[^\"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
const savedGame = (game, extra = {}) => ({ names: game.players.map(p => p.name), matches: [], game, ...extra });
const finishCountUp = name => recordTurn(createGame({ mode: 'countup', players: [name], rounds: 1 }), [{ number: 20, multiplier: 1 }]);

test('01 draft darts update both score displays immediately while keeping the active player until save', async () => {
  const ui = await launch(); ui.action('start');
  ui.dart(20); assert.equal(currentScore(ui), 481); assert.match(liveScoreText(ui), /481/);
  ui.dart(20, 3); assert.equal(currentScore(ui), 421); assert.match(liveScoreText(ui), /421/);
  assert.equal(ui.state().game.players[0].score, 501, 'draft must not mutate committed score');
  assert.equal(ui.state().game.activePlayer, 0); assert.equal(ui.state().game.history.length, 0);
  assert.deepEqual(ui.state().pending, { gameId: ui.state().game.id, playerIndex: 0, darts: [{ number: 20, multiplier: 1 }, { number: 20, multiplier: 3 }] });
  ui.action('submit');
  assert.equal(ui.state().game.players[0].score, 421); assert.equal(ui.state().game.activePlayer, 1);
  assert.equal(ui.state().pending, null);
});

test('draft darts hydrate after refresh; removing or clearing persists the new preview', async () => {
  let ui = await launch(); ui.action('start'); ui.dart(20, 3); ui.dart(18, 2);
  ui = await launch(ui.raw());
  assert.equal(currentScore(ui), 405); assert.match(liveScoreText(ui), /405/);
  assert.match(ui.html(), /Remove dart 1: T20/); assert.match(ui.html(), /Remove dart 2: D18/);
  ui.click('slot', '0');
  assert.equal(currentScore(ui), 465); assert.deepEqual(ui.state().pending.darts, [{ number: 18, multiplier: 2 }]);
  ui = await launch(ui.raw()); assert.equal(currentScore(ui), 465);
  ui.action('clear'); assert.equal(currentScore(ui), 501); assert.equal(ui.state().pending, null);
  ui = await launch(ui.raw()); assert.equal(currentScore(ui), 501); assert.equal(ui.button('action', 'submit').disabled, true);
});

test('checkout suggestions use the draft balance and number of darts still available', async () => {
  const initial = createGame({ mode: '501', players: ['A', 'B'], outRule: 'double' }); initial.players[0].score = 170;
  const ui = await launch(savedGame(initial));
  assert.match(ui.html(), /class="checkout-hint"/);
  ui.dart(20, 3); assert.equal(currentScore(ui), 110); assert.match(ui.html(), /T20 → BULL/);
  ui.dart(0); assert.equal(currentScore(ui), 110);
  assert.ok(!ui.html().includes('T20 → BULL'), '110 cannot finish in one dart'); assert.match(ui.html(), /No finish/);
  ui.click('slot', '1'); assert.match(ui.html(), /T20 → BULL/);
});

test('a draft bust restores the displayed score immediately and saves accurate history only after confirmation', async () => {
  const initial = createGame({ mode: '501', players: ['A', 'B'], outRule: 'double' }); initial.players[0].score = 40;
  let ui = await launch(savedGame(initial)); ui.dart(20); assert.equal(currentScore(ui), 20);
  ui.dart(25); assert.equal(currentScore(ui), 40); assert.match(liveScoreText(ui), /40/);
  assert.equal(ui.state().game.history.length, 0); assert.equal(ui.button('number', '20').disabled, true);
  ui = await launch(ui.raw()); assert.equal(currentScore(ui), 40); assert.match(ui.html(), /Record bust/);
  ui.action('submit');
  const g = ui.state().game;
  assert.equal(g.activePlayer, 1); assert.equal(g.players[0].score, 40); assert.equal(g.history[0].bust, true);
  assert.equal(g.history[0].scored, 0); assert.deepEqual(g.history[0].darts, [{ number: 20, multiplier: 1 }, { number: 25, multiplier: 1 }]);
  assert.equal(ui.state().pending, null);
});

test('stale or malformed saved drafts are ignored safely', async () => {
  const initial = createGame({ mode: '501', players: ['A', 'B'] });
  const valid = { gameId: initial.id, playerIndex: 0, darts: [{ number: 20, multiplier: 3 }] };
  for (const pending of [
    { ...valid, gameId: 'different-game' }, { ...valid, playerIndex: 1 }, { ...valid, darts: null },
    { ...valid, darts: [{ number: 25, multiplier: 3 }] }, { ...valid, darts: Array(4).fill({ number: 20, multiplier: 1 }) },
    { ...valid, darts: [null] }, { ...valid, darts: [{ number: -1, multiplier: 1 }] },
  ]) {
    const ui = await launch(savedGame(initial, { pending }));
    assert.equal(currentScore(ui), 501); assert.equal(ui.button('action', 'submit').disabled, true);
  }
});

test('undo discards the next player’s draft and restores the previous turn', async () => {
  let ui = await launch(); ui.action('start'); ui.dart(20, 3); ui.action('submit'); ui.dart(19, 3);
  assert.equal(currentScore(ui), 444); ui.action('undo');
  assert.equal(ui.state().pending, null); assert.equal(ui.state().game.activePlayer, 0);
  assert.equal(ui.state().game.history.length, 0); assert.equal(currentScore(ui), 501);
  ui = await launch(ui.raw()); assert.equal(currentScore(ui), 501); assert.equal(ui.button('action', 'submit').disabled, true);
});

test('replacing a game clears its draft before the new game can be resumed', async () => {
  let ui = await launch(); ui.action('start'); ui.dart(20, 3); const oldId = ui.state().game.id;
  ui.action('setup'); ui.select('301'); ui.action('start'); ui.action('confirm-start');
  assert.notEqual(ui.state().game.id, oldId); assert.equal(ui.state().pending, null);
  ui = await launch(ui.raw()); assert.equal(currentScore(ui), 301); assert.equal(ui.button('action', 'submit').disabled, true);
});

test('ending a game needs confirmation and preserves saved matches and player names', async () => {
  const finished = finishCountUp('Previous winner');
  const initial = createGame({ mode: '501', players: ['Alex', 'Robin'] });
  const ui = await launch(savedGame(initial, { matches: [finished] })); ui.dart(20);
  const before = ui.raw(); ui.action('end-game');
  assert.equal(ui.modal().open, true); assert.equal(ui.raw(), before);
  ui.action('close-modal'); assert.equal(ui.raw(), before); assert.equal(currentScore(ui), 481);
  ui.action('end-game'); ui.action('confirm-end-game');
  assert.equal(ui.state().game, null); assert.equal(ui.state().pending, null);
  assert.deepEqual(ui.state().names, ['Alex', 'Robin']); assert.deepEqual(ui.state().matches, [finished]);
  assert.match(ui.html(), /Pick your game/);
});

test('deleting one history record requires confirmation and leaves other matches intact', async () => {
  const first = finishCountUp('Alex'), second = finishCountUp('Robin');
  const active = createGame({ mode: '501', players: ['Alex', 'Robin'] });
  const ui = await launch(savedGame(active, { matches: [first, second] }));
  ui.action('history'); ui.click('match', first.id); ui.click('delete-match', first.id);
  assert.equal(ui.state().matches.length, 2); ui.action('close-modal'); assert.equal(ui.state().matches.length, 2);
  ui.click('match', first.id); ui.click('delete-match', first.id); ui.click('confirm-delete-match', first.id);
  assert.deepEqual(ui.state().matches, [second]); assert.deepEqual(ui.state().game, active);
});

test('deleting the displayed completed match clears its current-game copy without resurrecting history', async () => {
  const finished = finishCountUp('Alex');
  const ui = await launch(savedGame(finished, { matches: [finished] }));
  ui.action('history'); ui.click('match', finished.id); ui.click('delete-match', finished.id); ui.click('confirm-delete-match', finished.id);
  assert.equal(ui.state().game, null); assert.equal(ui.state().matches.length, 0); assert.equal(ui.state().pending, null);
  ui.action('play'); assert.match(ui.html(), /Pick your game/); assert.ok(!ui.html().includes('Undo final turn'));
});

test('clearing saved data only removes Oche storage after confirmation and resets the app', async () => {
  const finished = finishCountUp('Alex');
  const ui = await launch(savedGame(finished, { matches: [finished] }), { otherStorage: { 'unrelated-setting': 'keep me' } });
  const before = ui.raw(); ui.action('data'); ui.action('clear-data');
  assert.equal(ui.raw(), before); ui.action('close-modal'); assert.equal(ui.raw(), before);
  ui.action('data'); ui.action('clear-data'); ui.action('confirm-clear-data');
  assert.equal(ui.raw(), undefined); assert.equal(ui.storageValue('unrelated-setting'), 'keep me');
  assert.match(ui.html(), /Pick your game/);
  ui.action('history'); assert.match(ui.html(), /A clean slate/);
  ui.action('setup'); ui.action('start'); assert.deepEqual(ui.state().names, ['Player 1', 'Player 2']);
});

test('failed data removal reports an error and preserves the saved and in-memory match', async () => {
  const initial = createGame({ mode: '501', players: ['Alex', 'Robin'] });
  const ui = await launch(savedGame(initial), { removeFails: true });
  const before = ui.raw(); ui.action('data'); ui.action('clear-data'); ui.action('confirm-clear-data');
  assert.equal(ui.raw(), before); assert.deepEqual(ui.state().game, initial);
  assert.match(ui.toast(), /could not|unable|unavailable|denied|failed/i);
  ui.action('close-modal'); assert.match(ui.html(), /The scoreboard/);
});

test('ending a game when saving fails reports a session-only change', async () => {
  const initial = createGame({ mode: '501', players: ['Alex', 'Robin'] });
  const ui = await launch(savedGame(initial), { storageFails: true });
  const before = ui.raw(); ui.action('end-game'); ui.action('confirm-end-game');
  assert.equal(ui.raw(), before); assert.deepEqual(ui.state().game, initial);
  assert.match(ui.toast(), /session.*only/i); assert.notEqual(ui.toast(), 'Game closed.');
  assert.match(ui.html(), /Pick your game/);
});

test('deleting a match when saving fails reports a session-only change', async () => {
  const finished = finishCountUp('Alex');
  const ui = await launch(savedGame(finished, { matches: [finished] }), { storageFails: true });
  const before = ui.raw(); ui.action('history'); ui.click('match', finished.id);
  ui.click('delete-match', finished.id); ui.click('confirm-delete-match', finished.id);
  assert.equal(ui.raw(), before); assert.deepEqual(ui.state().matches, [finished]);
  assert.match(ui.toast(), /session.*only/i); assert.notEqual(ui.toast(), 'Match deleted.');
  assert.match(ui.html(), /A clean slate/);
});
