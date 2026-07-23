/* =====================================================================
 * gto-engine — client-side Texas Hold'em postflop GTO solver
 * Pure logic, no DOM. Works in the browser (globals), a Web Worker
 * (importScripts) and Node (exports).
 * Algorithm: vectorized DCFR (discounted CFR; vanilla MCCFR regrets in
 * sampled mode) with full chance enumeration of remaining board cards,
 * O(n log n) showdown with blocker correction (the technique used by
 * modern range-vs-range solvers). All per-iteration scratch memory comes
 * from a stack arena sized at build time, so a solve does zero allocation
 * per traversal.
 * ===================================================================== */
(function (root) {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';

  // ---- card helpers ---------------------------------------------------
  // card int 0..51 = rank*4 + suit ; rank 0..12 (2..A), suit 0..3 (cdhs)
  function cardToInt(str) {
    const r = RANKS.indexOf(str[0].toUpperCase());
    const s = SUITS.indexOf(str[1].toLowerCase());
    if (r < 0 || s < 0) return -1;
    return r * 4 + s;
  }
  function intToStr(c) { return (c + 2).toString(); }
  function parseCards(text) {
    if (!text) return [];
    const t = text.trim().split(/[\s,]+/);
    const out = [];
    for (let i = 0; i < t.length; i++) {
      if (!t[i]) continue;
      const n = parseInt(t[i], 10);
      if (!isNaN(n) && n >= 2 && n <= 53) {
        out.push(n - 2);
      } else {
        throw new Error('Board cards must be between 2 and 53.');
      }
    }
    return out;
  }

  // ---- 7-card evaluator ----------------------------------------------
  function gcd(a, b) {
    while (b) {
      let temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  }
  function gcd3(a, b, c) {
    return gcd(gcd(a, b), c);
  }

  function score5(cards) {
    let bestScore = -1;
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        for (let k = j + 1; k < 5; k++) {
          let a = cards[i] + 2;
          let b = cards[j] + 2;
          let c = cards[k] + 2;
          
          if (a < b) { let t = a; a = b; b = t; }
          if (a < c) { let t = a; a = c; c = t; }
          if (b < c) { let t = b; b = c; c = t; }
          
          const g = gcd3(a, b, c);
          const score = (g << 18) | (a << 12) | (b << 6) | c;
          if (score > bestScore) {
            bestScore = score;
          }
        }
      }
    }
    return bestScore;
  }

  // ---- range parsing --------------------------------------------------
  function comboKey(a, b) { return a < b ? a + '-' + b : b + '-' + a; }
  function addCombo(map, a, b, w) { if (a === b) return; map.set(comboKey(a, b), w); }

  function parseRange(text) {
    const map = new Map();
    if (!text) return map;
    for (let tok of text.split(/[,\n]+/)) {
      tok = tok.trim(); if (!tok) continue;
      let w = 1;
      const cm = tok.split(':');
      if (cm.length === 2) { w = parseFloat(cm[1]); tok = cm[0].trim(); }
      if (!isFinite(w)) w = 1;
      const parts = tok.split(/[\s-]+/);
      if (parts.length >= 2) {
         let a = parseInt(parts[0], 10);
         let b = parseInt(parts[1], 10);
         if (isNaN(a) || isNaN(b) || a < 2 || a > 53 || b < 2 || b > 53) {
             throw new Error('Range cards must be between 2 and 53.');
         }
         if (!isNaN(a) && !isNaN(b)) {
            if (tok.includes('-') && parts.length === 2) {
               // Range like "53-2"
               let max = Math.max(a, b);
               let min = Math.min(a, b);
               for (let i = max; i >= min; i--) {
                   for (let j = i - 1; j >= min; j--) {
                       addCombo(map, i - 2, j - 2, w);
                   }
               }
            } else {
               // Single combo like "50 51"
               addCombo(map, a - 2, b - 2, w);
            }
         }
      }
    }
    return map;
  }

  // combos as array of {c1,c2,w} filtered against dead cards (board)
  function buildCombos(rangeMap, dead) {
    const deadSet = new Set(dead);
    const out = [];
    for (const [key, w] of rangeMap) {
      if (w <= 0) continue;
      const [a, b] = key.split('-').map(Number);
      if (deadSet.has(a) || deadSet.has(b)) continue;
      out.push({ c1: a, c2: b, w });
    }
    return out;
  }

  // hand-class label for the grid
  function classOf(c1, c2) {
    let a = c1 + 2, b = c2 + 2;
    if (a < b) { let t = a; a = b; b = t; }
    return a + ' ' + b;
  }

  // =====================================================================
  //  Solver
  // =====================================================================
  let CFG, HANDS, KEYIDX, ROOT, ITER, ITERS_DONE, MAX_BYTES, buildBytes;
  // shared flat pools: every decision node stores an integer offset instead of
  // its own two typed arrays — removes ~128 bytes of header overhead per node
  // and turns millions of tiny allocations into two big ones (less GC, better locality).
  let REGRET, STRAT, POOLLEN;
  // DCFR (discounted CFR): negative regrets are kept and decayed instead of
  // floored, and strategy increments are weighted t^2 (gamma=2). Used in
  // full-enumeration mode; sampled (MCCFR) mode uses vanilla regrets with
  // linear strategy averaging — the pool-wide discount pass would dominate
  // its cheap iterations, and CFR+ flooring is unsound under sampling.
  let DCFR = false, WEIGHT = 1;
  // exact matchup-weight normalizer: sum of w_i*w_j over blocker-compatible
  // combo pairs (computed once in setup; the old sum(r0)*sum(r1) counted
  // impossible matchups and skewed EV/exploitability on overlapping ranges).
  let NORMW = 1;
  // showdown caches (hand scores + sort orders) are shared by final BOARD,
  // not per node — every line ending on the same river reuses one entry.
  // On a flop solve this collapses ~10-20 duplicate caches per runout to one.
  let SDCACHE = null, SDKEYS = null;
  // average-strategy pool policy: sampled (MCCFR) mode needs the running
  // average (its current strategy is far too noisy). Full-enum DCFR keeps
  // the average only when it's cheap (small builds — smooth convergence
  // metrics, earlier auto-stop); on big builds it reports the last iterate
  // instead, which halves the per-node float pools right where memory is
  // the binding constraint.
  let STORE_AVG = false;
  const AVG_POOL_LIMIT = 16 * 1024 * 1024; // keep the average if it costs ≤64 MB (floats)
  // stack arena for all per-traversal scratch vectors. Frames are pushed with
  // mark/release around each recursive call, so peak usage is bounded by the
  // deepest root-to-leaf path (computed exactly at build time by arenaNeed).
  let ARENA = null, ATOP = 0;
  // per-traversal flag: MCCFR samples only the first chance level it meets
  let SAMPLE_USED = false;
  function aAlloc(n) {
    if (ATOP + n > ARENA.length) throw new Error('internal: solver arena overflow');
    const v = ARENA.subarray(ATOP, ATOP + n); ATOP += n; v.fill(0); return v;
  }

  // ---- suit isomorphism ----------------------------------------------
  // GROUP = suit permutations that leave BOTH ranges and the board invariant.
  // Isomorphic runout cards share one canonical sub-tree; APPLY/INV map hand
  // indices between a card's frame and its representative's frame.
  // When ranges have no suit symmetry GROUP is just {identity} → identical to
  // full enumeration, so this path is always safe.
  let GROUP, APPLY, INV;
  function permCardC(pi, c) { return (c >> 2) * 4 + pi[c & 3]; }
  function applyPermKey(pi, c1, c2) {
    const a = permCardC(pi, c1), b = permCardC(pi, c2);
    return a < b ? a + '-' + b : b + '-' + a;
  }
  function inversePerm(pi) { const inv = [0, 0, 0, 0]; for (let s = 0; s < 4; s++) inv[pi[s]] = s; return inv; }
  function permEq(a, b) { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]; }
  function allPerms() {
    const out = [], a = [0, 1, 2, 3];
    const go = (k) => { if (k === 4) { out.push(a.slice()); return; } for (let i = k; i < 4; i++) { [a[k], a[i]] = [a[i], a[k]]; go(k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
    go(0); return out;
  }
  function rangeInvariant(p, pi) {
    const H = HANDS[p], K = KEYIDX[p];
    for (let i = 0; i < H.length; i++) {
      const j = K.get(applyPermKey(pi, H[i].c1, H[i].c2));
      if (j === undefined || H[j].w !== H[i].w) return false;
    }
    return true;
  }
  function computeGroup() {
    return [[0, 1, 2, 3]];
  }
  function buildPermTables() {
    APPLY = []; INV = [];
    for (const pi of GROUP) {
      const t = [new Int32Array(HANDS[0].length), new Int32Array(HANDS[1].length)];
      for (let p = 0; p < 2; p++) { const H = HANDS[p], K = KEYIDX[p]; for (let i = 0; i < H.length; i++) t[p][i] = K.get(applyPermKey(pi, H[i].c1, H[i].c2)); }
      APPLY.push(t);
    }
    for (let i = 0; i < GROUP.length; i++) {
      const ip = inversePerm(GROUP[i]); let idx = 0;
      for (let k = 0; k < GROUP.length; k++) if (permEq(GROUP[k], ip)) { idx = k; break; }
      INV.push(idx);
    }
  }
  function stabilizer(groupIdx, card) {
    const out = [];
    for (const gi of groupIdx) if (permCardC(GROUP[gi], card) === card) out.push(gi);
    return out;
  }

  function cloneState(s) {
    return {
      board: s.board, contrib: s.contrib.slice(), stacks: s.stacks.slice(),
      streetInvest: s.streetInvest.slice(), acted: s.acted.slice(),
      player: s.player, aggressor: s.aggressor, numRaises: s.numRaises,
      groupIdx: s.groupIdx,
    };
  }

  function betAmounts(pot, remaining) {
    const set = new Set();
    for (const f of CFG.betSizes) {
      let a = Math.round(f * pot);
      if (a < 1) a = 1;
      if (a >= remaining) a = remaining;
      set.add(a);
    }
    if (CFG.allowAllIn) set.add(remaining);
    return [...set].filter(a => a > 0).sort((x, y) => x - y);
  }
  function raiseAmounts(potAfterCall, toCall, remaining) {
    const set = new Set();
    for (const f of CFG.raiseSizes) {
      let total = toCall + Math.round(f * potAfterCall);
      if (total < toCall * 2) total = toCall * 2;
      if (total >= remaining) total = remaining;
      set.add(total);
    }
    if (CFG.allowAllIn) set.add(remaining);
    return [...set].filter(a => a > toCall).sort((x, y) => x - y);
  }

  function addBytes(n) {
    buildBytes += n;
    if (buildBytes > MAX_BYTES) { const e = new Error('TREE_TOO_LARGE'); e.tooLarge = true; throw e; }
  }
  function makeFold(s, folder) { return { type: 'fold', folder, contrib: s.contrib.slice() }; }
  function makeShowdown(s) {
    // caches are shared per unique final board (order-independent), so count
    // each board once against the budget — not once per showdown node.
    const key = s.board.slice().sort((a, b) => a - b).join('.');
    if (!SDKEYS.has(key)) { SDKEYS.add(key); addBytes((HANDS[0].length + HANDS[1].length) * 8); }
    return { type: 'showdown', board: s.board, key, contrib: s.contrib.slice() };
  }

  function endStreet(s) {
    if (s.board.length >= 3) return makeShowdown(s);
    return makeChance(s);
  }
  function makeChance(s) {
    const used = new Set(s.board);
    const avail = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) avail.push(c);
    const groupIdx = s.groupIdx;
    const node = { type: 'chance', entries: [], nCards: avail.length };
    const seen = new Set();
    for (const c of avail) {              // c is the orbit representative (smallest unseen)
      if (seen.has(c)) continue;
      const ns = cloneState(s);
      ns.board = s.board.concat([c]);
      ns.streetInvest = [0, 0]; ns.acted = [false, false];
      ns.aggressor = -1; ns.numRaises = 0; ns.player = 0;
      ns.groupIdx = stabilizer(groupIdx, c); // symmetries valid below this card
      const child = buildStreetStart(ns);
      for (const gi of groupIdx) {          // every card in c's orbit reuses `child`
        const m = permCardC(GROUP[gi], c);  // GROUP[gi] maps rep c -> card m
        if (seen.has(m)) continue;
        seen.add(m);
        node.entries.push({ card: m, repCard: c, child, piIdx: gi });
      }
    }
    return node;
  }
  function buildStreetStart(s) {
    if (s.stacks[0] === 0 || s.stacks[1] === 0) return endStreet(s); // all-in: run it out
    return buildDecision(s);
  }

  function allocNode(node, player) {
    const nH = HANDS[player].length, nA = node.nA;
    // regret pool always; the strategy-average pool only in sampled mode
    addBytes(nH * nA * (STORE_AVG ? 8 : 4));
    node.player = player;
    node.off = POOLLEN;          // offset into the shared REGRET / STRAT pools
    POOLLEN += nH * nA;          // pools are sized and allocated once, after build
    return node;
  }

  function buildDecision(s) {
    const p = s.player, opp = 1 - p;
    const pot = s.contrib[0] + s.contrib[1];
    const toCall = s.streetInvest[opp] - s.streetInvest[p];
    const node = { type: 'decision', actions: [], labels: [] };
    const acts = node.actions, labels = node.labels;

    if (toCall === 0) {
      // check
      const ns = cloneState(s); ns.acted[p] = true;
      if (ns.acted[opp]) { acts.push(endStreet(ns)); }
      else { ns.player = opp; acts.push(buildDecision(ns)); }
      labels.push('check');
      // bets
      const remaining = s.stacks[p];
      if (remaining > 0) {
        for (const amt of betAmounts(pot, remaining)) {
          const ns2 = cloneState(s);
          ns2.streetInvest[p] += amt; ns2.contrib[p] += amt; ns2.stacks[p] -= amt;
          ns2.acted[p] = true; ns2.acted[opp] = false; ns2.player = opp;
          ns2.aggressor = p; ns2.numRaises = 0;
          acts.push(buildDecision(ns2));
          labels.push(amt >= s.stacks[p] ? 'allin' : 'bet ' + amt + ' (' + Math.round(100 * amt / pot) + '%)');
        }
      }
    } else {
      // fold
      acts.push(makeFold(s, p)); labels.push('fold');
      // call
      const callAmt = Math.min(toCall, s.stacks[p]);
      const nc = cloneState(s);
      nc.streetInvest[p] += callAmt; nc.contrib[p] += callAmt; nc.stacks[p] -= callAmt;
      nc.acted[p] = true;
      acts.push(endStreet(nc)); labels.push('call');
      // raises
      if (s.numRaises < CFG.maxRaises && s.stacks[p] > toCall) {
        const potAfterCall = pot + toCall;
        for (const total of raiseAmounts(potAfterCall, toCall, s.stacks[p])) {
          const nr = cloneState(s);
          nr.streetInvest[p] += total; nr.contrib[p] += total; nr.stacks[p] -= total;
          nr.acted[p] = true; nr.acted[opp] = false; nr.player = opp;
          nr.aggressor = p; nr.numRaises = s.numRaises + 1;
          acts.push(buildDecision(nr));
          labels.push(total >= s.stacks[p] ? 'allin'
            : 'raise ' + total + ' (' + Math.round(100 * (total - toCall) / potAfterCall) + '%)');
        }
      }
    }
    node.nA = acts.length;
    return allocNode(node, p);
  }

  function initReach(p) {
    const H = HANDS[p], r = new Float32Array(H.length);
    for (let i = 0; i < H.length; i++) r[i] = H[i].w;
    return r;
  }
  function regretMatchInto(node, out) {
    const nA = node.nA, nH = HANDS[node.player].length, O = node.off;
    for (let h = 0; h < nH; h++) {
      const base = h * nA; let sum = 0;
      for (let a = 0; a < nA; a++) { const v = REGRET[O + base + a]; if (v > 0) sum += v; }
      if (sum > 0) { for (let a = 0; a < nA; a++) { const v = REGRET[O + base + a]; out[base + a] = v > 0 ? v / sum : 0; } }
      else { const u = 1 / nA; for (let a = 0; a < nA; a++) out[base + a] = u; }
    }
  }

  // ---- terminal value vectors (for traverser `trav`, weighted by opp reach)
  // Persistent 52-slot scratches — terminals are leaves (no recursion below),
  // so reusing module-level buffers here is safe and allocation-free.
  const SC_FOLD = new Float64Array(52);
  const SC_TOT = new Float64Array(52), SC_LESS = new Float64Array(52), SC_LEQ = new Float64Array(52);
  function foldValueInto(node, trav, reachO, out) {
    const Ht = HANDS[trav], Ho = HANDS[1 - trav];
    let total = 0; const card = SC_FOLD; card.fill(0);
    for (let o = 0; o < Ho.length; o++) { const r = reachO[o]; if (r) { total += r; card[Ho[o].c1] += r; card[Ho[o].c2] += r; } }
    const payoff = trav === node.folder ? -node.contrib[node.folder] : node.contrib[node.folder];
    const oppKey = KEYIDX[1 - trav];
    for (let h = 0; h < Ht.length; h++) {
      const c1 = Ht[h].c1, c2 = Ht[h].c2;
      let comp = total - card[c1] - card[c2];
      const ex = oppKey.get(comboKey(c1, c2)); if (ex !== undefined) comp += reachO[ex];
      out[h] = payoff * comp;
    }
  }

  function ensureShowdown(node) {
    if (node.sd) return;
    let e = SDCACHE.get(node.key);
    if (!e) {
      e = { scores: [new Int32Array(HANDS[0].length), new Int32Array(HANDS[1].length)], order: [null, null] };
      const b = node.board;
      for (let p = 0; p < 2; p++) {
        const H = HANDS[p], arr = e.scores[p];
        for (let i = 0; i < H.length; i++) arr[i] = score5([b[0], b[1], b[2], H[i].c1, H[i].c2]);
        const ord = new Int32Array(H.length);
        for (let i = 0; i < H.length; i++) ord[i] = i;
        ord.sort((x, y) => arr[x] - arr[y]);
        e.order[p] = ord;
      }
      SDCACHE.set(node.key, e);
    }
    node.sd = e;
  }
  function showdownValueInto(node, trav, reachO, out) {
    ensureShowdown(node);
    const Ht = HANDS[trav], Ho = HANDS[1 - trav];
    const st = node.sd.scores[trav], so = node.sd.scores[1 - trav];
    const ord = node.sd.order[1 - trav], tord = node.sd.order[trav];
    const winGain = node.contrib[1 - trav], loseCost = node.contrib[trav];
    let total = 0; const cardTot = SC_TOT; cardTot.fill(0);
    for (let o = 0; o < Ho.length; o++) { const r = reachO[o]; if (r) { total += r; cardTot[Ho[o].c1] += r; cardTot[Ho[o].c2] += r; } }
    let iLess = 0, iLeq = 0, lessR = 0, leqR = 0;
    const lessC = SC_LESS, leqC = SC_LEQ; lessC.fill(0); leqC.fill(0);
    for (let ti = 0; ti < tord.length; ti++) {
      const h = tord[ti], sh = st[h];
      while (iLess < ord.length && so[ord[iLess]] < sh) { const o = ord[iLess]; const r = reachO[o]; lessR += r; lessC[Ho[o].c1] += r; lessC[Ho[o].c2] += r; iLess++; }
      while (iLeq < ord.length && so[ord[iLeq]] <= sh) { const o = ord[iLeq]; const r = reachO[o]; leqR += r; leqC[Ho[o].c1] += r; leqC[Ho[o].c2] += r; iLeq++; }
      const c1 = Ht[h].c1, c2 = Ht[h].c2;
      const winR = lessR - lessC[c1] - lessC[c2];
      const loseR = (total - leqR) - (cardTot[c1] - leqC[c1]) - (cardTot[c2] - leqC[c2]);
      out[h] = winGain * winR - loseCost * loseR;
    }
  }

  // ---- core CFR traversal (DCFR / sampled MCCFR) ------------------------
  // Writes the traverser's value vector into caller-provided `out` (zeroed).
  // All scratch comes from the stack arena: each frame marks ATOP on entry
  // and restores it before returning, so a full traversal allocates nothing.
  function cfr(node, trav, reachT, reachO, out) {
    if (node.type === 'fold') { foldValueInto(node, trav, reachO, out); return; }
    if (node.type === 'showdown') { showdownValueInto(node, trav, reachO, out); return; }
    if (node.type === 'chance') {
      const Ht = HANDS[trav], Ho = HANDS[1 - trav], nHt = Ht.length, nHo = Ho.length;
      const entries = node.entries;
      // MCCFR (public chance sampling): sample one card at the FIRST chance
      // level only and enumerate below it — sampling every level leaves deep
      // nodes almost never updated and convergence stalls. The sampling
      // distribution equals the chance distribution, so the estimate of the
      // (1/N) chance average is unbiased with no reweighting.
      const sample = CFG.sampling === 'chance' && entries.length > 1 && !SAMPLE_USED;
      if (sample) SAMPLE_USED = true;
      const lo = sample ? (Math.random() * entries.length) | 0 : 0;
      const hi = sample ? lo + 1 : entries.length;
      const inv = sample ? 1 : 1 / node.nCards;
      for (let ei = lo; ei < hi; ei++) {
        const e = entries[ei], c = e.card, rep = e.repCard;
        const fwdT = APPLY[e.piIdx][trav], fwdO = APPLY[e.piIdx][1 - trav], invT = APPLY[INV[e.piIdx]][trav];
        const mark = ATOP;
        // map reaches into the representative's frame; block hands holding `rep`
        const rT = aAlloc(nHt), rO = aAlloc(nHo), v = aAlloc(nHt);
        let sumO = 0;
        for (let j = 0; j < nHo; j++) if (Ho[j].c1 !== rep && Ho[j].c2 !== rep) { const x = reachO[fwdO[j]]; rO[j] = x; sumO += x; }
        // prune: zero opp reach ⇒ all values and regret deltas below are zero
        if (sumO === 0) { ATOP = mark; continue; }
        for (let j = 0; j < nHt; j++) if (Ht[j].c1 !== rep && Ht[j].c2 !== rep) rT[j] = reachT[fwdT[j]];
        cfr(e.child, trav, rT, rO, v);
        for (let h = 0; h < nHt; h++) if (Ht[h].c1 !== c && Ht[h].c2 !== c) out[h] += inv * v[invT[h]];
        ATOP = mark;
      }
      return;
    }
    const nA = node.nA, mark = ATOP;
    if (node.player === trav) {
      const nHt = HANDS[trav].length;
      const strat = aAlloc(nHt * nA); regretMatchInto(node, strat);
      const actVals = aAlloc(nA * nHt); // children write straight into their slice
      for (let a = 0; a < nA; a++) {
        const amark = ATOP;
        const rT2 = aAlloc(nHt);
        for (let h = 0; h < nHt; h++) rT2[h] = reachT[h] * strat[h * nA + a];
        cfr(node.actions[a], trav, rT2, reachO, actVals.subarray(a * nHt, (a + 1) * nHt));
        ATOP = amark;
      }
      for (let h = 0; h < nHt; h++) {
        const base = h * nA; let u = 0;
        for (let a = 0; a < nA; a++) u += strat[base + a] * actVals[a * nHt + h];
        out[h] = u;
      }
      // full-enum: DCFR decays negatives in iterate(). Sampled: vanilla
      // MCCFR regrets — flooring (CFR+) is NOT sound under sampling; the
      // negative part must persist so sampling noise can average out.
      const O = node.off;
      if (STORE_AVG) {
        const w = WEIGHT; // linear averaging (sampled mode)
        for (let h = 0; h < nHt; h++) {
          const base = h * nA, rh = reachT[h], uh = out[h];
          for (let a = 0; a < nA; a++) {
            REGRET[O + base + a] += actVals[a * nHt + h] - uh;
            STRAT[O + base + a] += w * rh * strat[base + a];
          }
        }
      } else {
        for (let h = 0; h < nHt; h++) {
          const base = h * nA, uh = out[h];
          for (let a = 0; a < nA; a++) REGRET[O + base + a] += actVals[a * nHt + h] - uh;
        }
      }
      ATOP = mark;
    } else {
      const nHt = HANDS[trav].length, nHo = HANDS[node.player].length;
      const strat = aAlloc(nHo * nA); regretMatchInto(node, strat);
      for (let a = 0; a < nA; a++) {
        const amark = ATOP;
        const rO2 = aAlloc(nHo), v = aAlloc(nHt);
        let sumO = 0;
        for (let h = 0; h < nHo; h++) { const x = reachO[h] * strat[h * nA + a]; rO2[h] = x; sumO += x; }
        // prune actions the opponent never takes (exact-zero reach)
        if (sumO === 0) { ATOP = amark; continue; }
        cfr(node.actions[a], trav, reachT, rO2, v);
        for (let h = 0; h < nHt; h++) out[h] += v[h];
        ATOP = amark;
      }
      ATOP = mark;
    }
  }

  // ---- average strategy / best response / EV --------------------------
  function avgStrategyInto(node, out) {
    // no average pool (full-enum DCFR): report the last iterate — the
    // regret-matched current strategy, which is what converges under DCFR
    if (!STRAT) { regretMatchInto(node, out); return; }
    const nA = node.nA, nH = HANDS[node.player].length, O = node.off;
    for (let h = 0; h < nH; h++) {
      const base = h * nA; let sum = 0;
      for (let a = 0; a < nA; a++) sum += STRAT[O + base + a];
      if (sum > 0) for (let a = 0; a < nA; a++) out[base + a] = STRAT[O + base + a] / sum;
      else { const u = 1 / nA; for (let a = 0; a < nA; a++) out[base + a] = u; }
    }
  }
  function avgStrategy(node) { // persistent copy, for UI aggregation
    const out = new Float32Array(HANDS[node.player].length * node.nA);
    avgStrategyInto(node, out);
    return out;
  }

  // one traversal computes BOTH the average-strategy value (outAvg) and the
  // best-response value (outBr) for `trav` vs the opponent's average strategy
  // — halves the cost of metrics() (2 traversals instead of 4).
  function traverseBoth(node, trav, reachO, outAvg, outBr) {
    if (node.type === 'fold') { foldValueInto(node, trav, reachO, outAvg); outBr.set(outAvg); return; }
    if (node.type === 'showdown') { showdownValueInto(node, trav, reachO, outAvg); outBr.set(outAvg); return; }
    if (node.type === 'chance') {
      const Ht = HANDS[trav], Ho = HANDS[1 - trav], nHt = Ht.length, nHo = Ho.length;
      const inv = 1 / node.nCards;
      for (const e of node.entries) {
        const c = e.card, rep = e.repCard;
        const fwdO = APPLY[e.piIdx][1 - trav], invT = APPLY[INV[e.piIdx]][trav];
        const mark = ATOP;
        const rO = aAlloc(nHo), vA = aAlloc(nHt), vB = aAlloc(nHt);
        let sumO = 0;
        for (let j = 0; j < nHo; j++) if (Ho[j].c1 !== rep && Ho[j].c2 !== rep) { const x = reachO[fwdO[j]]; rO[j] = x; sumO += x; }
        if (sumO === 0) { ATOP = mark; continue; } // prune: values are zero
        traverseBoth(e.child, trav, rO, vA, vB);
        for (let h = 0; h < nHt; h++) if (Ht[h].c1 !== c && Ht[h].c2 !== c) {
          outAvg[h] += inv * vA[invT[h]]; outBr[h] += inv * vB[invT[h]];
        }
        ATOP = mark;
      }
      return;
    }
    const nA = node.nA, mark = ATOP;
    if (node.player === trav) {
      const nHt = HANDS[trav].length;
      const strat = aAlloc(nHt * nA); avgStrategyInto(node, strat);
      const valsA = aAlloc(nA * nHt), valsB = aAlloc(nA * nHt);
      for (let a = 0; a < nA; a++) {
        traverseBoth(node.actions[a], trav, reachO,
          valsA.subarray(a * nHt, (a + 1) * nHt), valsB.subarray(a * nHt, (a + 1) * nHt));
      }
      for (let h = 0; h < nHt; h++) {
        const base = h * nA; let u = 0, best = -Infinity;
        for (let a = 0; a < nA; a++) {
          u += strat[base + a] * valsA[a * nHt + h];
          const b = valsB[a * nHt + h]; if (b > best) best = b;
        }
        outAvg[h] = u; outBr[h] = best;
      }
      ATOP = mark;
    } else {
      const nHt = HANDS[trav].length, nHo = HANDS[node.player].length;
      const strat = aAlloc(nHo * nA); avgStrategyInto(node, strat);
      for (let a = 0; a < nA; a++) {
        const amark = ATOP;
        const rO2 = aAlloc(nHo), vA = aAlloc(nHt), vB = aAlloc(nHt);
        let sumO = 0;
        for (let h = 0; h < nHo; h++) { const x = reachO[h] * strat[h * nA + a]; rO2[h] = x; sumO += x; }
        if (sumO === 0) { ATOP = amark; continue; } // prune: values are zero
        traverseBoth(node.actions[a], trav, rO2, vA, vB);
        for (let h = 0; h < nHt; h++) { outAvg[h] += vA[h]; outBr[h] += vB[h]; }
        ATOP = amark;
      }
      ATOP = mark;
    }
  }

  function dot(reach, vec) { let s = 0; for (let i = 0; i < reach.length; i++) s += reach[i] * vec[i]; return s; }

  function metrics() {
    const r0 = initReach(0), r1 = initReach(1);
    const W = NORMW || 1; // exact blocker-compatible matchup weight
    ATOP = 0;
    const a0 = aAlloc(HANDS[0].length), b0 = aAlloc(HANDS[0].length);
    traverseBoth(ROOT, 0, r1, a0, b0);
    const ev0 = dot(r0, a0) / W, br0 = dot(r0, b0) / W;
    ATOP = 0;
    const a1 = aAlloc(HANDS[1].length), b1 = aAlloc(HANDS[1].length);
    traverseBoth(ROOT, 1, r0, a1, b1);
    const ev1 = dot(r1, a1) / W, br1 = dot(r1, b1) / W;
    const exploit = (br0 - ev0) + (br1 - ev1);
    return { evOOP: ev0, evIP: ev1, exploitChips: exploit, exploitPct: 100 * exploit / CFG.pot };
  }

  // ---- public API -----------------------------------------------------
  function setup(cfg) {
    CFG = {
      board: cfg.board.slice(),
      pot: cfg.pot, stack: cfg.stack,
      betSizes: cfg.betSizes, raiseSizes: cfg.raiseSizes,
      allowAllIn: cfg.allowAllIn !== false, maxRaises: cfg.maxRaises ?? 1,
      sampling: cfg.sampling === 'chance' ? 'chance' : 'none',
    };
    const oop = buildCombos(parseRange(cfg.oop), CFG.board);
    const ip = buildCombos(parseRange(cfg.ip), CFG.board);
    if (!oop.length || !ip.length) throw new Error('Empty range after removing board cards.');
    HANDS = [oop, ip];
    KEYIDX = [new Map(), new Map()];
    for (let p = 0; p < 2; p++) HANDS[p].forEach((h, i) => KEYIDX[p].set(comboKey(h.c1, h.c2), i));
    // exact matchup-weight normalizer (blocker-compatible pairs only)
    NORMW = 0;
    for (const a of oop) for (const b of ip) {
      if (a.c1 !== b.c1 && a.c1 !== b.c2 && a.c2 !== b.c1 && a.c2 !== b.c2) NORMW += a.w * b.w;
    }
    // suit-symmetry group (identity-only if disabled → behaves as full enumeration)
    GROUP = cfg.isomorphism === false ? [[0, 1, 2, 3]] : computeGroup();
    buildPermTables();
    ITER = 0; ITERS_DONE = 0;
    DCFR = CFG.sampling !== 'chance';
    // average pool: required under sampling; optional (cfg.exactAverage) otherwise
    STORE_AVG = CFG.sampling === 'chance' || cfg.exactAverage === true;
    MAX_BYTES = Math.max(16, cfg.maxMemoryMB || 256) * 1024 * 1024;
    buildBytes = 0; POOLLEN = 0; REGRET = STRAT = ARENA = null; ATOP = 0;
    SDCACHE = new Map(); SDKEYS = new Set();
    const half = CFG.pot / 2;
    try {
      // pass 1: build the tree structure and assign pool offsets (no float data yet)
      ROOT = buildStreetStart({
        board: CFG.board, contrib: [half, half], stacks: [CFG.stack, CFG.stack],
        streetInvest: [0, 0], acted: [false, false], player: 0, aggressor: -1, numRaises: 0,
        groupIdx: GROUP.map((_, i) => i),
      });
      // pass 2: allocate the float pools in one shot. If the average pool
      // wasn't required, keep it anyway when it's small and fits the budget
      // (build-time counting used 4 B/entry, so re-count the extra 4 B here).
      if (!STORE_AVG && POOLLEN <= AVG_POOL_LIMIT && buildBytes + POOLLEN * 4 <= MAX_BYTES) {
        STORE_AVG = true;
        buildBytes += POOLLEN * 4;
      }
      REGRET = new Float32Array(POOLLEN);
      STRAT = STORE_AVG ? new Float32Array(POOLLEN) : null;
      // pass 3: size the scratch arena to the worst root-to-leaf frame stack
      // (×2 covers traverseBoth's wider frames; small fixed slack for roots)
      const maxNH = Math.max(HANDS[0].length, HANDS[1].length);
      ARENA = new Float32Array(2 * arenaNeed(ROOT) + 8 * maxNH + 4096);
    } catch (e) {
      ROOT = null; HANDS = null; REGRET = STRAT = ARENA = null; POOLLEN = 0; // drop partial tree for GC
      SDCACHE = null; SDKEYS = null;
      if (e.tooLarge) {
        throw new Error(
          `This spot needs too much memory to solve safely (>${Math.round(MAX_BYTES / 1048576)} MB). ` +
          `That's almost always a flop with wide ranges. Fix: solve the turn/river instead, ` +
          `trim the ranges, use fewer bet/raise sizes, or lower Max raises.`);
      }
      throw e;
    }
    return {
      oopCombos: oop.length, ipCombos: ip.length, nodes: countNodes(ROOT),
      memMB: Math.round((buildBytes + ARENA.byteLength) / 1048576), symmetries: GROUP.length,
    };
  }
  // worst-case arena floats live at once = max over root-to-leaf paths of the
  // sum of per-node frame sizes (see cfr(): strat + actVals + per-action reach)
  function arenaNeed(node) {
    if (!node || node.type === 'fold' || node.type === 'showdown') return 0;
    if (node.type === 'chance') {
      let mx = 0; const seen = new Set();
      for (const e of node.entries) {
        if (seen.has(e.child)) continue; seen.add(e.child);
        const v = arenaNeed(e.child); if (v > mx) mx = v;
      }
      return HANDS[0].length + HANDS[1].length + Math.max(HANDS[0].length, HANDS[1].length) + mx;
    }
    const p = node.player, nHp = HANDS[p].length, nHq = HANDS[1 - p].length, nA = node.nA;
    let mx = 0;
    for (const a of node.actions) { const v = arenaNeed(a); if (v > mx) mx = v; }
    return nHp * nA + Math.max(nA * nHp + nHp, nHp + nHq) + mx;
  }
  function countNodes(node, seen) {
    seen = seen || { n: 0 };
    seen.n++;
    if (node.type === 'decision') for (const a of node.actions) countNodes(a, seen);
    else if (node.type === 'chance') {
      const done = new Set();
      for (const e of node.entries) { if (done.has(e.child)) continue; done.add(e.child); countNodes(e.child, seen); }
    }
    return seen.n;
  }

  function iterate(n) {
    for (let it = 0; it < n; it++) {
      ITER = ITERS_DONE + 1;
      WEIGHT = DCFR ? ITER * ITER : ITER; // gamma=2 strategy averaging under DCFR
      ATOP = 0; SAMPLE_USED = false;
      cfr(ROOT, 0, initReach(0), initReach(1), aAlloc(HANDS[0].length));
      ATOP = 0; SAMPLE_USED = false;
      cfr(ROOT, 1, initReach(1), initReach(0), aAlloc(HANDS[1].length));
      ITERS_DONE++;
      if (DCFR) {
        // DCFR discounting (alpha=1.5, beta=0): positive regrets decay by
        // t^1.5/(t^1.5+1), negatives halve — soft flooring that recovers
        // from early mistakes much faster than plain CFR+.
        const ta = Math.pow(ITERS_DONE, 1.5), fpos = ta / (ta + 1);
        for (let i = 0; i < POOLLEN; i++) {
          const r = REGRET[i];
          if (r > 0) REGRET[i] = r * fpos; else if (r < 0) REGRET[i] = r * 0.5;
        }
      }
    }
    return ITERS_DONE;
  }

  // aggregate a decision node's average strategy to 13x13 hand classes
  function aggregateStrategy(node, reachO) {
    if (!node || node.type !== 'decision') return null;
    const strat = avgStrategy(node), nA = node.nA, H = HANDS[node.player];
    
    if (!reachO) reachO = initReach(1 - node.player);

    // Compute EV for each hand to include in detailed view
    const ev = new Float32Array(H.length);
    const a0 = new Float32Array(H.length);
    const b0 = new Float32Array(H.length);
    const mark = ATOP;
    traverseBoth(node, node.player, reachO, a0, b0);
    ATOP = mark;

    const opp = 1 - node.player;
    const Ho = HANDS[opp];
    for(let h=0; h<H.length; h++) {
      let sumW = 0;
      const c1 = H[h].c1, c2 = H[h].c2;
      for(let o=0; o<Ho.length; o++) {
         if (Ho[o].c1 !== c1 && Ho[o].c1 !== c2 && Ho[o].c2 !== c1 && Ho[o].c2 !== c2) {
           sumW += reachO[o];
         }
      }
      ev[h] = sumW > 0 ? a0[h] / sumW : 0;
    }

    const classes = new Map();
    for (let h = 0; h < H.length; h++) {
      const cl = classOf(H[h].c1, H[h].c2), w = H[h].w;
      let e = classes.get(cl);
      if (!e) { e = { freq: new Float64Array(nA), ev: 0, w: 0, n: 0 }; classes.set(cl, e); }
      for (let a = 0; a < nA; a++) e.freq[a] += w * strat[h * nA + a];
      e.ev += w * ev[h];
      e.w += w; e.n++;
    }
    for (const e of classes.values()) {
      for (let a = 0; a < e.freq.length; a++) e.freq[a] /= (e.w || 1);
      e.ev /= (e.w || 1);
    }
    // child node kinds so the UI knows which actions can be drilled into
    const children = node.actions.map((c, i) => ({ label: node.labels[i], type: c.type }));
    return { player: node.player, labels: node.labels.slice(), classes, children };
  }

  function rootStrategy() { return aggregateStrategy(ROOT, initReach(1)); }

  // walk the tree along an array of action indices (decision edges only)
  function nodeByPath(path) {
    let n = ROOT;
    for (const a of path) {
      if (!n || n.type !== 'decision') return null;
      n = n.actions[a];
    }
    return n;
  }

  function strategyAt(path) {
    path = path || [];
    let n = ROOT;
    let r0 = initReach(0);
    let r1 = initReach(1);
    for (const a of path) {
      if (!n || n.type !== 'decision') break;
      const strat = avgStrategy(n);
      const nA = n.nA;
      if (n.player === 0) {
         const nextR = new Float32Array(r0.length);
         for(let h=0; h<r0.length; h++) nextR[h] = r0[h] * strat[h * nA + a];
         r0 = nextR;
      } else {
         const nextR = new Float32Array(r1.length);
         for(let h=0; h<r1.length; h++) nextR[h] = r1[h] * strat[h * nA + a];
         r1 = nextR;
      }
      n = n.actions[a];
    }
    return aggregateStrategy(n, n ? (n.player === 0 ? r1 : r0) : null);
  }

  // human-readable line: who acted and what they did, for each edge in path
  function pathInfo(path) {
    let n = ROOT; const line = [];
    for (const a of (path || [])) {
      if (!n || n.type !== 'decision') break;
      line.push({ player: n.player, label: n.labels[a] });
      n = n.actions[a];
    }
    return line;
  }

  const api = {
    cardToInt, intToStr, parseCards, score5, parseRange, buildCombos, classOf, comboKey,
    setup, iterate, metrics, rootStrategy, strategyAt, pathInfo,
    get iters() { return ITERS_DONE; },
    RANKS, SUITS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GTO = api;
})(typeof window !== 'undefined' ? window : globalThis);
