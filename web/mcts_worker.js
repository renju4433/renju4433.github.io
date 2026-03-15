importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
let H = 8, W = 8;
let HORIZ_COUNT = 0, VERT_COUNT = 0, PASS_INDEX = 0;
let session = null;
let c_puct = 1.5;
let progressInterval = 16;
let activeToken = null;
let running = false;
let batchSize = 16;
let totalSims = 0;
let posKey = null;
const RootSims = new Map();
const P = new Map();
const Nsa = new Map();
const Wsa = new Map();
const Qsa = new Map();
function softmaxLog(arr) {
  const m = Math.max(...arr);
  const exps = arr.map(v => Math.exp(v - m));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / s);
}
function countMovesHorizontal(occ) {
  let k = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W - 1; c++) if (!occ[r][c] && !occ[r][c + 1]) k++;
  return k;
}
function countMovesVertical(occ) {
  let k = 0;
  for (let r = 0; r < H - 1; r++) for (let c = 0; c < W; c++) if (!occ[r][c] && !occ[r + 1][c]) k++;
  return k;
}
function validMoves(occ, turn) {
  const res = [];
  if (turn === 1) {
    for (let r = 0; r < H; r++) for (let c = 0; c < W - 1; c++) {
      if (!occ[r][c] && !occ[r][c + 1]) {
        const a = r * (W - 1) + c;
        if (isActionInCorridor(occ, a)) continue;
        if (isOppositeImpossible(occ, a)) continue;
        res.push(a);
      }
    }
  } else {
    for (let r = 0; r < H - 1; r++) for (let c = 0; c < W; c++) {
      if (!occ[r][c] && !occ[r + 1][c]) {
        const a = HORIZ_COUNT + r * W + c;
        if (isActionInCorridor(occ, a)) continue;
        if (isOppositeImpossible(occ, a)) continue;
        res.push(a);
      }
    }
  }
  return res;
}
function actionToCells(a) {
  if (a < HORIZ_COUNT) { const r = Math.floor(a / (W - 1)); const c = a % (W - 1); return [r, c, r, c + 1]; }
  const k = a - HORIZ_COUNT; const r = Math.floor(k / W); const c = k % W; return [r, c, r + 1, c];
}
function applyAction(occ, turn, a) {
  const nocc = occ.map(row => row.slice());
  if (a < HORIZ_COUNT) { const r = Math.floor(a / (W - 1)); const c = a % (W - 1); nocc[r][c] = 1; nocc[r][c + 1] = 1; return { occ: nocc, turn: -1 }; }
  const k = a - HORIZ_COUNT; const r = Math.floor(k / W); const c = k % W; nocc[r][c] = 1; nocc[r + 1][c] = 1; return { occ: nocc, turn: 1 };
}
function analyzeCorridors(occ) {
  const vis = Array.from({ length: H }, () => Array(W).fill(false));
  let hStock = 0, vStock = 0;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let r0 = 0; r0 < H; r0++) {
    for (let c0 = 0; c0 < W; c0++) {
      if (occ[r0][c0] || vis[r0][c0]) continue;
      // BFS one empty component
      let q = [[r0, c0]];
      vis[r0][c0] = true;
      let minR = r0, maxR = r0, minC = c0, maxC = c0;
      let cnt = 0;
      while (q.length) {
        const [r, c] = q.pop();
        cnt++;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          if (occ[nr][nc] || vis[nr][nc]) continue;
          vis[nr][nc] = true;
          q.push([nr, nc]);
        }
      }
      const hSpan = maxR - minR + 1;
      const wSpan = maxC - minC + 1;
      if (hSpan === 1 && wSpan >= 1) {
        // 1 x n horizontal corridor: only horizontal player can play
        hStock += Math.floor(cnt / 2);
      } else if (wSpan === 1 && hSpan >= 1) {
        // n x 1 vertical corridor: only vertical player can play
        vStock += Math.floor(cnt / 2);
      } else {
        // Found a 2D empty region; not reducible
        return { solvable: false };
      }
    }
  }
  return { solvable: true, h: hStock, v: vStock };
}
function rotateFlip(arr2d, k, fl) {
  let b = arr2d;
  for (let i = 0; i < k; i++) {
    const nr = b[0].length, nc = b.length;
    const nb = Array.from({ length: nr }, () => Array.from({ length: nc }, () => 0));
    for (let r = 0; r < b.length; r++) for (let c = 0; c < b[0].length; c++) nb[nr - 1 - c][r] = b[r][c];
    b = nb;
  }
  if (fl) b = b.map(row => row.slice().reverse());
  return b;
}
function canonicalize(boardOcc, boardTurn) {
  const h = boardOcc.length, w = boardOcc[0].length;
  const groupA = [{ k: 0, fl: false }, { k: 2, fl: false }, { k: 0, fl: true }, { k: 2, fl: true }];
  const groupB = (h === w) ? [{ k: 1, fl: false }, { k: 3, fl: false }, { k: 1, fl: true }, { k: 3, fl: true }] : [];
  let bestA = null, bestAKey = null;
  for (const g of groupA) {
    const o = rotateFlip(boardOcc, g.k, g.fl);
    const key = new Uint8Array(o.flat()).toString();
    if (bestAKey === null || key < bestAKey) { bestAKey = key; bestA = { k: g.k, fl: g.fl, occ: o, turn: rotateFlip(boardTurn, g.k, g.fl) }; }
  }
  let bestB = null, bestBKey = null;
  for (const g of groupB) {
    const o = rotateFlip(boardOcc, g.k, g.fl);
    const key = new Uint8Array(o.flat()).toString();
    if (bestBKey === null || key < bestBKey) { bestBKey = key; bestB = { k: g.k, fl: g.fl, occ: o, turn: rotateFlip(boardTurn, g.k, g.fl) }; }
  }
  let negate = false, k = bestA.k, fl = bestA.fl, occ_t = bestA.occ, turn_t = bestA.turn;
  if (bestBKey !== null && bestBKey < bestAKey) { negate = true; k = bestB.k; fl = bestB.fl; occ_t = bestB.occ; turn_t = bestB.turn; }
  return { occ_t, turn_t, k, fl, negate };
}
function transformCoord(r, c, k, fl, H0, W0) {
  let r1, c1, h1 = H0, w1 = W0;
  if (k === 0) { r1 = r; c1 = c; }
  else if (k === 1) { r1 = H0 - 1 - c; c1 = r; h1 = W0; w1 = H0; }
  else if (k === 2) { r1 = H0 - 1 - r; c1 = W0 - 1 - c; }
  else { r1 = c; c1 = W0 - 1 - r; h1 = W0; w1 = H0; }
  if (fl) c1 = (w1 - 1) - c1;
  return { r: r1, c: c1, h: h1, w: w1 };
}
function cellsToAction(r1, c1, r2, c2) {
  if (r1 === r2) { const r = r1; const c = c1 < c2 ? c1 : c2; return r * (W - 1) + c; }
  const r = r1 < r2 ? r1 : r2; const c = c1 === c2 ? c1 : c2; return HORIZ_COUNT + r * W + c;
}
function inverseMapPi(pi, k, fl) {
  const A = HORIZ_COUNT + VERT_COUNT;
  const src = pi.slice(0, A);
  const dst = new Float64Array(A);
  for (let a = 0; a < A; a++) {
    if (src[a] === 0) continue;
    const cc = actionToCells(a);
    const inv_k = (4 - (k % 4)) % 4;
    const t1 = transformCoord(cc[0], cc[1], inv_k, fl, (k % 2 === 0) ? H : W, (k % 2 === 0) ? W : H);
    const t2 = transformCoord(cc[2], cc[3], inv_k, fl, (k % 2 === 0) ? H : W, (k % 2 === 0) ? W : H);
    const a2 = cellsToAction(t1.r, t1.c, t2.r, t2.c);
    dst[a2] = src[a];
  }
  return Array.from(dst);
}
function isActionInCorridor(occ, a) {
  const cc = actionToCells(a);
  const sr = cc[0], sc = cc[1];
  if (occ[sr][sc]) return false;
  const vis = Array.from({ length: H }, () => Array(W).fill(false));
  const stack = [[sr, sc]];
  vis[sr][sc] = true;
  let minR = sr, maxR = sr, minC = sc, maxC = sc;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (stack.length) {
    const [r, c] = stack.pop();
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      if (occ[nr][nc] || vis[nr][nc]) continue;
      vis[nr][nc] = true;
      stack.push([nr, nc]);
    }
  }
  const hSpan = maxR - minR + 1;
  const wSpan = maxC - minC + 1;
  return (hSpan === 1 || wSpan === 1);
}
function isOppositeImpossible(occ, a) {
  const [r1, c1, r2, c2] = actionToCells(a);
  if (r1 === r2) {
    const v1 = ((r1 > 0 && !occ[r1 - 1][c1]) || (r1 + 1 < H && !occ[r1 + 1][c1]));
    const v2 = ((r2 > 0 && !occ[r2 - 1][c2]) || (r2 + 1 < H && !occ[r2 + 1][c2]));
    return (!v1 && !v2);
  } else {
    const h1 = ((c1 > 0 && !occ[r1][c1 - 1]) || (c1 + 1 < W && !occ[r1][c1 + 1]));
    const h2 = ((c2 > 0 && !occ[r2][c2 - 1]) || (c2 + 1 < W && !occ[r2][c2 + 1]));
    return (!h1 && !h2);
  }
}
async function predict(occ, turn) {
  const turnPlane = Array.from({ length: H }, () => Array.from({ length: W }, () => (turn === 1 ? 1 : -1)));
  const { occ_t, turn_t, k, fl, negate } = canonicalize(occ, turnPlane);
  const data = new Float32Array(1 * 2 * H * W);
  let idx = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) data[idx++] = occ_t[r][c] ? 1 : 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) data[idx++] = turn_t[r][c];
  const input = new ort.Tensor('float32', data, [1, 2, H, W]);
  const out = await session.run({ input });
  const pi = softmaxLog(Array.from(out.pi_log.data));
  let piMapped = pi;
  if (k !== 0 || fl) piMapped = inverseMapPi(pi, k, fl);
  const vRaw = out.v.data[0];
  const v = negate ? -vRaw : vRaw;
  return { pi: piMapped, v };
}
function keyOf(occ, turn) {
  return (turn === 1 ? 'H|' : 'V|') + occ.flat().join('');
}
function getN(sa) { return Nsa.get(sa) || 0; }
function setN(sa, v) { Nsa.set(sa, v); }
function getW(sa) { return Wsa.get(sa) || 0; }
function setW(sa, v) { Wsa.set(sa, v); }
function getQ(sa) { return Qsa.get(sa) || 0; }
function setQ(sa, v) { Qsa.set(sa, v); }
async function searchOnce(occCur, turnCur) {
  const A = HORIZ_COUNT + VERT_COUNT;
  // Corridor solver: if all empty components are 1xn or nx1, compute exact outcome
  const cor = analyzeCorridors(occCur);
  if (cor.solvable) {
    const my = (turnCur === 1) ? cor.h : cor.v;
    const opp = (turnCur === -1) ? cor.h : cor.v;
    const scoreExact = my - opp - 0.5;
    return { v: scoreExact };
  }
  const k = keyOf(occCur, turnCur);
  if (!P.has(k)) {
    const pr = await predict(occCur, turnCur);
    const valids = new Array(A).fill(0);
    for (const a of validMoves(occCur, turnCur)) valids[a] = 1;
    const masked = pr.pi.map((p, i) => valids[i] ? p : 0);
    const s = masked.reduce((a, b) => a + b, 0);
    const pi = s > 0 ? masked.map(x => x / s) : masked.map(() => 1e-8);
    P.set(k, pi);
    return { v: pr.v};
  }
  const piStored = P.get(k);
  const validsAll = validMoves(occCur, turnCur);
  const nonCorr = [];
  for (const a of validsAll) {
    if (!isActionInCorridor(occCur, a)) nonCorr.push(a);
  }
  const validsList = nonCorr.length ? nonCorr : validsAll;
  let best = -Infinity, bestA = validsList[0];
  let sumN = 0;
  for (const a of validsList) sumN += getN(k + ':' + a);
  const sqrtSum = Math.sqrt(sumN + 1);
  for (const a of validsList) {
    const sa = k + ':' + a;
    const q = getQ(sa);
    const u = c_puct * piStored[a] * sqrtSum / (1 + getN(sa));
    const total = q + u;
    if (total > best) { best = total; bestA = a; }
  }
  const next = applyAction(occCur, turnCur, bestA);
  const resChild = await searchOnce(next.occ, next.turn);
  const vCurrent = -resChild.v;
  const sa = k + ':' + bestA;
  setN(sa, getN(sa) + 1);
  setW(sa, getW(sa) + vCurrent);
  setQ(sa, getW(sa) / getN(sa));
  return { v: vCurrent};
}
function resetTree() {
  P.clear(); Nsa.clear(); Wsa.clear(); Qsa.clear();
  totalSims = 0;
}
function ensurePosition(occ, turn) {
  const k = keyOf(occ, turn);
  posKey = k;
}
function bestActionAndWinRate(occ, turn) {
  const A = HORIZ_COUNT + VERT_COUNT;
  const k = keyOf(occ, turn);
  const visits = new Array(A).fill(0);
  for (let a = 0; a < A; a++) visits[a] = Nsa.get(k + ':' + a) || 0;
  let bestA = 0, bestN = -1;
  for (let a = 0; a < A; a++) if (visits[a] > bestN) { bestN = visits[a]; bestA = a; }
  const qBest = getQ(k + ':' + bestA) || 0;
  const winRate = qBest;
  const all = [];
  for (let a = 0; a < A; a++) {
    const n = visits[a];
    if (n <= 0) continue;
    const q = getQ(k + ':' + a) || 0;
    const wr = q;
    all.push({ a, n, q, winRate: wr });
  }
  all.sort((x, y) => y.n - x.n);
  const top = all.slice(0, 6);
  const sims = RootSims.get(k) || 0;
  return { bestAction: bestA, winRate, qBest, totalSims: sims, top };
}
async function runLoop(occ, turn, myToken) {
  const rootK = keyOf(occ, turn);
  if (!RootSims.has(rootK)) RootSims.set(rootK, 0);
  while (running && activeToken && activeToken === myToken) {
    for (let i = 0; i < batchSize; i++) {
      if (!running || !activeToken || activeToken !== myToken) break;
      await searchOnce(occ, turn);
      RootSims.set(rootK, (RootSims.get(rootK) || 0) + 1);
    }
    const summary = bestActionAndWinRate(occ, turn);
    postMessage({ type: 'progress', sims: summary.totalSims, bestAction: summary.bestAction, winRate: summary.winRate, top: summary.top, token: activeToken });

    await new Promise(resolve => setTimeout(resolve, 0)); 
  }
}
onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    H = msg.H || H;
    W = msg.W || W;
    HORIZ_COUNT = H * (W - 1);
    VERT_COUNT = (H - 1) * W;
    PASS_INDEX = HORIZ_COUNT + VERT_COUNT;
    c_puct = msg.c_puct || c_puct;
    progressInterval = msg.progressInterval || progressInterval;
    batchSize = msg.batchSize || batchSize;
    try {
      ort.env.wasm.wasmPaths = (msg.wasmPaths || 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/');
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      session = await ort.InferenceSession.create(msg.modelUrl, { executionProviders: ['wasm'] });
      postMessage({ type: 'ready' });
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    }
  } else if (msg.type === 'start') {
    if (!session) { postMessage({ type: 'error', error: 'session not ready' }); return; }
    H = msg.H || H; W = msg.W || W;
    HORIZ_COUNT = H * (W - 1);
    VERT_COUNT = (H - 1) * W;
    PASS_INDEX = HORIZ_COUNT + VERT_COUNT;
    c_puct = msg.c_puct || c_puct;
    progressInterval = msg.progressInterval || progressInterval;
    batchSize = msg.batchSize || batchSize;
    activeToken = msg.token || null;
    const occ = msg.occ;
    const turn = msg.turn;
    ensurePosition(occ, turn);
    running = true;
    runLoop(occ, turn, activeToken);
  } else if (msg.type === 'pause') {
    running = false;
  } else if (msg.type === 'resume') {
    if (!session) { postMessage({ type: 'error', error: 'session not ready' }); return; }
    const occ = msg.occ;
    const turn = msg.turn;
    activeToken = msg.token || activeToken;
    running = true;
    runLoop(occ, turn, activeToken);
  } else if (msg.type === 'setPosition') {
    const occ = msg.occ;
    const turn = msg.turn;
    activeToken = msg.token || activeToken;
    ensurePosition(occ, turn);
    if (msg.autoStart) {
      running = true;
      runLoop(occ, turn, activeToken);
    } else {
      running = false;
    }
  }
};
