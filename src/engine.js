import { PARTY_MODES, isPartyMode, initParty, scorePartyDart, finishPartyTurn, advancePartyRound, getPartyStatus } from './party.js';

/** Galaxy 3 Rev. H game rules; all public updates return new objects. */
const x01Modes = ['501', '301', '701', '901', '1101', '1501'];
const mode = (id, name, short, description, category, rules, minPlayers = 1, maxPlayers = 8) => ({ id, name, short, description, category, rules, minPlayers, maxPlayers });
export const MODES = Object.freeze([
  ...x01Modes.map(id => mode(id, id, id === '501' ? 'The classic' : id === '301' ? 'A quick round' : 'The long game', `Count down from ${id} to exactly zero.`, '01', 'Take turns throwing up to three darts. Reach exactly zero using the chosen opening and finishing rules. A bust restores the score at the start of the turn.')),
  mode('501quickie', '501 Quickie', 'Ten-round sprint', 'Classic 501 with a ten-round limit.', '01', 'Open in. Choose open or master out. Reach zero or have the lowest score after ten complete rounds; tied lowest scores share the win.'),
  mode('cricket', 'Cricket / 200', 'Close & conquer', 'Close 15–20 and the bull, with a 200-point spread.', 'cricket', 'Three marks close a target. Additional marks score while an opponent is open. Close everything with at least as many points as every opponent to win. Your lead is capped at 200 over the lowest opponent.'),
  mode('cutthroat', 'Cut-Throat Cricket', 'Turn the tables', 'Give your opponents points. Lowest score wins.', 'cricket', 'Close 15–20 and bull. Extra marks add points to each opponent still open on that target. Close everything with the lowest or tied-lowest score to win. No spread limit.', 2),
  mode('teamcricket', 'Team Cricket', 'Better together', 'Four players. Two teams. One shared score.', 'cricket', 'Players 1 and 3 play against 2 and 4. Marks are individual. Both teammates must close a target before either scores. Both must close everything with a team score at least tied to win. Maximum lead: 400 points.', 4, 4),
  mode('wildcard', 'Wild Card Cricket', 'Expect the unexpected', 'Six changing numbers, plus the bull.', 'cricket', 'Six targets are drawn from 7–20. Unmarked targets change after every turn; any mark locks a target for everyone. Bull stays. Otherwise Cricket / 200 rules apply.'),
  mode('cricketquickie', 'Cricket Quickie', 'Keep it moving', 'Cricket in ten rounds, with no point spread limit.', 'cricket', 'Play standard Cricket without a spread limit. Close everything with the highest score, or have the highest score after ten rounds. Tied high scores at the limit share the win.'),
  mode('doubledown', 'Double Down Cricket', 'Doubles make the difference', 'Double in, close 15–20, finish on double 1.', 'cricket', 'Hit both displayed random doubles from 2–14, in either order, then close 15–20. Finish with D1. A wrong dart during the finishing stage ends the turn; closed marks are retained. No points or bull.', 1, 4),
  ...PARTY_MODES,
  mode('quickcricket', 'Quick Cricket', 'Against the clock', 'Close the Cricket targets as quickly as you can.', 'practice', 'Solo timed practice. Close 15–20 and bull with three marks each. Extra hits do not score. The timer includes the time you spend recording darts.', 1, 1),
  mode('countdown', 'Count Down', 'Beat your best', 'A timed solo race from 901 to zero.', 'practice', 'Solo timed 901 with open in and open out. Reach exactly zero. Overshooting busts the turn. The timer includes the time you spend recording darts.', 1, 1),
]);

const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25];
const CRICKET_MODES = new Set(['cricket', 'cutthroat', 'teamcricket', 'wildcard', 'cricketquickie', 'doubledown', 'quickcricket']);
const clone = value => JSON.parse(JSON.stringify(value));
export const isX01 = id => x01Modes.includes(id) || id === '501quickie' || id === 'countdown';
export const getTargets = game => CRICKET_MODES.has(game.mode) ? [...game.cricketNumbers] : [];

function random(game) {
  let state = game.randomState | 0;
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  game.randomState = state >>> 0;
  return game.randomState / 4294967296;
}
function choose(game, values, count) {
  const pool = [...values], selected = [];
  while (selected.length < count) selected.push(pool.splice(Math.floor(random(game) * pool.length), 1)[0]);
  return selected;
}

export function createGame(options = {}) {
  const { mode: modeId = '501', players, doubleOut = true, rounds = 8, bullMode = 'split' } = options;
  const definition = MODES.find(item => item.id === modeId);
  if (!definition) throw new Error('Choose a supported game mode.');
  if (!Array.isArray(players) || players.length < definition.minPlayers || players.length > definition.maxPlayers) {
    throw new Error(`${definition.name} needs ${definition.minPlayers === definition.maxPlayers ? definition.minPlayers : `${definition.minPlayers}–${definition.maxPlayers}`} player${definition.maxPlayers === 1 ? '' : 's'}.`);
  }
  const names = players.map(name => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 24) throw new Error('Each player needs a name of 1–24 characters.');
    return name.trim();
  });
  if (typeof doubleOut !== 'boolean') throw new Error('Double out must be on or off.');
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 50) throw new Error('Choose 1–50 rounds.');
  if (!['split', 'full'].includes(bullMode)) throw new Error('Choose split or full bull scoring.');
  let inRule = options.inRule ?? 'open';
  let outRule = options.outRule ?? (doubleOut ? 'double' : 'open');
  if (modeId === 'countdown') { inRule = 'open'; outRule = 'open'; }
  if (modeId === '501quickie') { inRule = 'open'; outRule = options.outRule === 'master' ? 'master' : 'open'; }
  if (!['open', 'double', 'master'].includes(inRule) || !['open', 'double', 'master'].includes(outRule)) throw new Error('Choose open, double, or master rules.');
  if (options.roundLimit != null && (!Number.isInteger(options.roundLimit) || options.roundLimit < 1 || options.roundLimit > 100)) throw new Error('Round limit must be 1–100.');
  const createdAt = new Date().toISOString();
  const game = {
    id: globalThis.crypto?.randomUUID?.() ?? `game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    mode: modeId,
    players: names.map((name, index) => ({
      id: `player-${index + 1}`, name,
      score: modeId === 'countdown' ? 901 : modeId === '501quickie' ? 501 : isX01(modeId) ? Number(modeId) : 0,
      marks: Object.fromEntries(CRICKET_NUMBERS.map(number => [number, 0])),
      opened: inRule === 'open', doubleHits: [false, false],
      target: 1, turns: 0, darts: 0, totalScored: 0, best: 0,
    })),
    activePlayer: 0, round: 1, doubleOut: outRule === 'double', inRule, outRule, bullMode, rounds,
    roundLimit: ['501quickie', 'cricketquickie'].includes(modeId) ? 10 : options.roundLimit ?? null,
    cricketNumbers: modeId === 'doubledown' ? CRICKET_NUMBERS.filter(n => n !== 25) : [...CRICKET_NUMBERS],
    spreadLimit: modeId === 'teamcricket' ? 400 : ['cricket', 'wildcard'].includes(modeId) ? 200 : null,
    randomState: Math.floor(Math.random() * 4294967295) + 1,
    timed: ['quickcricket', 'countdown'].includes(modeId),
    status: 'playing', winner: null, winners: [], history: [], createdAt, finishedAt: null,
  };
  if (game.roundLimit) game.rounds = game.roundLimit;
  if (modeId === 'wildcard') {
    game.cricketNumbers = [...choose(game, Array.from({ length: 14 }, (_, i) => i + 7), 6).sort((a, b) => b - a), 25];
    game.players.forEach(player => { player.marks = Object.fromEntries(game.cricketNumbers.map(number => [number, 0])); });
  }
  if (modeId === 'doubledown') game.doubleTargets = choose(game, Array.from({ length: 13 }, (_, i) => i + 2), 2);
  if (modeId === 'teamcricket') {
    game.teamScores = [0, 0];
    game.players.forEach((player, index) => { player.team = index % 2; });
  }
  if (isPartyMode(modeId)) initParty(game, options);
  return game;
}

function validateDart(dart) {
  if (!dart || !Number.isInteger(dart.number) || !Number.isInteger(dart.multiplier)
    || !((dart.number >= 0 && dart.number <= 20) || dart.number === 25)
    || dart.multiplier < 1 || dart.multiplier > 3
    || (dart.number === 25 && dart.multiplier === 3)
    || (dart.number === 0 && dart.multiplier !== 1)) throw new Error('Enter a valid single, double, triple, bull, or miss.');
}

export function dartValue(dart, bullMode = 'split') {
  validateDart(dart);
  return dart.number === 25 && bullMode === 'full' ? 50 : dart.number * dart.multiplier;
}

export function dartLabel(dart) {
  validateDart(dart);
  if (dart.number === 0) return 'MISS';
  if (dart.number === 25) return dart.multiplier === 2 ? 'BULL' : '25';
  return `${dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : ''}${dart.number}`;
}

function finish(game, indexes) {
  game.status = 'finished'; game.winners = indexes;
  game.winner = indexes.length === 1 ? indexes[0] : null;
  game.finishedAt = new Date().toISOString();
}
function meetsRule(dart, rule, opening = false) {
  if (dart.number === 0) return false;
  if (rule === 'open') return true;
  if (rule === 'master') return dart.multiplier > 1 || dart.number === 25;
  return dart.multiplier === 2 || (opening && dart.number === 25);
}
function closed(game, player) { return game.cricketNumbers.every(number => player.marks[number] === 3); }
function cricketDart(game, player, dart) {
  const target = dart.number;
  if (game.mode === 'doubledown') {
    if (!player.doubleHits.every(Boolean)) {
      const index = game.doubleTargets.indexOf(target);
      if (dart.multiplier === 2 && index !== -1) player.doubleHits[index] = true;
      return { scored: 0 };
    }
    if (closed(game, player)) {
      if (target === 1 && dart.multiplier === 2) finish(game, [game.activePlayer]);
      return { scored: 0, bust: game.status !== 'finished', endTurn: true };
    }
    if (game.cricketNumbers.includes(target)) player.marks[target] = Math.min(3, player.marks[target] + dart.multiplier);
    return { scored: 0 };
  }
  let scored = 0;
  if (game.cricketNumbers.includes(target)) {
    const extra = Math.max(0, dart.multiplier - (3 - player.marks[target]));
    player.marks[target] = Math.min(3, player.marks[target] + dart.multiplier);
    const points = extra * target;
    if (game.mode === 'cutthroat') {
      for (const other of game.players) {
        if (other !== player && other.marks[target] < 3) { other.score += points; scored += points; }
      }
    } else if (game.mode === 'teamcricket') {
      const team = player.team;
      const partners = game.players.filter(other => other.team === team);
      const opponents = game.players.filter(other => other.team !== team);
      if (partners.every(other => other.marks[target] === 3) && opponents.some(other => other.marks[target] < 3)) {
        scored = Math.min(points, Math.max(0, game.teamScores[1 - team] + game.spreadLimit - game.teamScores[team]));
        game.teamScores[team] += scored;
        partners.forEach(other => { other.score = game.teamScores[team]; });
      }
    } else if (game.mode !== 'quickcricket' && game.players.some(other => other !== player && other.marks[target] < 3)) {
      scored = points;
      if (game.spreadLimit != null) {
        const lowest = Math.min(...game.players.filter(other => other !== player).map(other => other.score));
        scored = Math.min(scored, Math.max(0, lowest + game.spreadLimit - player.score));
      }
      player.score += scored;
    }
  }
  if (game.mode === 'teamcricket') {
    const team = player.team;
    if (game.players.filter(other => other.team === team).every(other => closed(game, other)) && game.teamScores[team] >= game.teamScores[1 - team]) {
      finish(game, game.players.flatMap((other, index) => other.team === team ? [index] : []));
    }
  } else if (closed(game, player) && game.players.every(other => game.mode === 'cutthroat' ? player.score <= other.score : player.score >= other.score)) {
    finish(game, [game.activePlayer]);
  }
  return { scored };
}
function rotateWildcards(game) {
  const locked = game.cricketNumbers.filter(number => number === 25 || game.players.some(player => player.marks[number] > 0));
  const choices = choose(game, Array.from({ length: 14 }, (_, i) => i + 7).filter(number => !locked.includes(number)), 7 - locked.length);
  game.cricketNumbers = [...locked.filter(number => number !== 25), ...choices].sort((a, b) => b - a).concat(25);
  game.players.forEach(player => { player.marks = Object.fromEntries(game.cricketNumbers.map(number => [number, player.marks[number] ?? 0])); });
}

/** A visit is 1–3 darts; a win or bust ends it immediately. */
export function recordTurn(game, darts) {
  if (!game || game.status !== 'playing') throw new Error('This game has already finished.');
  if (!Array.isArray(darts) || darts.length < 1 || darts.length > 3) throw new Error('Enter between 1 and 3 darts.');
  darts.forEach(validateDart);
  const { history, ...state } = game;
  const next = { ...clone(state), history: [...history] };
  const before = clone(state), playerIndex = next.activePlayer, player = next.players[playerIndex];
  const startingScore = player.score, startingOpened = player.opened;
  const usedDarts = [];
  let bust = false, scored = 0, turnEnded = false;
  for (const dart of darts) {
    usedDarts.push({ number: dart.number, multiplier: dart.multiplier });
    if (isX01(next.mode)) {
      if (!player.opened) {
        if (!meetsRule(dart, next.inRule, true)) continue;
        player.opened = true;
      }
      const remaining = player.score - dartValue(dart, next.bullMode);
      if (remaining < 0 || (next.outRule !== 'open' && remaining === 1) || (remaining === 0 && !meetsRule(dart, next.outRule))) {
        bust = true; turnEnded = true; player.score = startingScore; player.opened = startingOpened; scored = 0; break;
      }
      player.score = remaining; scored += dartValue(dart, next.bullMode);
      if (remaining === 0) { finish(next, [playerIndex]); turnEnded = true; break; }
    } else {
      const result = CRICKET_MODES.has(next.mode) ? cricketDart(next, player, dart) : scorePartyDart(next, player, dart, usedDarts.length - 1);
      scored += result?.scored ?? 0;
      bust ||= result?.bust ?? false;
      if (bust || result?.endTurn || next.status === 'finished') { turnEnded = true; break; }
    }
  }
  if (isPartyMode(next.mode)) {
    const result = finishPartyTurn(next, player);
    scored += result?.scored ?? 0;
  }
  player.turns += 1;
  player.darts += bust ? 3 : usedDarts.length;
  player.totalScored += scored;
  player.best = Math.max(player.best, scored);
  next.history.push({
    playerIndex, playerName: player.name, round: next.round, darts: usedDarts,
    total: usedDarts.reduce((sum, dart) => sum + dartValue(dart, next.bullMode), 0),
    scored, bust, turnEnded, remaining: player.score, timestamp: new Date().toISOString(), before,
  });
  if (next.status === 'playing') {
    if (next.roundLimit && next.round >= next.roundLimit && playerIndex === next.players.length - 1) {
      const scores = next.players.map(other => other.score);
      const best = isX01(next.mode) ? Math.min(...scores) : Math.max(...scores);
      finish(next, scores.flatMap((value, index) => value === best ? [index] : []));
    } else {
      let nextIndex = (playerIndex + 1) % next.players.length;
      while (next.players[nextIndex].eliminated && nextIndex !== playerIndex) nextIndex = (nextIndex + 1) % next.players.length;
      const wrapped = nextIndex <= playerIndex;
      next.activePlayer = nextIndex;
      if (wrapped) {
        next.round += 1;
        if (isPartyMode(next.mode)) advancePartyRound(next);
        // Elimination can happen at the round boundary.
        if (next.status === 'playing') {
          let guard = 0;
          while (next.players[next.activePlayer].eliminated && guard++ < next.players.length) next.activePlayer = (next.activePlayer + 1) % next.players.length;
        }
      }
      if (next.mode === 'wildcard') rotateWildcards(next);
    }
  }
  if (next.status === 'finished' && !next.finishedAt) next.finishedAt = new Date().toISOString();
  return next;
}

export function undoTurn(game) {
  if (!game?.history?.length) return game;
  return { ...clone(game.history.at(-1).before), history: game.history.slice(0, -1) };
}

export function getStatus(game, playerIndex = game.activePlayer) {
  const player = game.players[playerIndex];
  if (isPartyMode(game.mode)) {
    const status = getPartyStatus(game, playerIndex);
    return `${status.label}: ${status.value} · ${status.detail}`;
  }
  if (isX01(game.mode)) return player.opened ? `${game.outRule === 'open' ? 'Any segment' : game.outRule === 'double' ? 'A double' : 'A double, triple or bull'} to finish` : `${game.inRule === 'double' ? 'Double or bull' : 'Double, triple or bull'} to open`;
  if (game.mode === 'doubledown') {
    const remaining = game.doubleTargets.filter((_, index) => !player.doubleHits[index]);
    if (remaining.length) return `Double in: ${remaining.map(number => `D${number}`).join(' + ')}`;
    if (closed(game, player)) return 'Finish on D1';
    return 'Close 15–20, then D1';
  }
  if (game.mode === 'teamcricket') return `Team ${player.team + 1} · ${game.teamScores[player.team]} points`;
  if (game.mode === 'cutthroat') return 'Close every target · lowest score wins';
  if (game.mode === 'quickcricket') return 'Close every target · beat the clock';
  return `Close every target${game.spreadLimit ? ` · ${game.spreadLimit}-point spread` : ''}`;
}

const scoringDarts = [
  ...Array.from({ length: 20 }, (_, i) => ({ number: 20 - i, multiplier: 3 })),
  { number: 25, multiplier: 2 },
  ...Array.from({ length: 20 }, (_, i) => ({ number: 20 - i, multiplier: 2 })),
  { number: 25, multiplier: 1 },
  ...Array.from({ length: 20 }, (_, i) => ({ number: 20 - i, multiplier: 1 })),
];
/** Returns a shortest legal route within the darts remaining, or null. Boolean rules remain supported. */
export function getCheckout(score, outRule = true, bullMode = 'split', maxDarts = 3) {
  const rule = typeof outRule === 'boolean' ? (outRule ? 'double' : 'open') : outRule;
  if (!Number.isInteger(maxDarts) || maxDarts < 1 || maxDarts > 3) return null;
  if (!['open', 'double', 'master'].includes(rule) || !Number.isInteger(score) || score < 1 || score > (rule === 'double' ? 170 : 180)) return null;
  const finishes = scoringDarts.filter(dart => meetsRule(dart, rule));
  const value = dart => dartValue(dart, bullMode);
  const exactFinish = remaining => finishes.find(dart => value(dart) === remaining);
  const single = exactFinish(score);
  if (single) return [dartLabel(single)];
  if (maxDarts === 1) return null;
  for (const first of scoringDarts) {
    const remaining = score - value(first);
    if (remaining <= 0 || (rule !== 'open' && remaining === 1)) continue;
    const last = exactFinish(remaining);
    if (last) return [dartLabel(first), dartLabel(last)];
  }
  if (maxDarts === 2) return null;
  for (const first of scoringDarts) {
    const remaining = score - value(first);
    if (remaining <= 0 || (rule !== 'open' && remaining === 1)) continue;
    for (const second of scoringDarts) {
      const finalScore = remaining - value(second);
      if (finalScore <= 0 || (rule !== 'open' && finalScore === 1)) continue;
      const last = exactFinish(finalScore);
      if (last) return [dartLabel(first), dartLabel(second), dartLabel(last)];
    }
  }
  return null;
}
