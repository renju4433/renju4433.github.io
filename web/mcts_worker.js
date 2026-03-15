let ortSession = null;
let H = 8, W = 8;
let C_PUCT = 1.5;
let progressInterval = 16;
let running = false;
let paused = false;
let currentOcc = null;
let currentTurn = -1;
let currentToken = null;
let simsCount = 0;
function keyFromState(occ, turn) {
  const arr = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) arr.push(occ[r][c] ? 1 : 0);
  return (turn === 1 ? 'H' : 'V') + '|' + arr.join('');
}
function legalActions(occ, turn) {
  const vis = Array.from({ length: H }, () => Array(W).fill(false));
  const strip = Array.from({ length: H }, () => Array(W).fill(false));
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let r0 = 0; r0 < H; r0++) {
    for (let c0 = 0; c0 < W; c0++) {
      if (occ[r0][c0] || vis[r0][c0]) continue;
      const q = [[r0, c0]];
      vis[r0][c0] = true;
      const comp = [];
      let minR = r0, maxR = r0, minC = c0, maxC = c0;
      while (q.length) {
        const [r, c] = q.pop();
        comp.push([r, c]);
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
      const hSpan = maxR - minR + 1, wSpan = maxC - minC + 1;
      if (hSpan === 1 || wSpan === 1) {
        for (const [r, c] of comp) strip[r][c] = true;
      }
    }
  }
  const actsGood = [];
  const actsBad = [];
  if (turn === 1) {
    for (let r = 0; r < H; r++) for (let c = 0; c < W - 1; c++) {
      if (!occ[r][c] && !occ[r][c + 1] && !(strip[r][c] && strip[r][c + 1])) {
        const a = r * (W - 1) + c;
        const v1 = ((r > 0 && !occ[r - 1][c]) || (r + 1 < H && !occ[r + 1][c]));
        const v2 = ((r > 0 && !occ[r - 1][c + 1]) || (r + 1 < H && !occ[r + 1][c + 1]));
        if (v1 || v2) actsGood.push(a); else actsBad.push(a);
      }
    }
  } else {
    for (let r = 0; r < H - 1; r++) for (let c = 0; c < W; c++) {
      if (!occ[r][c] && !occ[r + 1][c] && !(strip[r][c] && strip[r + 1][c])) {
        const a = H * (W - 1) + r * W + c;
        const h1 = ((c > 0 && !occ[r][c - 1]) || (c + 1 < W && !occ[r][c + 1]));
        const h2 = ((c > 0 && !occ[r + 1][c - 1]) || (c + 1 < W && !occ[r + 1][c + 1]));
        if (h1 || h2) actsGood.push(a); else actsBad.push(a);
      }
    }
  }
  if (actsGood.length > 0) return actsGood;
  return actsBad;
}
function applyAction(occ, turn, a) {
  const nocc = occ.map(row => row.slice());
  if (a < H * (W - 1)) {
    const r = Math.floor(a / (W - 1)), c = a % (W - 1);
    nocc[r][c] = 1; nocc[r][c + 1] = 1;
    return { occ: nocc, turn: -1 };
  } else {
    const k = a - H * (W - 1);
    const r = Math.floor(k / W), c = k % W;
    nocc[r][c] = 1; nocc[r + 1][c] = 1;
    return { occ: nocc, turn: 1 };
  }
}
function encodeInput(occ, turn) {
  const x = new Float32Array(1 * 2 * H * W);
  let idx = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) x[idx++] = occ[r][c] ? 1 : 0;
  const p = (turn === 1) ? 1 : 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) x[idx++] = p;
  return x;
}
function maskAndMapPolicy(p2d, occ) {
  const A = H * (W - 1) + (H - 1) * W;
  const flat = new Float64Array(A);
  for (let r = 0; r < H; r++) for (let c = 0; c < W - 1; c++) {
    const k = r * (W - 1) + c;
    flat[k] = (!occ[r][c] && !occ[r][c + 1]) ? p2d[1][r][c] : 0;
  }
  for (let r = 0; r < H - 1; r++) for (let c = 0; c < W; c++) {
    const k = H * (W - 1) + r * W + c;
    flat[k] = (!occ[r][c] && !occ[r + 1][c]) ? p2d[0][r][c] : 0;
  }
  let sum = 0;
  for (let i = 0; i < A; i++) sum += flat[i];
  if (sum > 0) for (let i = 0; i < A; i++) flat[i] /= sum;
  return flat;
}
function argmax(arr) {
  let bestI = 0, bestV = -1e18;
  for (let i = 0; i < arr.length; i++) if (arr[i] > bestV) { bestV = arr[i]; bestI = i; }
  return bestI;
}
const table = new Map();
function ensureNode(key) {
  if (!table.has(key)) table.set(key, { N: new Map(), W: new Map(), Q: new Map(), P: null, sumN: 0 });
  return table.get(key);
}
async function expandNode(key, occ, turn) {
  const node = ensureNode(key);
  if (node.P !== null) return node;
  const x = encodeInput(occ, turn);
  const feeds = { input: new ort.Tensor('float32', x, [1, 2, H, W]) };
  const out = await ortSession.run(feeds);
  const pRaw = out.p.data;
  const vRaw = out.v.data;
  const p2d = [[], []];
  let idx = 0;
  for (let o = 0; o < 2; o++) {
    p2d[o] = Array.from({ length: H }, () => Array.from({ length: W }, () => 0));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) p2d[o][r][c] = pRaw[idx++];
  }
  const P = maskAndMapPolicy(p2d, occ);
  node.P = P;
  return { node, v: vRaw[0] };
}
function selectAction(node, occ, turn) {
  const legal = legalActions(occ, turn);
  let bestA = legal[0], bestScore = -1e18;
  for (const a of legal) {
    const N = node.N.get(a) || 0;
    const Q = node.Q.get(a) || 0;
    const P = node.P ? node.P[a] : 0;
    const u = C_PUCT * P * Math.sqrt(node.sumN + 1) / (1 + N);
    const score = Q + u;
    if (score > bestScore) { bestScore = score; bestA = a; }
  }
  return bestA;
}
function backup(path, value, leafTurn) {
  for (let i = path.length - 1; i >= 0; i--) {
    const { key, a, player } = path[i];
    const node = table.get(key);
    const N = (node.N.get(a) || 0) + 1;
    node.N.set(a, N);
    node.sumN += 1;
    const add = (player === leafTurn) ? value : -value;
    const W = (node.W.get(a) || 0) + add;
    node.W.set(a, W);
    node.Q.set(a, W / N);
  }
}
async function simulate(rootOcc, rootTurn) {
  let occ = rootOcc.map(row => row.slice());
  let turn = rootTurn;
  let key = keyFromState(occ, turn);
  let node = ensureNode(key);
  const path = [];
  if (node.P === null) {
    const { v } = await expandNode(key, occ, turn);
    return { path, value: v, leafTurn: turn };
  }
  while (true) {
    const legal = legalActions(occ, turn);
    if (legal.length === 0) {
      const curOri = (turn === 1) ? 1 : 0;
      const opp = 1 - curOri;
      const res = quickAnchorsIfAllStrips(occ, opp);
      const v = res.ok ? -res.count - 0.5 : 0;
      return { path, value: v, leafTurn: turn };
    }
    const a = selectAction(node, occ, turn);
    path.push({ key, a, player: turn });
    const nxt = applyAction(occ, turn, a);
    occ = nxt.occ;
    turn = nxt.turn;
    key = keyFromState(occ, turn);
    node = ensureNode(key);
    if (node.P === null) {
      const { v } = await expandNode(key, occ, turn);
      return { path, value: v, leafTurn: turn };
    }
  }
}
function bestFromRoot(occ, turn) {
  const key = keyFromState(occ, turn);
  const node = table.get(key);
  const A = H * (W - 1) + (H - 1) * W;
  const counts = new Array(A).fill(0);
  if (node) {
    const legal = legalActions(occ, turn);
    for (const a of legal) counts[a] = node.N.get(a) || 0;
  } else {
    const legal = legalActions(occ, turn);
    for (const a of legal) counts[a] = 1;
  }
  let bestA = 0, bestN = -1;
  for (let i = 0; i < counts.length; i++) if (counts[i] > bestN) { bestN = counts[i]; bestA = i; }
  return { a: bestA, counts };
}
function quickAnchorsIfAllStrips(occ, orientation) {
  const vis = Array.from({ length: H }, () => Array(W).fill(false));
  let totalEmpty = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (!occ[r][c]) totalEmpty++;
  if (totalEmpty === 0) return { ok: true, count: 0 };
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  let visitedCount = 0;
  let count = 0;
  for (let r0 = 0; r0 < H; r0++) {
    for (let c0 = 0; c0 < W; c0++) {
      if (occ[r0][c0] || vis[r0][c0]) continue;
      const q = [[r0, c0]];
      vis[r0][c0] = true;
      const comp = [];
      const rows = new Set();
      const cols = new Set();
      while (q.length) {
        const [r, c] = q.pop();
        comp.push([r, c]);
        rows.add(r);
        cols.add(c);
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
          if (occ[nr][nc] || vis[nr][nc]) continue;
          vis[nr][nc] = true;
          q.push([nr, nc]);
        }
      }
      visitedCount += comp.length;
      if (rows.size === 1) {
        if (orientation === 1) count += Math.floor(comp.length / 2);
        else count -= Math.floor(comp.length / 2);
      } else if (cols.size === 1) {
        if (orientation === 0) count += Math.floor(comp.length / 2);
        else count -= Math.floor(comp.length / 2);  
      } else {
        return { ok: false, count: 0 };
      }
    }
  }
  if (visitedCount !== totalEmpty) return { ok: false, count: 0 };
  return { ok: true, count };
}
function topKFromRoot(occ, turn, k) {
  const key = keyFromState(occ, turn);
  const node = table.get(key);
  const legal = legalActions(occ, turn);
  const arr = [];
  for (const a of legal) {
    const n = node ? (node.N.get(a) || 0) : 0;
    const q = node ? (node.Q.get(a) || 0) : 0;
    arr.push({ a, n, s: q });
  }
  arr.sort((x, y) => y.n - x.n);
  const res = [];
  for (let i = 0; i < Math.min(k, arr.length); i++) res.push({ a: arr[i].a, n: arr[i].n, s: arr[i].s });
  return res;
}
async function runSearchLoop(token) {
  simsCount = 0;
  while (running && !paused && token === currentToken) {
    const { path, value, leafTurn } = await simulate(currentOcc, currentTurn);
    backup(path, value, leafTurn);
    simsCount += 1;
    if (simsCount % progressInterval === 0) {
      const key = keyFromState(currentOcc, currentTurn);
      const node = table.get(key);
      const best = bestFromRoot(currentOcc, currentTurn);
      const top = topKFromRoot(currentOcc, currentTurn, 6);
      let score = 0;
      if (node) {
        score = node.Q.get(best.a) || 0;
      }
      postMessage({ type: 'progress', bestAction: best.a, sims: simsCount, top, token: currentToken, score });
      await new Promise(res => setTimeout(res, 0));
    }
  }
}
onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    H = msg.H || H;
    W = msg.W || W;
    C_PUCT = msg.c_puct || C_PUCT;
    progressInterval = msg.progressInterval || progressInterval;
    if (msg.wasmPaths) {
      self.importScripts(msg.wasmPaths + 'ort.min.js');
      if (self.ort && self.ort.env && self.ort.env.wasm) {
        self.ort.env.wasm.wasmPaths = msg.wasmPaths;
        self.ort.env.wasm.numThreads = 1;
      }
    } else {
      self.importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');
      if (self.ort && self.ort.env && self.ort.env.wasm) {
        self.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
        self.ort.env.wasm.numThreads = 1;
      }
    }
    ortSession = await ort.InferenceSession.create(msg.modelUrl, { executionProviders: ['wasm'] });
    postMessage({ type: 'ready' });
  } else if (msg.type === 'setPosition') {
    currentOcc = msg.occ.map(row => row.slice());
    currentTurn = msg.turn;
    currentToken = msg.token || currentToken;
    if (msg.autoStart && ortSession && !running) {
      running = true;
      paused = false;
      runSearchLoop(currentToken);
    }
  } else if (msg.type === 'start') {
    if (!ortSession) {
      postMessage({ type: 'error', error: 'model_not_loaded' });
      return;
    }
    currentOcc = msg.occ.map(row => row.slice());
    currentTurn = msg.turn;
    currentToken = msg.token || Date.now().toString();
    running = true;
    paused = false;
    runSearchLoop(currentToken);
  } else if (msg.type === 'pause') {
    paused = true;
  } else if (msg.type === 'resume') {
    if (!ortSession) return;
    currentOcc = msg.occ.map(row => row.slice());
    currentTurn = msg.turn;
    currentToken = msg.token || currentToken;
    running = true;
    paused = false;
    runSearchLoop(currentToken);
  } else if (msg.type === 'stop') {
    running = false;
    paused = false;
  }
};
