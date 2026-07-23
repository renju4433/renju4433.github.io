// CFR+ solver for small limit poker games (Kuhn poker, Leduc hold'em).
// Same algorithm family that solved heads-up limit hold'em (Cepheus, 2015),
// run on games small enough to solve exactly in a browser.

const RANK_NAMES = ['J', 'Q', 'K'];
const ACTION_NAMES = { c: 'Check', b: 'Bet', f: 'Fold', k: 'Call', r: 'Raise' };

// ---- Game definitions -------------------------------------------------

function makeKuhn() {
  return {
    id: 'kuhn',
    label: 'Kuhn poker',
    rounds: 1,
    betSizes: [1],
    maxBets: 1,
    deck: [0, 1, 2],
    hasCommunity: false,
    ante: 1,
  };
}

function makeLeduc() {
  return {
    id: 'leduc',
    label: "Leduc hold'em",
    rounds: 2,
    betSizes: [2, 4],
    maxBets: 2,
    deck: [0, 0, 1, 1, 2, 2],
    hasCommunity: true,
    ante: 1,
  };
}

// Enumerate deals by rank with multiplicity weights.
function enumDeals(game) {
  const counts = {};
  for (const r of game.deck) counts[r] = (counts[r] || 0) + 1;
  const ranks = Object.keys(counts).map(Number);
  const avail = (r, taken) => counts[r] - taken.filter((x) => x === r).length;
  const deals = [];
  for (const c0 of ranks) {
    const w0 = avail(c0, []);
    if (w0 <= 0) continue;
    for (const c1 of ranks) {
      const w1 = avail(c1, [c0]);
      if (w1 <= 0) continue;
      if (!game.hasCommunity) {
        deals.push({ cards: [c0, c1], community: null, weight: w0 * w1 });
      } else {
        for (const cc of ranks) {
          const w2 = avail(cc, [c0, c1]);
          if (w2 <= 0) continue;
          deals.push({ cards: [c0, c1], community: cc, weight: w0 * w1 * w2 });
        }
      }
    }
  }
  return deals;
}

// ---- Game mechanics ----------------------------------------------------

function initialState(game) {
  return {
    round: 0,
    hist: [''],
    toAct: 0,
    contrib: [game.ante, game.ante],
    betsThisRound: 0,
    outstanding: 0,
    folded: null,
    terminal: false,
  };
}

function legalActions(game, s) {
  if (s.outstanding > 0) {
    return s.betsThisRound < game.maxBets ? ['f', 'k', 'r'] : ['f', 'k'];
  }
  return ['c', 'b'];
}

function endRound(game, ns) {
  if (ns.round + 1 >= game.rounds) {
    ns.terminal = true;
    return ns;
  }
  ns.round += 1;
  ns.hist.push('');
  ns.toAct = 0;
  ns.betsThisRound = 0;
  ns.outstanding = 0;
  return ns;
}

function nextState(game, s, a) {
  const ns = { ...s, hist: s.hist.slice(), contrib: s.contrib.slice() };
  const me = s.toAct;
  const opp = 1 - me;
  ns.hist[s.round] += a;
  const bet = game.betSizes[s.round];
  switch (a) {
    case 'f':
      ns.folded = me;
      ns.terminal = true;
      return ns;
    case 'c':
      if (ns.hist[s.round] === 'cc') return endRound(game, ns);
      ns.toAct = opp;
      return ns;
    case 'k':
      ns.contrib[me] += s.outstanding;
      ns.outstanding = 0;
      return endRound(game, ns);
    case 'b':
      ns.contrib[me] += bet;
      ns.outstanding = bet;
      ns.betsThisRound = 1;
      ns.toAct = opp;
      return ns;
    case 'r':
      ns.contrib[me] += s.outstanding + bet;
      ns.outstanding = bet;
      ns.betsThisRound = s.betsThisRound + 1;
      ns.toAct = opp;
      return ns;
    default:
      throw new Error('bad action ' + a);
  }
}

function showdownWinner(game, deal) {
  const [a, b] = deal.cards;
  if (game.hasCommunity) {
    const pa = a === deal.community;
    const pb = b === deal.community;
    if (pa && !pb) return 0;
    if (pb && !pa) return 1;
  }
  if (a > b) return 0;
  if (b > a) return 1;
  return -1;
}

// Net chips for player 0 at a terminal state.
function utility0(game, s, deal) {
  if (s.folded === 0) return -s.contrib[0];
  if (s.folded === 1) return s.contrib[1];
  const w = showdownWinner(game, deal);
  if (w === -1) return 0;
  return w === 0 ? s.contrib[1] : -s.contrib[0];
}

function infosetKey(game, s, deal, player) {
  const priv = RANK_NAMES[deal.cards[player]];
  const comm =
    game.hasCommunity && s.round > 0 ? RANK_NAMES[deal.community] : '-';
  return priv + '|' + comm + '|' + s.hist.join('/');
}

// ---- CFR+ solver -------------------------------------------------------

class Solver {
  constructor(game) {
    this.game = game;
    this.deals = enumDeals(game);
    this.totalWeight = this.deals.reduce((s, d) => s + d.weight, 0);
    this.nodes = new Map();
    this.iterations = 0;
  }

  node(key, actions) {
    let n = this.nodes.get(key);
    if (!n) {
      n = {
        regret: new Array(actions.length).fill(0),
        strategySum: new Array(actions.length).fill(0),
        pendingRegret: new Array(actions.length).fill(0),
        pendingStrat: new Array(actions.length).fill(0),
        actions,
      };
      this.nodes.set(key, n);
    }
    return n;
  }

  currentStrategy(n) {
    const pos = n.regret.map((r) => (r > 0 ? r : 0));
    const s = pos.reduce((a, b) => a + b, 0);
    return s > 0 ? pos.map((r) => r / s) : pos.map(() => 1 / pos.length);
  }

  avgStrategy(n) {
    const s = n.strategySum.reduce((a, b) => a + b, 0);
    return s > 0
      ? n.strategySum.map((x) => x / s)
      : n.strategySum.map(() => 1 / n.strategySum.length);
  }

  avgStrategyAt(s, deal, player) {
    const actions = legalActions(this.game, s);
    const n = this.nodes.get(infosetKey(this.game, s, deal, player));
    return n ? this.avgStrategy(n) : actions.map(() => 1 / actions.length);
  }

  train(iters) {
    for (let t = 0; t < iters; t++) {
      this.iterations++;
      for (let p = 0; p < 2; p++) {
        for (const deal of this.deals) {
          this.cfr(initialState(this.game), deal, p, 1, deal.weight / this.totalWeight);
        }
        // Regret-matching+: apply the summed update for this iteration,
        // then clamp. Strategy averaging is linearly weighted by t.
        for (const n of this.nodes.values()) {
          for (let i = 0; i < n.regret.length; i++) {
            n.regret[i] = Math.max(n.regret[i] + n.pendingRegret[i], 0);
            n.strategySum[i] += this.iterations * n.pendingStrat[i];
            n.pendingRegret[i] = 0;
            n.pendingStrat[i] = 0;
          }
        }
      }
    }
  }

  // Value for the updating player `up`. CFR+ with alternating updates
  // and linearly weighted strategy averaging.
  cfr(s, deal, up, myReach, oppReach) {
    const g = this.game;
    if (s.terminal) {
      const u0 = utility0(g, s, deal);
      return up === 0 ? u0 : -u0;
    }
    const player = s.toAct;
    const actions = legalActions(g, s);
    const n = this.node(infosetKey(g, s, deal, player), actions);
    const strat = this.currentStrategy(n);

    if (player !== up) {
      let v = 0;
      for (let i = 0; i < actions.length; i++) {
        if (strat[i] === 0) continue;
        v += strat[i] * this.cfr(nextState(g, s, actions[i]), deal, up, myReach, oppReach * strat[i]);
      }
      return v;
    }

    const vals = new Array(actions.length);
    let v = 0;
    for (let i = 0; i < actions.length; i++) {
      vals[i] = this.cfr(nextState(g, s, actions[i]), deal, up, myReach * strat[i], oppReach);
      v += strat[i] * vals[i];
    }
    for (let i = 0; i < actions.length; i++) {
      n.pendingRegret[i] += oppReach * (vals[i] - v);
      n.pendingStrat[i] += myReach * strat[i];
    }
    return v;
  }

  // ---- Evaluation ------------------------------------------------------

  // Expected value for player 0 when both players follow the average strategy.
  gameValue0() {
    let v = 0;
    for (const deal of this.deals) {
      v += (deal.weight / this.totalWeight) * this.evBothPlay(initialState(this.game), deal, 0);
    }
    return v;
  }

  evBothPlay(s, deal, perspective) {
    const g = this.game;
    if (s.terminal) {
      const u0 = utility0(g, s, deal);
      return perspective === 0 ? u0 : -u0;
    }
    const actions = legalActions(g, s);
    const strat = this.avgStrategyAt(s, deal, s.toAct);
    let v = 0;
    for (let i = 0; i < actions.length; i++) {
      if (strat[i] === 0) continue;
      v += strat[i] * this.evBothPlay(nextState(g, s, actions[i]), deal, perspective);
    }
    return v;
  }

  // Best-response value for brPlayer against the average strategy profile.
  bestResponseValue(brPlayer) {
    const groups = new Map();
    for (const d of this.deals) {
      const k = d.cards[brPlayer];
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ deal: d, w: d.weight / this.totalWeight });
    }
    let total = 0;
    for (const arr of groups.values()) {
      total += this.brRec(initialState(this.game), arr, brPlayer);
    }
    return total;
  }

  brRec(s, wdeals, brPlayer) {
    const g = this.game;
    if (s.terminal) {
      let v = 0;
      for (const { deal, w } of wdeals) {
        const u0 = utility0(g, s, deal);
        v += w * (brPlayer === 0 ? u0 : -u0);
      }
      return v;
    }
    // The community card becomes public at round 1: split the belief.
    if (g.hasCommunity && s.round > 0) {
      const comms = new Set(wdeals.map((x) => x.deal.community));
      if (comms.size > 1) {
        let v = 0;
        for (const c of comms) {
          v += this.brRec(s, wdeals.filter((x) => x.deal.community === c), brPlayer);
        }
        return v;
      }
    }
    const actions = legalActions(g, s);
    if (s.toAct === brPlayer) {
      let best = -Infinity;
      for (const a of actions) {
        best = Math.max(best, this.brRec(nextState(g, s, a), wdeals, brPlayer));
      }
      return best;
    }
    let v = 0;
    for (let i = 0; i < actions.length; i++) {
      const sub = [];
      for (const { deal, w } of wdeals) {
        const p = this.avgStrategyAt(s, deal, s.toAct)[i];
        if (w * p > 0) sub.push({ deal, w: w * p });
      }
      if (sub.length) v += this.brRec(nextState(g, s, actions[i]), sub, brPlayer);
    }
    return v;
  }

  // Average exploitability in chips/hand (0 at a Nash equilibrium).
  exploitability() {
    return (this.bestResponseValue(0) + this.bestResponseValue(1)) / 2;
  }

  // ---- Trainer support ---------------------------------------------------

  // At a decision point for `player` (reached via actionLog from the initial
  // state), return per-action EVs against the posterior over hidden deals,
  // assuming both players follow the average strategy afterwards.
  evAtDecision(actionLog, player, ownCard, community) {
    const g = this.game;
    const cands = [];
    for (const d of this.deals) {
      if (d.cards[player] !== ownCard) continue;
      let st = initialState(g);
      let w = d.weight;
      let dead = false;
      for (const a of actionLog) {
        if (st.toAct !== player) {
          const acts = legalActions(g, st);
          w *= this.avgStrategyAt(st, d, st.toAct)[acts.indexOf(a)];
        }
        st = nextState(g, st, a);
        if (g.hasCommunity && st.round > 0 && d.community !== community) {
          dead = true;
          break;
        }
        if (w === 0) { dead = true; break; }
      }
      if (!dead && w > 0) cands.push({ deal: d, w, state: st });
    }
    if (!cands.length) return null;
    const state = cands[0].state;
    const actions = legalActions(g, state);
    const totalW = cands.reduce((s, c) => s + c.w, 0);
    const evs = actions.map((a) => {
      let v = 0;
      for (const c of cands) {
        v += c.w * this.evBothPlay(nextState(g, state, a), c.deal, player);
      }
      return v / totalW;
    });
    const gto = this.avgStrategyAt(state, cands[0].deal, player);
    return { actions, evs, gto };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    makeKuhn,
    makeLeduc,
    enumDeals,
    initialState,
    legalActions,
    nextState,
    utility0,
    infosetKey,
    Solver,
    RANK_NAMES,
    ACTION_NAMES,
  };
}
