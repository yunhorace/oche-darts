import { MODES, createGame, recordTurn, undoTurn, getCheckout, dartLabel, isX01, getTargets, getStatus } from './engine.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
 undo:'<path d="M4 4v6h6M4 10a8 8 0 1 1-1 7"/>',
 history:'<path d="M3 4v6h6M3 10a9 9 0 1 1 0 5m9-8v5l3 2"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
 cup:'<path d="M8 3h8v7a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 1h8"/>',
 dart:'<path d="m4 20 11-11m-5 2 3 3m0-6 1-5 3 4 4 3-5 1m-3-3 3 3"/>',
 shuffle:'<path d="m4 5 16 14m-4 0h4v-4M4 19l5-5m6-5 5-4m-4 0h4v4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.target}</svg>`;
const palette = ['#d86643','#628477','#b89452','#7d79a5','#5b8ea6','#bc7690','#8e9271','#937966'];
const KEY = 'oche-v1';
const emptyStore = () => ({game:null, matches:[], names:['Player 1','Player 2'], pending:null});
let store = emptyStore();
let storageOK = true;
function validGame(g, requireUndo = false) {
  const m=MODES.find(m=>m.id===g?.mode);
  return !!m && typeof g.id==='string' && Array.isArray(g.players) && g.players.length>=m.minPlayers && g.players.length<=m.maxPlayers
    && g.players.every(p=>p && typeof p.name==='string' && Number.isFinite(p.score) && p.marks && Number.isFinite(p.darts))
    && Array.isArray(g.history) && g.history.every(h=>h && Array.isArray(h.darts) && (!requireUndo || h.before) && typeof h.playerName==='string')
    && Array.isArray(g.winners) && g.winners.every(i=>Number.isInteger(i)&&i>=0&&i<g.players.length)
    && Number.isInteger(g.activePlayer) && !!g.players[g.activePlayer] && Number.isInteger(g.round)
    && ['playing','finished'].includes(g.status) && Array.isArray(g.cricketNumbers)
    && (!['hammer','teamhammer','bermuda'].includes(g.mode)||Array.isArray(g.partyTargets))
    && (g.mode!=='doubledown'||Array.isArray(g.doubleTargets)) && (g.mode!=='tictac'||Array.isArray(g.ticTac))
    && Number.isFinite(Date.parse(g.createdAt));
}
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    if(Array.isArray(saved.names) && saved.names.length>0 && saved.names.length<=8 && saved.names.every(n=>typeof n==='string'&&n.trim()&&n.length<=24)) store.names=saved.names;
    if(Array.isArray(saved.matches)) store.matches=saved.matches.filter(g=>validGame(g)&&g.status==='finished').slice(-30);
    if(validGame(saved.game,true)) store.game=saved.game;
    const draft=saved.pending;
    if(store.game?.status==='playing' && draft?.gameId===store.game.id && draft.playerIndex===store.game.activePlayer && Array.isArray(draft.darts) && draft.darts.length>0 && draft.darts.length<=3) {
      try {
        const result=recordTurn(store.game,draft.darts);
        if(result.history.at(-1).darts.length===draft.darts.length) store.pending={gameId:draft.gameId,playerIndex:draft.playerIndex,darts:result.history.at(-1).darts};
      } catch { /* Discard invalid drafts while preserving the saved match. */ }
    }
  }
} catch { storageOK = false; }
let view = store.game ? 'game' : 'setup';
let mode = '501', category = '01', names = [...store.names], inRule = 'open', outRule = 'open', bullMode = 'split', rounds = 8, hammerMaster = false;
let pending = store.pending?.darts ?? [], multiplier = 1, toastTimeout;
const meta = id => MODES.find(m => m.id === id) || MODES[0];
const categoryNames = {'01':'01 games',cricket:'Cricket',party:'Party games',practice:'Practice'};
function save() {
  store.pending=pending.length&&store.game?.status==='playing'?{gameId:store.game.id,playerIndex:store.game.activePlayer,darts:pending.map(d=>({...d}))}:null;
  try { localStorage.setItem(KEY, JSON.stringify(store)); storageOK = true; return true; }
  catch { storageOK = false; toast('Storage is unavailable or full. Keep this tab open to preserve your game.'); return false; }
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}
function avatar(name, index) { return `<span class="avatar" style="--player-color:${palette[index%8]}">${esc(name.trim().slice(0,1).toUpperCase() || index+1)}</span>`; }
function board() {
  const order = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
  const pt = (r, a) => [200+r*Math.cos(a*Math.PI/180),200+r*Math.sin(a*Math.PI/180)];
  const wedge = (inner, outer, a, b) => {const p=pt(outer,a),q=pt(outer,b),r=pt(inner,b),s=pt(inner,a);return `M${p} A${outer},${outer} 0 0 1 ${q} L${r} A${inner},${inner} 0 0 0 ${s} Z`;};
  return `<svg class="dartboard" viewBox="0 0 400 400" role="img" aria-label="Illustration of a classic dartboard"><circle cx="200" cy="200" r="198" fill="#dbd7cb"/><circle cx="200" cy="200" r="190" fill="#282e2b"/><circle cx="200" cy="200" r="181" fill="none" stroke="#62655c"/>${order.map((n,i)=>{
    const a=i*18-99,b=a+18,t=pt(173,i*18-90);
    return `<path d="${wedge(15,156,a,b)}" fill="${i%2?'#e5dfcd':'#303b34'}" stroke="#8c8b76" stroke-width=".8"/><path d="${wedge(146,156,a,b)}" fill="${i%2?'#8c9e82':'#d76a48'}" stroke="#bbb49d" stroke-width=".6"/><path d="${wedge(91,101,a,b)}" fill="${i%2?'#8c9e82':'#d76a48'}" stroke="#bbb49d" stroke-width=".6"/><text x="${t[0]}" y="${t[1]}" fill="#eae7d9" font-size="15" text-anchor="middle" dominant-baseline="central" font-family="Arial,sans-serif">${n}</text>`;
  }).join('')}<circle cx="200" cy="200" r="15" fill="#8c9e82" stroke="#bbb49d"/><circle cx="200" cy="200" r="6" fill="#d76a48" stroke="#bbb49d"/></svg>`;
}
function header() {
 return `<header class="header"><button class="brand" data-action="home" aria-label="Oche home">${icon('target')}oche<span class="brand-dot">.</span></button><nav aria-label="Main navigation"><button class="nav-link ${view!=='history'?'active':''}" data-action="play">${icon('dart')}<span>Let's play</span></button><button class="nav-link ${view==='history'?'active':''}" data-action="history">${icon('history')}<span>Match history</span></button></nav><div class="saved-status"><span class="status-dot"></span>${storageOK?'Saved on this device':'Session only'}</div></header>`;
}
function footer() {return `<footer><span>Less counting. More darts.</span><div class="footer-links"><button data-action="data">Saved data</button><button data-action="about">Made for a good night ${icon('arrow')}</button></div></footer>`;}
function render() {
  $('#app').innerHTML = `${header()}<main id="main">${view==='setup'?setup():view==='history'?historyView():gameView()}</main>${footer()}`;
  updateTimer();
}
function optionSelect(label, name, options, current) {return `<label class="field-label">${label}<select data-setting="${name}">${options.map(([value,text])=>`<option value="${value}" ${String(current)===String(value)?'selected':''}>${text}</option>`).join('')}</select></label>`;}
function setup() {
  const selected=meta(mode), modes=MODES.filter(m=>(m.category||'01')===category);
  const min=selected.minPlayers||1,max=selected.maxPlayers||8;
  const valid=names.length>=min&&names.length<=max;
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span></span> YOUR TABLE. YOUR GAME.</div><h1>Good company.<br><em>Better aim.</em></h1><p>The simple scorer for a proper game of darts.<br> Bring your friends. We’ll keep count.</p><div class="hero-meta"><span>${icon('users')} Up to 8 players</span><span class="meta-divider"></span><span>No account needed</span></div></div><div class="hero-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-label top">A LITTLE FRIENDLY COMPETITION</span>${board()}<span class="art-label bottom">EST. TONIGHT &nbsp; ↗</span><span class="art-spark">✳</span></div></section>
  ${store.game?`<div class="resume-banner"><div>${icon('dart')}<span>Your ${esc(meta(store.game.mode).name)} game is waiting.</span></div><button data-action="resume">Resume game ${icon('arrow')}</button></div>`:''}
  <section class="setup-layout"><div class="game-picker"><div class="section-heading"><div><span class="step">01</span><h2>Pick your game</h2></div><button class="text-button" data-action="rules">How to play ${icon('info')}</button></div><div class="category-tabs" role="group" aria-label="Game categories">${Object.entries(categoryNames).map(([id,label])=>`<button data-category="${id}" class="${category===id?'selected':''}" aria-pressed="${category===id}">${label}</button>`).join('')}</div><div class="mode-grid">${modes.map(m=>`<button class="mode-card ${mode===m.id?'selected':''}" data-mode="${m.id}" aria-pressed="${mode===m.id}"><span class="selection-dot">${mode===m.id?icon('check'):''}</span><strong class="${/^\d+$/.test(m.name)?'mode-number':''}">${esc(m.name)}</strong><span>${esc(m.short)}</span>${m.id==='501'?'<span class="popular">THE CLASSIC</span>':''}</button>`).join('')}</div><div class="mode-explainer">${icon('info')}<p>${esc(selected.description)} <span>${min===max?min:`${min}–${max}`} player${max!==1?'s':''}.</span></p></div><div class="game-options">${isX01(mode)&&!['countdown','501quickie'].includes(mode)?optionSelect('Start with','inRule',[['open','Open in'],['double','Double in'],['master','Master in']],inRule)+optionSelect('Finish with','outRule',[['open','Open out'],['double','Double out'],['master','Master out']],outRule):''}${['gotcha','501quickie'].includes(mode)?optionSelect('Finish with','outRule',[['open','Open out'],['master','Master out']],outRule):''}${mode==='countup'?optionSelect('Number of rounds','rounds',[[5,'5 rounds'],[8,'8 rounds'],[10,'10 rounds'],[15,'15 rounds']],rounds):''}${['hammer','teamhammer'].includes(mode)?optionSelect('Scoring targets','hammerMaster',[[false,'Any segment'],[true,'Triples only']],hammerMaster):''}${!['cricket','cutthroat','teamcricket','wildcard','cricketquickie','doubledown','quickcricket','tictac','shark'].includes(mode)?optionSelect('Bull scoring','bullMode',[['split','Outer 25 · Inner 50'],['full','Both score 50']],bullMode):''}</div></div>
  <div class="players-panel"><div class="section-heading"><div><span class="step">02</span><h2>Meet the players</h2></div><span class="player-count">${names.length} / 8</span></div><p class="section-description">Your names. Your throwing order.</p><div class="player-inputs">${names.map((name,i)=>`<div class="player-input">${avatar(name,i)}<input aria-label="Player ${i+1} name" data-player="${i}" value="${esc(name)}" maxlength="24" autocomplete="off" spellcheck="false"/><button class="icon-button" data-remove="${i}" aria-label="Remove player ${i+1}" ${names.length===1?'disabled':''}>${icon('close')}</button></div>`).join('')}</div><button class="add-player" data-action="add" ${names.length>=8?'disabled':''}>${icon('plus')} Add a player</button><div class="player-tools"><span>${icon('users')} One phone. Everyone plays.</span><button class="text-button" data-action="shuffle">${icon('shuffle')} Shuffle</button></div>${!valid?`<p class="validation-note">${esc(selected.name)} needs ${min===max?min:`${min}–${max}`} players. Adjust your lineup to play.</p>`:''}<button class="primary start-button" data-action="start" ${!valid?'disabled':''}>Let’s play ${esc(selected.name)} ${icon('arrow')}</button><p class="save-note">${icon('check')} Every entered dart saves on this device.</p></div></section>`;
}
function scoreLabel(game) {return isX01(game.mode)||game.mode==='countdown'?'remaining':game.mode==='shark'?'points this round':'points';}
function playerStats(p) {return `${p.darts?((p.totalScored/p.darts)*3).toFixed(1):'—'} avg · ${p.best} best`;}
function cricketBoard(game) {
  const targets=getTargets(game);
  if (!targets?.length || !['cricket','cutthroat','teamcricket','wildcard','cricketquickie','quickcricket','doubledown'].includes(game.mode)) return '';
  return `<div class="cricket-scroll"><table class="cricket-table"><caption>Target marks</caption><thead><tr><th>Target</th>${game.players.map((p,i)=>`<th class="${i===game.activePlayer?'current':''}">${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${targets.map(n=>`<tr><th>${n===25?'BULL':n}</th>${game.players.map((p,i)=>`<td class="${i===game.activePlayer?'current':''}"><span aria-label="${p.marks[n]||0} marks">${['—','╱','╳','⊗'][Math.min(3,p.marks[n]||0)]}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function gameView() {
  const game=store.game;
  if (!game) {view='setup';return setup();}
  const finished=game.status==='finished';
  let preview;
  try {if(pending.length)preview=recordTurn(game,pending);}catch{}
  const last=preview?.history.at(-1);
  // A round-limit result is provisional until all three darts have been entered.
  const turnEnded=last?.turnEnded;
  const instantWin=turnEnded&&!last?.bust&&preview?.status==='finished';
  const liveGame=isX01(game.mode)&&preview?{...game,players:preview.players}:game;
  const p=liveGame.players[game.activePlayer];
  const dartsLeft=turnEnded?0:3-pending.length;
  const hints=isX01(game.mode)&&!finished&&!turnEnded&&p.opened?getCheckout(p.score,game.outRule,game.bullMode,dartsLeft):null;
  return `<div class="match-top"><div><div class="eyebrow">${finished?'A GAME WELL PLAYED':'LET THE GOOD TIMES THROW'}</div><h1>${esc(meta(game.mode).name)} <span class="match-round">Round ${game.status==='finished'&&game.round>game.rounds&&['countup','bermuda','hammer','teamhammer'].includes(game.mode)?game.rounds:game.round}${['countup','bermuda','hammer','teamhammer','501quickie','cricketquickie'].includes(game.mode)?` / ${game.rounds}`:''}</span></h1></div><div class="match-actions"><button class="secondary" data-action="rules" aria-label="Game rules">${icon('info')}<span>Rules</span></button><button class="secondary" data-action="setup" aria-label="New game">${icon('plus')}<span>New game</span></button><button class="secondary" data-action="end-game" aria-label="${finished?'Close game':'End game'}">${icon('close')}<span>${finished?'Close game':'End game'}</span></button></div></div>
  ${finished?`<div class="winner-banner">${icon('cup')}<div><span>${['teamcricket','teamhammer'].includes(game.mode)&&game.winners.length===2?'A team victory.':game.winners.length>1?'A shared victory.':'That’s the game.'}</span><h2>${game.winners.map(i=>esc(game.players[i].name)).join(' & ')} ${game.winners.length>1?'win!':'wins!'}</h2></div><button class="primary" data-action="rematch">Play again ${icon('arrow')}</button></div>`:''}
  <div class="match-layout"><section class="scoreboard"><div class="section-heading"><h2>The scoreboard</h2><span class="live-label"><span class="status-dot"></span>${finished?'Complete':'In play'}</span></div><div class="score-list">${liveGame.players.map((player,i)=>`<div class="score-card ${!finished&&i===game.activePlayer?'current':''} ${game.winners.includes(i)?'winner':''}">${avatar(player.name,i)}<div class="score-player"><strong>${esc(player.name)}</strong><span>${game.mode==='teamcricket'||game.mode==='teamhammer'?`Team ${i%2+1} · `:''}${!finished&&i===game.activePlayer?'At the oche':playerStats(player)}</span>${game.mode==='shark'?`<span>${player.bites||0} / 6 bites${player.eliminated?' · Out':''}</span>`:''}</div><div class="score-number"><strong>${game.mode==='shark'?player.roundScore:player.score}</strong><span>${scoreLabel(game)}</span></div></div>`).join('')}</div>${game.teamScores?`<div class="team-totals"><span>Team 1 <strong>${game.teamScores[0]}</strong></span><span>Team 2 <strong>${game.teamScores[1]}</strong></span></div>`:''}${cricketBoard(game)}${specialBoard(game)}<div class="recent-turns"><div class="section-heading"><h3>Latest throws</h3><button class="text-button" data-action="turns">View all ${icon('arrow')}</button></div>${game.history.length?game.history.slice(-4).reverse().map(h=>`<div class="turn-row"><span>${esc(h.playerName)}</span><span class="dart-labels">${h.darts.map(d=>esc(dartLabel(d))).join(' · ')}</span><strong class="${h.bust?'bust':''}">${h.bust?'BUST':h.scored}</strong></div>`).join(''):'<div class="empty-turns">The first throw is yours. Make it a good one.</div>'}</div></section>
  <section class="entry-panel">${finished?`<div class="finished-panel">${icon('cup')}<h2>Good darts.<br>Great company.</h2><p>Your result is saved in match history.</p>${game.timed?'<p>Elapsed time: <strong id="elapsed"></strong></p>':''}<div class="final-stats">${game.players.map(player=>`<div><strong>${esc(player.name)}</strong><span>${player.turns} turns · ${player.darts} darts</span><span>${playerStats(player)}</span></div>`).join('')}</div><button class="secondary full-width" data-action="undo">${icon('undo')} Undo final turn</button></div>`:`<div class="entry-heading"><div><span class="eyebrow">YOU’RE UP</span><h2>${esc(p.name)}</h2></div>${avatar(p.name,game.activePlayer)}</div><div class="target-guidance">${icon('target')}<span>${esc(getStatus(game.mode==='doubledown'&&preview?preview:liveGame,game.activePlayer) || 'Three darts. Make them count.')}</span>${['countdown','quickcricket'].includes(game.mode)?'<strong id="elapsed"></strong>':''}</div>${isX01(game.mode)?`<div class="live-score" role="status" aria-live="polite" aria-atomic="true"><strong>${p.score}</strong><span>remaining<br>${last?.bust?'Bust · turn score restored':instantWin?'Checkout!':`${dartsLeft} dart${dartsLeft===1?'':'s'} left`}</span></div>`:''}${hints?`<div class="checkout-hint"><span>Finish in ${hints.length} dart${hints.length===1?'':'s'}</span><strong>${hints.join(' → ')}</strong></div>`:isX01(game.mode)&&!turnEnded&&p.opened&&p.score<=180&&dartsLeft>0?`<div class="checkout-hint"><span>No finish with ${dartsLeft} dart${dartsLeft===1?'':'s'} left</span></div>`:''}<div class="dart-slots">${[0,1,2].map(i=>`<button class="dart-slot ${pending[i]?'filled':i===pending.length?'next':''}" data-slot="${i}" aria-label="${pending[i]?`Remove dart ${i+1}: ${dartLabel(pending[i])}`:`Dart ${i+1}, empty`}"><span>DART ${i+1}</span><strong>${pending[i]?dartLabel(pending[i]):'—'}</strong></button>`).join('')}</div><div class="multiplier-tabs" role="group" aria-label="Dart multiplier">${[1,2,3].map((n,i)=>`<button data-multiplier="${n}" class="${multiplier===n?'selected':''}" aria-pressed="${multiplier===n}">${['Single','Double','Triple'][i]} <span>×${n}</span></button>`).join('')}</div><div class="number-pad">${Array.from({length:20},(_,i)=>i+1).map(n=>`<button data-number="${n}" ${pending.length>=3||turnEnded?'disabled':''}>${n}</button>`).join('')}</div><div class="bull-pad"><button data-dart="25,1" ${pending.length>=3||turnEnded?'disabled':''}>Outer bull <strong>${game.mode==='shark'?0:game.bullMode==='full'?50:25}</strong></button><button data-dart="25,2" ${pending.length>=3||turnEnded?'disabled':''}>Bullseye <strong>${game.mode==='shark'?0:50}</strong></button><button data-dart="0,1" ${pending.length>=3||turnEnded?'disabled':''}>Miss <strong>0</strong></button></div><div class="turn-total"><span>${last?.bust?(game.mode==='gotcha'?'Bust — overshoot penalty applied':game.mode==='doubledown'?'Wrong finish — turn ends':'Bust — score restored'):instantWin?'The winning throw!':'This turn'}</span><strong class="${last?.bust?'bust':''}">${last?.bust?'BUST':last?last.scored:0}</strong></div><button class="primary full-width" data-action="submit" ${!pending.length?'disabled':''}>${last?.bust?'Record bust':instantWin?'Finish game':pending.length<3&&!turnEnded?'End turn · unused darts are misses':'Next player'} ${icon('arrow')}</button><div class="entry-bottom"><button class="text-button" data-action="undo" ${!game.history.length?'disabled':''}>${icon('undo')} Undo last turn</button><button class="text-button" data-action="clear" ${!pending.length?'disabled':''}>Clear darts</button></div>`}</section></div>`;
}
function specialBoard(game) {
  if(game.mode!=='tictac')return '';
  const cells=game.ticTac||[];
  return `<div class="tic-board">${cells.map((c,i)=>`<div><strong>${esc(typeof c==='number'?(c===25?'BULL':c):(c.number===25?'BULL':c.number))}</strong><span>${c.owner!==undefined&&c.owner!==null?esc(game.players[c.owner]?.name||''):`${c.marks[0]} X · ${c.marks[1]} O`}</span></div>`).join('')}</div>`;
}
function historyView() {
  return `<section class="history-page"><div class="eyebrow">THE NIGHT, REMEMBERED</div><div class="history-heading"><h1>Good games.<br><em>Worth keeping.</em></h1><button class="primary" data-action="setup">New game ${icon('plus')}</button></div><p class="section-description">Your last 30 completed matches, saved on this device.</p>${store.matches.length?`<div class="history-grid">${store.matches.slice().reverse().map(g=>`<button class="history-card" data-match="${esc(g.id)}"><div class="history-card-top"><span class="mode-badge">${esc(meta(g.mode).name)}</span><span>${new Date(g.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div>${icon('cup')}<h2>${g.winners.map(i=>esc(g.players[i].name)).join(' & ')}</h2><p>${['teamcricket','teamhammer'].includes(g.mode)&&g.winners.length===2?'Winning team':g.winners.length>1?'Shared victory':'Winner'} · ${g.history.length} turns</p><div class="history-players">${g.players.map((p,i)=>avatar(p.name,i)).join('')}<span>${g.players.length} players ${icon('arrow')}</span></div></button>`).join('')}</div>`:`<div class="empty-history">${icon('history')}<h2>A clean slate.</h2><p>Finish your first game and the highlights will live here.</p><button class="secondary" data-action="setup">Start a game ${icon('arrow')}</button></div>`}</section>`;
}
function dialog(title,body,actions='') {
  $('#modal').innerHTML=`<div class="dialog-heading"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div>${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
  $('#modal').showModal();
}
function showRules() {
  const m=meta(view==='game'&&store.game?store.game.mode:mode);
  dialog(`How to play ${esc(m.name)}`,`<p>${esc(m.rules||m.description)}</p><div class="rules-tip">${icon('dart')}<p>Enter each dart by choosing Single, Double, or Triple, then its number. Use the separate bull and miss buttons. In 01 games, your remaining score and checkout hint update after each dart. Tap Next player when your turn is over.</p></div><p>Tap a filled dart to remove it. “Undo last turn” restores the previous player and their score.</p><a class="source-link" href="https://www.arachnid360.com/wp-content/uploads/2016/12/G3manrevH.pdf" target="_blank" rel="noopener noreferrer">Game reference: Galaxy 3 manual ↗</a>`);
}
function startGame(rematch=false) {
  if(!rematch&&store.game?.status==='playing') {
    dialog('Start a new game?',`<p>Your current game is still in progress. Starting a new one replaces it.</p>`,`<button class="secondary" data-action="close-modal">Keep playing</button><button class="primary" data-action="confirm-start">Start new game</button>`);return;
  }
  actuallyStart(rematch);
}
function actuallyStart(rematch=false) {
  try {
    const g=store.game;
    store.game=createGame(rematch?{mode:g.mode,players:g.players.map(p=>p.name),inRule:g.inRule,outRule:g.outRule,bullMode:g.bullMode,rounds:g.rounds,hammerMaster:g.hammerMaster,masterOut:g.masterOut}:{mode,players:names,inRule,outRule,bullMode:['cricket','cutthroat','teamcricket','wildcard','cricketquickie','doubledown','quickcricket','tictac','shark'].includes(mode)?'split':bullMode,rounds,hammerMaster,masterOut:outRule==='master'});
    store.names=store.game.players.map(p=>p.name);names=[...store.names];pending=[];multiplier=1;view='game';save();render();window.scrollTo({top:0,behavior:'smooth'});
  } catch(e){toast(e.message);}
}
function syncMatch() {
  const g=store.game;
  store.matches=store.matches.filter(m=>m.id!==g.id);
  if(g.status==='finished')store.matches.push({...g,history:g.history.map(({before,...turn})=>turn)});
  store.matches=store.matches.slice(-30);
  save();
}
function addDart(number,mult) {
  if(pending.length>=3)return;
  pending.push({number,multiplier:mult});multiplier=1;save();render();
}
function updateTimer(){if($('#elapsed')&&store.game){const seconds=Math.floor(((store.game.finishedAt?new Date(store.game.finishedAt).getTime():Date.now())-new Date(store.game.createdAt).getTime())/1000);$('#elapsed').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}}
setInterval(updateTimer,1000);
document.addEventListener('input',event=>{if(event.target.matches('[data-player]')){names[Number(event.target.dataset.player)]=event.target.value;event.target.previousElementSibling.textContent=event.target.value.trim().slice(0,1).toUpperCase()||Number(event.target.dataset.player)+1;}});
document.addEventListener('change',event=>{
 const setting=event.target.dataset.setting,value=event.target.value;
 if(setting==='inRule')inRule=value;if(setting==='outRule')outRule=value;if(setting==='bullMode')bullMode=value;if(setting==='rounds')rounds=Number(value);if(setting==='hammerMaster')hammerMaster=value==='true';
});
document.addEventListener('click',event=>{
 const el=event.target.closest('button');if(!el||el.disabled)return;
 if(el.dataset.category){category=el.dataset.category;mode=MODES.find(m=>m.category===category).id;render();return;}
 if(el.dataset.mode){mode=el.dataset.mode;render();return;}
 if(el.dataset.remove!==undefined){names.splice(Number(el.dataset.remove),1);render();return;}
 if(el.dataset.multiplier){multiplier=Number(el.dataset.multiplier);render();return;}
 if(el.dataset.number){addDart(Number(el.dataset.number),multiplier);return;}
 if(el.dataset.dart){addDart(...el.dataset.dart.split(',').map(Number));return;}
 if(el.dataset.slot!==undefined){if(pending[Number(el.dataset.slot)]){pending.splice(Number(el.dataset.slot),1);save();render();}return;}
 if(el.dataset.match){const g=store.matches.find(m=>m.id===el.dataset.match);dialog(esc(meta(g.mode).name)+' · Match result',`<p>${g.players.map(p=>`${esc(p.name)}: <strong>${p.score}</strong>`).join('<br>')}</p><p>${g.history.length} turns played.${g.timed?` Elapsed: ${((Date.parse(g.finishedAt)-Date.parse(g.createdAt))/1000).toFixed(1)} seconds.`:''}</p>`,`<button class="secondary danger-text" data-delete-match="${esc(g.id)}">Delete match</button>`);return;}
 if(el.dataset.deleteMatch){dialog('Delete this match?','<p>This result will be removed from match history on this device.</p>',`<button class="secondary" data-action="close-modal">Keep match</button><button class="primary" data-confirm-delete-match="${esc(el.dataset.deleteMatch)}">Delete match</button>`);return;}
 if(el.dataset.confirmDeleteMatch){const id=el.dataset.confirmDeleteMatch;store.matches=store.matches.filter(m=>m.id!==id);if(store.game?.id===id&&store.game.status==='finished'){store.game=null;pending=[];}const persisted=save();$('#modal').close();view='history';render();toast(persisted?'Match deleted.':'Removed for this session only. Browser storage could not be updated.');return;}
 switch(el.dataset.action){
  case 'home':case 'setup':view='setup';render();window.scrollTo({top:0,behavior:'smooth'});break;
  case 'play':view=store.game?'game':'setup';render();break;
  case 'history':view='history';render();break;
  case 'resume':view='game';render();break;
  case 'add':if(names.length<8){names.push(`Player ${names.length+1}`);render();const input=$(`[data-player="${names.length-1}"]`);input.focus();input.select();}break;
  case 'shuffle':for(let i=names.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[names[i],names[j]]=[names[j],names[i]];}render();toast('Throwing order shuffled.');break;
  case 'rules':showRules();break;
  case 'start':startGame();break;
  case 'confirm-start':$('#modal').close();actuallyStart();break;
  case 'rematch':startGame(true);break;
  case 'close-modal':$('#modal').close();break;
  case 'clear':pending=[];save();render();break;
  case 'undo':pending=[];store.game=undoTurn(store.game);syncMatch();render();toast('Last turn undone.');break;
  case 'submit':try{let darts=[...pending];const p=recordTurn(store.game,darts);if(!p.history.at(-1).turnEnded){while(darts.length<3)darts.push({number:0,multiplier:1});}store.game=recordTurn(store.game,darts);pending=[];multiplier=1;syncMatch();render();toast(store.game.status==='finished'?'Game saved. Good darts!':`${store.game.players[store.game.activePlayer].name}, you’re up.`);}catch(e){toast(e.message);}break;
  case 'turns':dialog('Every throw',store.game.history.length?`<div class="all-turns">${store.game.history.slice().reverse().map(h=>`<div class="turn-row"><span>R${h.round} · ${esc(h.playerName)}</span><span>${h.darts.map(d=>esc(dartLabel(d))).join(' · ')}</span><strong>${h.bust?'BUST':h.scored}</strong></div>`).join('')}</div>`:'<p>No turns recorded yet.</p>');break;
  case 'end-game':dialog(store.game.status==='finished'?'Close this game?':'End this game?',store.game.status==='finished'?'<p>Your completed result stays in match history.</p>':'<p>This removes the current game and its entered darts. Your saved player names and completed matches will stay.</p>',`<button class="secondary" data-action="close-modal">Cancel</button><button class="primary" data-action="confirm-end-game">${store.game.status==='finished'?'Close game':'End game'}</button>`);break;
  case 'confirm-end-game':{store.game=null;pending=[];multiplier=1;const persisted=save();$('#modal').close();view='setup';render();toast(persisted?'Game closed.':'Game closed for this session only. Browser storage could not be updated.');break;}
  case 'data':dialog('Saved on this device',`<p>Your game, entered darts, player names, and last 30 completed matches stay in this browser on this device. Scores and player names are not uploaded to GitHub or shared with other players.</p><p>Close the tab whenever you like. Open this same link in the same browser to resume. Another phone or browser has its own games.</p><p>To remove a result, open it in Match history and choose Delete match. End game removes your current game. Clearing browser site data or leaving private browsing can also erase your saved games.</p>`,`<button class="secondary danger-text" data-action="clear-data">Clear all saved data</button>`);break;
  case 'clear-data':dialog('Clear all saved data?','<p>This removes the current game, entered darts, all match history, and saved player names from this browser. This cannot be undone.</p>',`<button class="secondary" data-action="close-modal">Keep data</button><button class="primary" data-action="confirm-clear-data">Clear saved data</button>`);break;
  case 'confirm-clear-data':try{localStorage.removeItem(KEY);store=emptyStore();pending=[];names=[...store.names];multiplier=1;storageOK=true;view='setup';$('#modal').close();render();toast('All Oche game data cleared from this browser.');}catch{toast('Could not remove saved data. Please use your browser’s site-data settings.');}break;
  case 'about':dialog('A good night of darts.',`<p>Oche (say “ockey”) is the line you throw from. This one is a place to keep your game moving.</p><p>One phone, up to eight friends, and a game menu inspired by the original Arachnid Galaxy 3 sold in New York. Player limits follow each game. No accounts, no ads.</p><p>Games and results stay in this browser. Clearing browser data removes them.</p><a class="source-link" href="https://www.arachnid360.com/wp-content/uploads/2016/12/G3manrevH.pdf" target="_blank" rel="noopener noreferrer">Explore the game reference ↗</a>`);break;
 }
});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#modal').close();}});
render();
