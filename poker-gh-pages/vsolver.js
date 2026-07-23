// Vectorized CFR+ solver for rank-deck heads-up limit poker games with one
// hole card: Kuhn poker, Leduc hold'em, and Rhode Island hold'em (rank deck).
//
// Architecture: the public game tree (betting sequences x board cards) is
// enumerated once; strategies and regrets live in flat typed arrays indexed
// by (decision node, hole rank, action). Traversals carry per-rank reach
// vectors — the same range-vector scheme real postflop solvers use. Card
// removal is exact: terminal values use precomputed joint deal-weight
// matrices per board prefix.

'use strict';

const V_ACTION_NAMES = { c: 'Check', b: 'Bet', f: 'Fold', k: 'Call', r: 'Raise' };

// ---- Game definitions ---------------------------------------------------

function vKuhn() {
  return {
    id: 'kuhn',
    label: 'Kuhn poker',
    rankCounts: [1, 1, 1],
    rankNames: ['J', 'Q', 'K'],
    rounds: 1,
    betSizes: [1],
    maxBets: 1,
    boardPerRound: [0],
    ante: 1,
    suited: true, // decorative suits in UI
    evalHand: (h) => h,
  };
}

function vLeduc() {
  return {
    id: 'leduc',
    label: "Leduc hold'em",
    rankCounts: [2, 2, 2],
    rankNames: ['J', 'Q', 'K'],
    rounds: 2,
    betSizes: [2, 4],
    maxBets: 2,
    boardPerRound: [0, 1],
    ante: 1,
    suited: true,
    evalHand: (h, board) => (h === board[0] ? 100 + h : h),
  };
}

// Rhode Island hold'em (Gilpin & Sandholm 2005), rank-deck variant: suits are
// ignored so there are no flushes; hands are 3-card poker minus flushes:
// trips > straight > pair > high card. 13 ranks x 4 copies, one hole card,
// one board card revealed before each of rounds 2 and 3.
function vRIH() {
  return {
    id: 'rih',
    label: "Rhode Island hold'em",
    rankCounts: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    rankNames: ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'],
    rounds: 3,
    betSizes: [2, 4, 4],
    maxBets: 3,
    boardPerRound: [0, 1, 1],
    ante: 1,
    suited: false,
    evalHand: eval3NoFlush,
  };
}

function eval3NoFlush(h, board) {
  const s = [h, board[0], board[1]].sort((x, y) => y - x); // desc
  const [a, b, c] = s;
  if (a === c) return 4 * 2197 + a; // trips
  const wheel = a === 12 && b === 1 && c === 0; // A-2-3
  if ((a === b + 1 && b === c + 1) || wheel) {
    return 3 * 2197 + (wheel ? 1 : a); // straight (wheel plays low)
  }
  if (a === b) return 2 * 2197 + a * 13 + c; // pair
  if (b === c) return 2 * 2197 + b * 13 + a;
  return 1 * 2197 + a * 169 + b * 13 + c; // high card
}

// ---- Betting-state mechanics (deal-independent) --------------------------

function vInitialState(game) {
  return {
    round: 0,
    hist: [''],
    toAct: 0,
    contrib: [game.ante, game.ante],
    betsThisRound: 0,
    outstanding: 0,
    folded: -1,
    terminal: false,
  };
}

function vLegalActions(game, s) {
  if (s.outstanding > 0) {
    return s.betsThisRound < game.maxBets ? ['f', 'k', 'r'] : ['f', 'k'];
  }
  return ['c', 'b'];
}

function vNextState(game, s, a) {
  const ns = { ...s, hist: s.hist.slice(), contrib: s.contrib.slice() };
  const me = s.toAct;
  const opp = 1 - me;
  ns.hist[s.round] += a;
  const bet = game.betSizes[s.round];
  const endRound = () => {
    if (ns.round + 1 >= game.rounds) {
      ns.terminal = true;
    } else {
      ns.round += 1;
      ns.hist.push('');
      ns.toAct = 0;
      ns.betsThisRound = 0;
      ns.outstanding = 0;
    }
    return ns;
  };
  switch (a) {
    case 'f':
      ns.folded = me;
      ns.terminal = true;
      return ns;
    case 'c':
      if (ns.hist[s.round] === 'cc') return endRound();
      ns.toAct = opp;
      return ns;
    case 'k':
      ns.contrib[me] += s.outstanding;
      ns.outstanding = 0;
      return endRound();
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

// ---- Solver ---------------------------------------------------------------

// Node kinds
const DECISION = 0, CHANCE = 1, TERMINAL = 2;

class VSolver {
  constructor(game) {
    this.game = game;
    this.H = game.rankCounts.length;
    this.totalBoard = game.boardPerRound.reduce((a, b) => a + b, 0);
    this.deckSize = game.rankCounts.reduce((a, b) => a + b, 0);

    this.boardCtxs = new Map(); // key -> {id, board, w: F64(H*H), cmp: Int8|null}
    this.ctxList = [];
    this.nodes = [];
    this.entries = 0; // total (node, hand, action) strategy entries
    this.root = this.build(vInitialState(game), []);

    this.regret = new Float64Array(this.entries);
    this.stratSum = new Float64Array(this.entries);
    this.pendingR = new Float64Array(this.entries);
    this.pendingS = new Float64Array(this.entries);
    this.iterations = 0;
    this.qdata = null; // quantized loaded strategy (Uint8Array), replaces stratSum

    // Total weight of all deals (normalizer for values).
    let w0 = 0;
    const w = this.ctx([]).w;
    for (let i = 0; i < this.H * this.H; i++) w0 += w[i];
    let boardWays = 1;
    for (let k = 0; k < this.totalBoard; k++) boardWays *= this.deckSize - 2 - k;
    this.W = w0 * boardWays;
  }

  boardNeeded(round) {
    let n = 0;
    for (let r = 0; r <= round; r++) n += this.game.boardPerRound[r];
    return n;
  }

  ctx(board) {
    const key = board.join(',');
    let c = this.boardCtxs.get(key);
    if (c) return c;
    const H = this.H;
    const w = new Float64Array(H * H);
    for (let h0 = 0; h0 < H; h0++) {
      for (let h1 = 0; h1 < H; h1++) {
        // ways to deal: p0 hole, p1 hole, then board cards in order
        const cnt = this.game.rankCounts.slice();
        let ways = cnt[h0];
        cnt[h0]--;
        ways *= Math.max(cnt[h1], 0);
        cnt[h1]--;
        for (const b of board) {
          ways *= Math.max(cnt[b], 0);
          cnt[b]--;
        }
        w[h0 * H + h1] = Math.max(ways, 0);
      }
    }
    let cmp = null;
    if (board.length === this.totalBoard) {
      cmp = new Int8Array(H * H);
      for (let h0 = 0; h0 < H; h0++) {
        for (let h1 = 0; h1 < H; h1++) {
          const e0 = this.game.evalHand(h0, board);
          const e1 = this.game.evalHand(h1, board);
          cmp[h0 * H + h1] = e0 > e1 ? 1 : e0 < e1 ? -1 : 0;
        }
      }
    }
    // Ways to deal the not-yet-revealed board cards: keeps terminal weights
    // at different depths (early folds vs showdowns) on the same scale.
    let rem = 1;
    for (let k = board.length; k < this.totalBoard; k++) rem *= this.deckSize - 2 - k;
    c = { id: this.ctxList.length, board: board.slice(), w, cmp, rem };
    this.boardCtxs.set(key, c);
    this.ctxList.push(c);
    return c;
  }

  build(state, board) {
    const g = this.game;
    const id = this.nodes.length;
    this.nodes.push(null); // reserve slot (children get higher ids)
    if (state.terminal) {
      this.nodes[id] = {
        k: TERMINAL,
        folded: state.folded,
        contrib: state.contrib.slice(),
        ctx: this.ctx(board).id,
        round: state.round,
      };
      return id;
    }
    if (board.length < this.boardNeeded(state.round)) {
      // deal one board card (publicly available ranks only)
      const kids = new Array(this.H).fill(-1);
      const node = { k: CHANCE, kids, ctx: this.ctx(board).id, round: state.round, contrib: state.contrib.slice() };
      this.nodes[id] = node;
      for (let r = 0; r < this.H; r++) {
        const used = board.filter((b) => b === r).length;
        if (g.rankCounts[r] - used > 0) {
          kids[r] = this.build(state, board.concat(r));
        }
      }
      return id;
    }
    const acts = vLegalActions(g, state);
    const node = {
      k: DECISION,
      p: state.toAct,
      acts,
      kids: [],
      off: this.entries,
      ctx: this.ctx(board).id,
      round: state.round,
      contrib: state.contrib.slice(),
      hist: state.hist.join('/'),
    };
    this.entries += this.H * acts.length;
    this.nodes[id] = node;
    for (const a of acts) node.kids.push(this.build(vNextState(g, state, a), board));
    return id;
  }

  // Current strategy (regret matching+) for one (node, hand) row.
  rowStrategy(node, h, out) {
    const A = node.acts.length;
    const base = node.off + h * A;
    let sum = 0;
    for (let a = 0; a < A; a++) {
      const r = this.regret[base + a];
      out[a] = r > 0 ? r : 0;
      sum += out[a];
    }
    if (sum > 0) for (let a = 0; a < A; a++) out[a] /= sum;
    else for (let a = 0; a < A; a++) out[a] = 1 / A;
    return out;
  }

  // Average strategy for one (node, hand) row -> new array.
  avgRow(node, h) {
    const A = node.acts.length;
    const base = node.off + h * A;
    const out = new Array(A);
    let sum = 0;
    if (this.qdata) {
      for (let a = 0; a < A; a++) sum += this.qdata[base + a];
      for (let a = 0; a < A; a++) out[a] = sum > 0 ? this.qdata[base + a] / sum : 1 / A;
      return out;
    }
    for (let a = 0; a < A; a++) sum += this.stratSum[base + a];
    for (let a = 0; a < A; a++) out[a] = sum > 0 ? this.stratSum[base + a] / sum : 1 / A;
    return out;
  }

  train(iters) {
    const ones = new Float64Array(this.H).fill(1);
    for (let t = 0; t < iters; t++) {
      this.iterations++;
      for (let u = 0; u < 2; u++) {
        this.walk(this.root, u, ones, ones);
        // apply summed updates (regret matching+), linear averaging weight t
        const it = this.iterations;
        for (let i = 0; i < this.entries; i++) {
          const r = this.regret[i] + this.pendingR[i];
          this.regret[i] = r > 0 ? r : 0;
          this.stratSum[i] += it * this.pendingS[i];
          this.pendingR[i] = 0;
          this.pendingS[i] = 0;
        }
      }
    }
  }

  // CFR traversal for updating player u. Returns counterfactual values per
  // hole rank of u (unnormalized: weighted by oppReach x deal weights).
  walk(id, u, myReach, oppReach) {
    const node = this.nodes[id];
    const H = this.H;
    if (node.k === TERMINAL) {
      return this.terminalVals(node, u, oppReach);
    }
    if (node.k === CHANCE) {
      const out = new Float64Array(H);
      for (let r = 0; r < H; r++) {
        if (node.kids[r] < 0) continue;
        const v = this.walk(node.kids[r], u, myReach, oppReach);
        for (let h = 0; h < H; h++) out[h] += v[h];
      }
      return out;
    }
    const A = node.acts.length;
    const strat = new Float64Array(H * A);
    const row = new Array(A);
    for (let h = 0; h < H; h++) {
      this.rowStrategy(node, h, row);
      for (let a = 0; a < A; a++) strat[h * A + a] = row[a];
    }
    if (node.p !== u) {
      const out = new Float64Array(H);
      const childReach = new Float64Array(H);
      for (let a = 0; a < A; a++) {
        let mass = 0;
        for (let h = 0; h < H; h++) {
          childReach[h] = oppReach[h] * strat[h * A + a];
          mass += childReach[h];
        }
        if (mass === 0) continue;
        const v = this.walk(node.kids[a], u, myReach, childReach);
        for (let h = 0; h < H; h++) out[h] += v[h];
      }
      return out;
    }
    // updating player's node
    const cfvA = new Array(A);
    const childMy = new Float64Array(H);
    for (let a = 0; a < A; a++) {
      for (let h = 0; h < H; h++) childMy[h] = myReach[h] * strat[h * A + a];
      cfvA[a] = this.walk(node.kids[a], u, childMy, oppReach);
    }
    const out = new Float64Array(H);
    for (let h = 0; h < H; h++) {
      let v = 0;
      for (let a = 0; a < A; a++) v += strat[h * A + a] * cfvA[a][h];
      out[h] = v;
      const base = node.off + h * A;
      for (let a = 0; a < A; a++) {
        this.pendingR[base + a] += cfvA[a][h] - v;
        this.pendingS[base + a] += myReach[h] * strat[h * A + a];
      }
    }
    return out;
  }

  terminalVals(node, persp, oppReach) {
    const H = this.H;
    const ctx = this.ctxList[node.ctx];
    const out = new Float64Array(H);
    if (node.folded >= 0) {
      // value for persp: +opp contrib if opponent folded, else -own contrib
      const s = (node.folded === persp ? -node.contrib[persp] : node.contrib[1 - persp]) * ctx.rem;
      for (let h = 0; h < H; h++) {
        let m = 0;
        for (let o = 0; o < H; o++) m += oppReach[o] * ctx.w[persp === 0 ? h * H + o : o * H + h];
        out[h] = s * m;
      }
      return out;
    }
    const c = node.contrib[0] * ctx.rem; // contribs equal at showdown
    for (let h = 0; h < H; h++) {
      let m = 0;
      for (let o = 0; o < H; o++) {
        const iw = persp === 0 ? h * H + o : o * H + h;
        const sign = persp === 0 ? ctx.cmp[h * H + o] : -ctx.cmp[o * H + h];
        m += oppReach[o] * ctx.w[iw] * sign;
      }
      out[h] = c * m;
    }
    return out;
  }

  // Expected values per hand for `persp` when BOTH players play the average
  // strategy, given opponent (strategy-only) reach.
  valWalk(id, persp, oppReach) {
    const node = this.nodes[id];
    const H = this.H;
    if (node.k === TERMINAL) return this.terminalVals(node, persp, oppReach);
    if (node.k === CHANCE) {
      const out = new Float64Array(H);
      for (let r = 0; r < H; r++) {
        if (node.kids[r] < 0) continue;
        const v = this.valWalk(node.kids[r], persp, oppReach);
        for (let h = 0; h < H; h++) out[h] += v[h];
      }
      return out;
    }
    const A = node.acts.length;
    if (node.p !== persp) {
      const out = new Float64Array(H);
      const childReach = new Float64Array(H);
      for (let a = 0; a < A; a++) {
        let mass = 0;
        for (let h = 0; h < H; h++) {
          childReach[h] = oppReach[h] * this.avgRow(node, h)[a];
          mass += childReach[h];
        }
        if (mass === 0) continue;
        const v = this.valWalk(node.kids[a], persp, childReach);
        for (let h = 0; h < H; h++) out[h] += v[h];
      }
      return out;
    }
    const out = new Float64Array(H);
    const kidVals = node.kids.map((kid) => this.valWalk(kid, persp, oppReach));
    for (let h = 0; h < H; h++) {
      const row = this.avgRow(node, h);
      let v = 0;
      for (let a = 0; a < A; a++) v += row[a] * kidVals[a][h];
      out[h] = v;
    }
    return out;
  }

  // Best-response values per hand for brP against the average strategy.
  brWalk(id, brP, oppReach) {
    const node = this.nodes[id];
    const H = this.H;
    if (node.k === TERMINAL) return this.terminalVals(node, brP, oppReach);
    if (node.k === CHANCE) {
      const out = new Float64Array(H);
      for (let r = 0; r < H; r++) {
        if (node.kids[r] < 0) continue;
        const v = this.brWalk(node.kids[r], brP, oppReach);
        for (let h = 0; h < H; h++) out[h] += v[h];
      }
      return out;
    }
    const A = node.acts.length;
    if (node.p === brP) {
      const out = new Float64Array(H).fill(-Infinity);
      for (let a = 0; a < A; a++) {
        const v = this.brWalk(node.kids[a], brP, oppReach);
        for (let h = 0; h < H; h++) if (v[h] > out[h]) out[h] = v[h];
      }
      return out;
    }
    const out = new Float64Array(H);
    const childReach = new Float64Array(H);
    for (let a = 0; a < A; a++) {
      let mass = 0;
      for (let h = 0; h < H; h++) {
        childReach[h] = oppReach[h] * this.avgRow(node, h)[a];
        mass += childReach[h];
      }
      if (mass === 0) continue;
      const v = this.brWalk(node.kids[a], brP, childReach);
      for (let h = 0; h < H; h++) out[h] += v[h];
    }
    return out;
  }

  gameValue0() {
    const ones = new Float64Array(this.H).fill(1);
    const v = this.valWalk(this.root, 0, ones);
    let total = 0;
    for (let h = 0; h < this.H; h++) total += v[h];
    return total / this.W;
  }

  bestResponseValue(brP) {
    const ones = new Float64Array(this.H).fill(1);
    const v = this.brWalk(this.root, brP, ones);
    let total = 0;
    for (let h = 0; h < this.H; h++) total += v[h];
    return total / this.W;
  }

  exploitability() {
    return (this.bestResponseValue(0) + this.bestResponseValue(1)) / 2;
  }

  get infosetCount() {
    let n = 0;
    for (const node of this.nodes) if (node.k === DECISION) n += this.H;
    return n;
  }

  // ---- Trainer support ----------------------------------------------------

  // Sample a full deal: {cards: [r0, r1], board: [...]}.
  sampleDeal(rand) {
    const cnt = this.game.rankCounts.slice();
    const draw = () => {
      let total = 0;
      for (const c of cnt) total += c;
      let x = rand() * total;
      for (let r = 0; r < cnt.length; r++) {
        x -= cnt[r];
        if (x < 0) {
          cnt[r]--;
          return r;
        }
      }
      return cnt.length - 1;
    };
    const cards = [draw(), draw()];
    const board = [];
    for (let k = 0; k < this.totalBoard; k++) board.push(draw());
    return { cards, board };
  }

  // Walk the public tree along actionLog (letters), consuming board cards
  // from `board` at chance nodes. Returns {id, oppReach, dealt} where
  // oppReach is the strategy-only reach of the player who is NOT `viewer`.
  replay(actionLog, board, viewer) {
    let id = this.root;
    let bi = 0;
    const oppReach = new Float64Array(this.H).fill(1);
    const consumeChance = () => {
      while (this.nodes[id].k === CHANCE) {
        id = this.nodes[id].kids[board[bi++]];
      }
    };
    consumeChance();
    for (const a of actionLog) {
      const node = this.nodes[id];
      const ai = node.acts.indexOf(a);
      if (node.p !== viewer) {
        for (let h = 0; h < this.H; h++) oppReach[h] *= this.avgRow(node, h)[ai];
      }
      id = node.kids[ai];
      consumeChance();
    }
    return { id, oppReach, dealt: bi };
  }

  avgStrategyAt(actionLog, board, hand) {
    const { id } = this.replay(actionLog, board, -1);
    const node = this.nodes[id];
    return { actions: node.acts, probs: this.avgRow(node, hand) };
  }

  // Per-action EVs (in chips, for `seat` holding `hand`) at the current
  // decision point, against the posterior over opponent hands, with both
  // players following the average strategy afterwards.
  evAtDecision(actionLog, board, seat, hand) {
    const H = this.H;
    const { id, oppReach, dealt } = this.replay(actionLog, board, seat);
    const node = this.nodes[id];
    if (node.k !== DECISION || node.p !== seat) return null;
    const ctx = this.ctxList[node.ctx];
    // normalizer: total deal weight consistent with (hand, board so far, history)
    let denom = 0;
    for (let o = 0; o < H; o++) {
      denom += oppReach[o] * ctx.w[seat === 0 ? hand * H + o : o * H + hand];
    }
    let rem = 1;
    for (let k = dealt; k < this.totalBoard; k++) rem *= this.deckSize - 2 - k;
    denom *= rem;
    if (denom === 0) return null;
    const evs = node.acts.map((_, a) => {
      const v = this.valWalk(node.kids[a], seat, oppReach);
      return v[hand] / denom;
    });
    return { actions: node.acts, evs, gto: this.avgRow(node, hand) };
  }

  // ---- Quantized strategy export / import ---------------------------------

  exportQuantized() {
    const out = new Uint8Array(this.entries);
    for (const node of this.nodes) {
      if (node.k !== DECISION) continue;
      const A = node.acts.length;
      for (let h = 0; h < this.H; h++) {
        const row = this.avgRow(node, h);
        const base = node.off + h * A;
        for (let a = 0; a < A; a++) out[base + a] = Math.round(row[a] * 255);
      }
    }
    return out;
  }

  loadQuantized(u8) {
    if (u8.length !== this.entries) {
      throw new Error(`strategy size mismatch: ${u8.length} vs ${this.entries}`);
    }
    this.qdata = u8;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { vKuhn, vLeduc, vRIH, VSolver, vInitialState, vLegalActions, vNextState, eval3NoFlush, V_ACTION_NAMES };
}
