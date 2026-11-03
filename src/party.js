/** Arcade party rules. Mutating helpers operate only on the engine's cloned state. */
export const PARTY_MODES = Object.freeze([
  { id: 'hammer', name: 'Hammer Cricket', short: 'Hit or take the hammer', description: 'Changing targets, increasing dart values, and a penalty for missing.', minPlayers: 2, maxPlayers: 4, rules: 'Hit the round target. Dart values increase ×1/×2/×3, then ×1/×3/×5 in round 9. Missing costs three target values. A tie adds a round, then uses MPR.' },
  { id: 'teamhammer', name: 'Team Hammer', short: 'Two teams. One hammer.', description: 'Combine scores with your teammate across nine target rounds.', minPlayers: 4, maxPlayers: 4, rules: 'Hammer scoring with players 1 + 3 against 2 + 4. Team totals decide the winner.' },
  { id: 'countup', name: 'Count Up', short: 'Every dart counts', description: 'Build the highest score over a set number of rounds.', minPlayers: 1, maxPlayers: 8, rules: 'Every hit adds points. Highest total after the selected rounds wins.' },
  { id: 'gotcha', name: 'Gotcha!', short: 'Catch them at zero', description: 'Reach 301 while matching rivals to wipe out their scores.', minPlayers: 2, maxPlayers: 4, rules: 'Reach exactly 301. Match an opponent to reset them. Overshooting deducts the excess from your turn-start score and cancels this turn’s bombs.' },
  { id: 'bermuda', name: 'Bermuda Triangle', short: 'Keep your score afloat', description: 'Thirteen targets. Miss a whole turn and your score halves.', minPlayers: 1, maxPlayers: 8, rules: 'Only the round target scores. Missing all darts halves your total, rounded down.' },
  { id: 'tictac', name: 'Tic Tac Darts', short: 'Make your mark', description: 'Claim numbered squares and connect three in a row.', minPlayers: 2, maxPlayers: 2, rules: 'Four marks claim a square. Three squares in a line wins. If neither player can form a line, highest score wins.' },
  { id: 'shark', name: 'Shark Tank', short: 'Stay ahead. Stay afloat.', description: 'Win each round to protect your six-bite surfboard.', minPlayers: 2, maxPlayers: 4, rules: 'Bulls score zero. Trailing players take bites; six eliminates you. Tied leaders bite everyone. Last survivor wins; simultaneous elimination shares the win among that round’s leaders.' },
].map(mode => Object.freeze({ ...mode, category: ['hammer', 'teamhammer'].includes(mode.id) ? 'cricket' : 'party' })));

const IDS = new Set(PARTY_MODES.map(mode => mode.id));
const BERMUDA = [12, 13, 14, 'double', 15, 16, 17, 'triple', 18, 19, 20, 'bull', 'doubleBull'];
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export const isPartyMode = id => IDS.has(id);
const randomTarget = () => [...Array.from({ length: 9 }, (_, i) => i + 12), 25][Math.floor(Math.random() * 10)];
const points = (game, dart) => dart.number === 25 && game.bullMode === 'full' ? 50 : dart.number * dart.multiplier;
const marks = (game, dart) => dart.number === 25 && game.bullMode === 'full' ? 1 : dart.multiplier;
const winner = (game, indexes) => { game.status = 'finished'; game.winners = indexes; game.winner = indexes.length === 1 ? indexes[0] : null; };
const highest = game => {
  const high = Math.max(...game.players.map(p => p.score));
  return game.players.flatMap((p, i) => p.score === high ? [i] : []);
};
const teamTotals = game => [0, 1].map(team => game.players.reduce((sum, p) => sum + (p.team === team ? p.score : 0), 0));

export function initParty(game, options = {}) {
  game.players.forEach(player => { player.score = 0; });
  if (game.mode === 'hammer' || game.mode === 'teamhammer') {
    game.hammerMaster = Boolean(options.hammerMaster);
    game.partyTargets = [20, 19, 18, 17, 16, 15, 25, randomTarget(), randomTarget()];
    game.hammerTieTarget = randomTarget();
    game.rounds = 9;
    game.players.forEach((p, i) => { p.hammerMarks = 0; if (game.mode === 'teamhammer') p.team = i % 2; });
    if (game.mode === 'teamhammer') game.teamScores = [0, 0];
  } else if (game.mode === 'bermuda') {
    game.partyTargets = [...BERMUDA];
    game.rounds = 13;
  } else if (game.mode === 'gotcha') {
    game.masterOut = Boolean(options.masterOut);
  } else if (game.mode === 'tictac') {
    const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    const selected = numbers.slice(0, 8); selected.splice(4, 0, 25);
    game.ticTac = selected.map(number => ({ number, owner: null, marks: [0, 0] }));
  } else if (game.mode === 'shark') {
    game.players.forEach(p => { p.bites = 0; p.eliminated = false; p.roundScore = 0; });
  }
  if (game.partyTargets) game.partyTarget = game.partyTargets[0];
}

function beginsTurn(game, player) {
  game.partyTurn = { startScore: player.score, scores: game.players.map(p => p.score), hits: 0, scored: 0 };
  if (game.mode === 'shark') player.roundScore = 0;
}

function matchesBermuda(target, dart) {
  if (target === 'double') return dart.multiplier === 2;
  if (target === 'triple') return dart.multiplier === 3;
  if (target === 'bull') return dart.number === 25;
  if (target === 'doubleBull') return dart.number === 25 && dart.multiplier === 2;
  return dart.number === target;
}

export function scorePartyDart(game, player, dart, dartIndex) {
  if (dartIndex === 0) beginsTurn(game, player);
  const turn = game.partyTurn;
  const value = points(game, dart);
  const index = game.activePlayer;
  let scored = 0;
  if (game.mode === 'countup') {
    scored = value; player.score += scored;
  } else if (game.mode === 'hammer' || game.mode === 'teamhammer') {
    const valid = dart.number === game.partyTarget && (!game.hammerMaster || dart.multiplier === 3 || (dart.number === 25 && dart.multiplier === 2));
    if (valid) {
      const factor = game.round === 9 ? [1, 3, 5][dartIndex] : dartIndex + 1;
      scored = value * factor;
      player.score += scored;
      player.hammerMarks += marks(game, dart);
      turn.hits += 1;
    }
  } else if (game.mode === 'gotcha') {
    const nextScore = player.score + value;
    const wrongFinish = nextScore === 301 && game.masterOut && dart.multiplier === 1 && dart.number !== 25;
    if (nextScore > 301 || wrongFinish) {
      // Bombs from an earlier dart in this same turn do not survive a bust.
      game.players.forEach((p, i) => { p.score = turn.scores[i]; });
      player.score = turn.startScore - Math.max(0, nextScore - 301);
      const delta = player.score - turn.startScore;
      return { scored: delta - turn.scored, bust: true, endTurn: true };
    }
    player.score = nextScore;
    scored = value;
    if (value > 0) game.players.forEach((p, i) => { if (i !== index && p.score === nextScore) p.score = 0; });
    if (nextScore === 301) winner(game, [index]);
  } else if (game.mode === 'bermuda') {
    if (dart.number !== 0 && matchesBermuda(game.partyTarget, dart)) {
      scored = value; player.score += scored; turn.hits += 1;
    }
  } else if (game.mode === 'tictac') {
    const cell = game.ticTac.find(cell => cell.number === dart.number);
    if (cell && cell.owner === null) {
      scored = value; player.score += scored;
      cell.marks[index] = Math.min(4, cell.marks[index] + marks(game, dart));
      if (cell.marks[index] >= 4) cell.owner = index;
      if (LINES.some(line => line.every(i => game.ticTac[i].owner === index))) winner(game, [index]);
      else if (![0, 1].some(p => LINES.some(line => line.every(i => game.ticTac[i].owner === null || game.ticTac[i].owner === p)))) winner(game, highest(game));
    }
  } else if (game.mode === 'shark') {
    scored = dart.number === 25 ? 0 : value;
    player.roundScore += scored; player.score += scored;
  }
  turn.scored += scored;
  return { scored };
}

export function finishPartyTurn(game, player) {
  const turn = game.partyTurn;
  if (!turn) return;
  const before = player.score;
  if ((game.mode === 'hammer' || game.mode === 'teamhammer') && turn.hits === 0) {
    player.score -= 3 * game.partyTarget;
  } else if (game.mode === 'bermuda' && turn.hits === 0) {
    player.score = Math.floor(player.score / 2);
  }
  if (game.mode === 'teamhammer') game.teamScores = teamTotals(game);
  delete game.partyTurn;
  return { scored: player.score - before };
}

function finishHammer(game) {
  let candidates;
  if (game.mode === 'teamhammer') {
    game.teamScores = teamTotals(game);
    const max = Math.max(...game.teamScores);
    candidates = [0, 1].filter(i => game.teamScores[i] === max);
  } else candidates = highest(game);
  if (candidates.length > 1 && game.round === 10) {
    game.partyTargets.push(game.hammerTieTarget); game.rounds = 10;
    game.partyTarget = game.partyTargets[9]; game.tieBreak = true;
    return;
  }
  if (candidates.length > 1) {
    const mpr = candidate => {
      const players = game.mode === 'teamhammer' ? game.players.filter(p => p.team === candidate) : [game.players[candidate]];
      const darts = players.reduce((sum, p) => sum + p.darts, 0);
      return darts ? players.reduce((sum, p) => sum + p.hammerMarks, 0) * 3 / darts : 0;
    };
    const best = Math.max(...candidates.map(mpr));
    candidates = candidates.filter(i => mpr(i) === best);
  }
  winner(game, game.mode === 'teamhammer' ? game.players.flatMap((p, i) => candidates.includes(p.team) ? [i] : []) : candidates);
}

export function advancePartyRound(game) {
  if (game.mode === 'shark') {
    const alive = game.players.flatMap((p, i) => !p.eliminated ? [i] : []);
    const best = Math.max(...alive.map(i => game.players[i].roundScore));
    const leaders = alive.filter(i => game.players[i].roundScore === best);
    game.lastSharkRound = alive.map(i => {
      const p = game.players[i];
      const bites = leaders.length > 1 ? 1 : leaders.includes(i) ? 0 : best >= 2 * p.roundScore ? 2 : 1;
      p.bites = Math.min(6, p.bites + bites); p.eliminated = p.bites >= 6;
      return { playerIndex: i, score: p.roundScore, bites };
    });
    const survivors = alive.filter(i => !game.players[i].eliminated);
    if (survivors.length <= 1) winner(game, survivors.length ? survivors : leaders);
    else game.players.forEach(p => { p.roundScore = 0; });
  } else if (game.mode === 'hammer' || game.mode === 'teamhammer') {
    if (game.round > game.rounds) finishHammer(game);
    else game.partyTarget = game.partyTargets[game.round - 1];
  } else if (game.mode === 'countup' || game.mode === 'bermuda') {
    if (game.round > game.rounds) winner(game, highest(game));
    else if (game.partyTargets) game.partyTarget = game.partyTargets[game.round - 1];
  }
}

export function getPartyStatus(game, playerIndex = game.activePlayer) {
  const player = game.players[playerIndex];
  if (game.mode === 'hammer' || game.mode === 'teamhammer') return { label: 'Round target', value: game.partyTarget === 25 ? 'BULL' : `${game.hammerMaster ? 'T' : ''}${game.partyTarget}`, detail: `${game.tieBreak ? 'Tie-break · ' : ''}Darts ×${game.round === 9 ? '1 / 3 / 5' : '1 / 2 / 3'} · miss all: −${3 * game.partyTarget}` };
  if (game.mode === 'bermuda') return { label: 'Round target', value: ({ double: 'DOUBLE', triple: 'TRIPLE', bull: 'BULL', doubleBull: 'INNER BULL' })[game.partyTarget] ?? String(game.partyTarget), detail: 'Miss every dart and your score is halved.' };
  if (game.mode === 'gotcha') return { label: 'To reach 301', value: String(301 - player.score), detail: game.masterOut ? 'Finish on a double, triple, or bull.' : 'Match a rival’s total to reset their score.' };
  if (game.mode === 'tictac') return { label: 'Your mark', value: playerIndex === 0 ? 'X' : 'O', detail: 'Four marks claim a square. Connect three to win.' };
  if (game.mode === 'shark') return { label: 'Bites remaining', value: String(6 - player.bites), detail: 'Score highest this round. Bulls score zero.' };
  return { label: 'Rounds', value: `${Math.min(game.round, game.rounds)} / ${game.rounds}`, detail: 'Every dart adds to your total.' };
}
