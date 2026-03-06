const goSizeSel = document.getElementById('goSize');
const goBtnBlack = document.getElementById('goBtnBlack');
const goBtnWhite = document.getElementById('goBtnWhite');
const goBtnErase = document.getElementById('goBtnErase');
const goClearBtn = document.getElementById('goClearBtn');
const goCalcBtn = document.getElementById('goCalcBtn');
const goResult = document.getElementById('goResult');
const goBreakdown = document.getElementById('goBreakdown');
const goRegionSel = document.getElementById('goRegionSel');
let CGT = null;
if (window.CGT_READY && typeof window.CGT_READY.then === 'function') {
  window.CGT_READY.then(m => { CGT = m; });
}
if (goCalcBtn) {
  goCalcBtn.disabled = true;
  if (window.CGT_READY && typeof window.CGT_READY.then === 'function') {
    window.CGT_READY.then(() => { goCalcBtn.disabled = false; });
  } else {
    goCalcBtn.disabled = false;
  }
}
if (goSizeSel) {
  goSizeSel.innerHTML = '';
  for (let s = 2; s <= 19; s++) {
    const opt = document.createElement('option');
    opt.value = String(s);
    opt.textContent = String(s);
    goSizeSel.appendChild(opt);
  }
  goSizeSel.value = '9';
}
let goSize = parseInt(goSizeSel.value);
let goBoard = JGO.createBoard({ size: goSize });
let goRenderer = JGO.createRenderer('#goBoard', { board: goBoard, theme: 'kaya-medium', interactions: { enabled: true } });
let boardState = Array.from({ length: goSize }, () => Array(goSize).fill(0));
const MAX_EMPTY = 8;
let currentTool = 'black';
let selectedRegions = new Set();
function makeEmptyState(n) {
  return Array.from({ length: n }, () => Array(n).fill(0));
}
function toLatex(s) {
  let out = s;
  out = out.replace(/(^|[^\\w])(-?\d+)\s*\/\s*(\d+)/g, (m, pre, numText, den) => {
    const neg = numText.startsWith('-');
    const num = neg ? numText.slice(1) : numText;
    const sign = neg ? '-' : '';
    return `${pre}${sign}\\frac[[OB]]${num}[[CB]][[OB]]${den}[[CB]]`;
  });
  out = out.replaceAll('{', '\\{').replaceAll('}', '\\}').replaceAll('|', '\\mid');
  out = out.replaceAll('[[OB]]', '{').replaceAll('[[CB]]', '}');
  return out;
}
function renderLatexTargets(targets) {
  if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
    MathJax.typesetPromise(targets).catch(() => {});
  }
}
function parseDy(str) {
  if (!str || typeof str !== 'string') return null;
  if (str.indexOf('/') >= 0) {
    const parts = str.split('/');
    const num = parseInt(parts[0]);
    let den = parseInt(parts[1]);
    let exp = 0;
    while (den > 1) { den = Math.floor(den / 2); exp++; }
    return { num, exp };
  }
  const n = parseInt(str);
  if (isNaN(n)) return null;
  return { num: n, exp: 0 };
}
function encodeBoard() {
  const rows = [];
  for (let y = 0; y < goSize; y++) {
    let row = '';
    for (let x = 0; x < goSize; x++) {
      const v = boardState[y][x];
      row += v === 1 ? 'X' : (v === -1 ? 'O' : '.');
    }
    rows.push(row);
  }
  return rows.join(',');
}
function decodeBoard(pos, size) {
  const parts = pos.split(',');
  if (parts.length !== size) return null;
  const s = makeEmptyState(size);
  for (let y = 0; y < size; y++) {
    const row = parts[y];
    if (row.length !== size) return null;
    for (let x = 0; x < size; x++) {
      const ch = row[x];
      s[y][x] = ch === 'X' ? 1 : (ch === 'O' ? -1 : 0);
    }
  }
  return s;
}
function setRouteFromState() {
  const pos = encodeBoard();
  const n = goSize;
  const hash = '/game?n=' + String(n) + '&pos=' + encodeURIComponent(pos);
  if (location.hash !== '#' + hash) location.hash = hash;
}
function tryInitFromHash() {
  const h = location.hash;
  if (!h || h.length < 2) return;
  const qStart = h.indexOf('?');
  const path = qStart >= 0 ? h.slice(1, qStart) : h.slice(1);
  if (path !== '/game' && path !== 'game') return;
  const qs = qStart >= 0 ? h.slice(qStart + 1) : '';
  const params = new URLSearchParams(qs);
  const nStr = params.get('n');
  const pos = params.get('pos');
  if (!nStr || !pos) return;
  const n = parseInt(nStr);
  if (!n || n < 2 || n > 19) return;
  goSizeSel.value = String(n);
  goSize = n;
  goBoard = JGO.createBoard({ size: goSize });
  goRenderer.setBoard(goBoard);
  const s = decodeBoard(pos, n);
  boardState = s || makeEmptyState(goSize);
  syncBoard();
  goResult.textContent = '';
  goBreakdown.innerHTML = '';
}
function clearAllMarks() {
  for (let y = 0; y < goSize; y++) {
    for (let x = 0; x < goSize; x++) {
      goBoard.setMark({ x, y }, JGO.MARK.NONE);
    }
  }
}
function labelRegionsOnBoard(regions) {
  for (const r of regions) {
    if (!r.cells || r.cells.length === 0) continue;
    const [x, y] = r.cells[0];
    goBoard.setMark({ x, y }, String(r.id + 1));
  }
  goRenderer.render();
}
function renderRegionSelector(regions) {
  if (!goRegionSel) return;
  goRegionSel.innerHTML = '';
  const title = document.createElement('span');
  title.className = 'sel-title';
  title.textContent = '计算范围：';
  goRegionSel.appendChild(title);
  if (regions.length === 0) {
    const none = document.createElement('span');
    none.textContent = '无可选区域';
    goRegionSel.appendChild(none);
    selectedRegions.clear();
    return;
  }
  selectedRegions.forEach(id => {
    if (!regions.find(r => r.id === id)) selectedRegions.delete(id);
  });
  for (const r of regions) {
    const wrap = document.createElement('label');
    wrap.className = 'sel-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedRegions.has(r.id);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedRegions.add(r.id);
      else selectedRegions.delete(r.id);
    });
    const txt = document.createElement('span');
    txt.textContent = String(r.id + 1);
    wrap.appendChild(cb);
    wrap.appendChild(txt);
    goRegionSel.appendChild(wrap);
  }
}
function syncBoard() {
  goBoard.clear();
  for (let y = 0; y < goSize; y++) {
    for (let x = 0; x < goSize; x++) {
      const v = boardState[y][x];
      if (v === 1) goBoard.setStone({ x, y }, JGO.STONE.BLACK);
      else if (v === -1) goBoard.setStone({ x, y }, JGO.STONE.WHITE);
    }
  }
  goRenderer.render();
  const regions = buildRegions(boardState);
  clearAllMarks();
  labelRegionsOnBoard(regions);
  renderRegionSelector(regions);
}
function countEmpty(s) {
  let c = 0;
  for (let y = 0; y < s.length; y++) for (let x = 0; x < s.length; x++) if (s[y][x] === 0) c++;
  return c;
}
function neighbors(x, y, n) {
  const arr = [];
  if (x > 0) arr.push([x - 1, y]);
  if (x + 1 < n) arr.push([x + 1, y]);
  if (y > 0) arr.push([x, y - 1]);
  if (y + 1 < n) arr.push([x, y + 1]);
  return arr;
}
function buildRegions(s) {
  const n = s.length;
  const comp = Array.from({ length: n }, () => Array(n).fill(-1));
  const regions = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (s[y][x] !== 0 || comp[y][x] !== -1) continue;
      const id = regions.length;
      const cells = [];
      const q = [[x, y]];
      comp[y][x] = id;
      while (q.length) {
        const [cx, cy] = q.shift();
        cells.push([cx, cy]);
        for (const [nx, ny] of neighbors(cx, cy, n)) {
          if (s[ny][nx] === 0 && comp[ny][nx] === -1) {
            comp[ny][nx] = id;
            q.push([nx, ny]);
          }
        }
      }
      const set = new Set();
      for (const [ex, ey] of cells) set.add(`${ex},${ey}`);
      regions.push({ id, cells, set });
    }
  }
  return regions;
}
function regionScore(s, region) {
  const n = s.length;
  let b = 0, w = 0;
  const seen = new Set();
  for (const [x, y] of region.cells) {
    const v = s[y][x];
    if (v === 1) b++;
    else if (v === -1) w++;
  }
  for (const [sx, sy] of region.cells) {
    const key0 = `${sx},${sy}`;
    if (seen.has(key0)) continue;
    if (s[sy][sx] !== 0) continue;
    const q = [[sx, sy]];
    const empties = [];
    const adj = new Set();
    seen.add(key0);
    while (q.length) {
      const [cx, cy] = q.shift();
      empties.push([cx, cy]);
      for (const [nx, ny] of neighbors(cx, cy, n)) {
        const v = s[ny][nx];
        const key = `${nx},${ny}`;
        if (region.set.has(key) && v === 0 && !seen.has(key)) { seen.add(key); q.push([nx, ny]); }
        else if (v === 1) adj.add('B');
        else if (v === -1) adj.add('W');
      }
    }
    if (adj.size === 1) {
      if (adj.has('B')) b += empties.length;
      else w += empties.length;
    }
  }
  return b - w;
}
function optionsForPlayerRestricted(s, player, region, visited) {
  const opts = [];
  const n = s.length;
  for (const [x, y] of region.cells) {
    if (s[y][x] !== 0) continue;
    const next = playMove(s, player, x, y);
    if (!next) continue;
    const childKey = keyOf(next) + '|R:' + region.id;
    if (visited.has(childKey)) continue;
    visited.add(childKey);
    opts.push(positionToRegionGame(next, region, visited));
    visited.delete(childKey);
  }
  return opts;
}
function positionToRegionGame(s, region, visited) {
  const lefts = optionsForPlayerRestricted(s, 1, region, visited);
  const rights = optionsForPlayerRestricted(s, -1, region, visited);
  const li = lefts.map(x => x);
  const ri = rights.map(x => x);
  return get_game(li, ri);
}
function groupAndLiberties(s, x, y) {
  const n = s.length;
  const color = s[y][x];
  const q = [[x, y]];
  const seen = new Set([`${x},${y}`]);
  const group = [];
  const libs = new Set();
  while (q.length) {
    const [cx, cy] = q.shift();
    group.push([cx, cy]);
    for (const [nx, ny] of neighbors(cx, cy, n)) {
      const key = `${nx},${ny}`;
      const v = s[ny][nx];
      if (v === 0) {
        libs.add(key);
      } else if (v === color && !seen.has(key)) {
        seen.add(key);
        q.push([nx, ny]);
      }
    }
  }
  return { group, libs };
}
function removeGroup(s, g) {
  for (const [x, y] of g) s[y][x] = 0;
}
function deepCopy(s) {
  return s.map(r => r.slice());
}
function playMove(s, player, x, y) {
  const n = s.length;
  if (s[y][x] !== 0) return null;
  const t = deepCopy(s);
  t[y][x] = player;
  const opp = -player;
  const captured = [];
  for (const [nx, ny] of neighbors(x, y, n)) {
    if (t[ny][nx] === opp) {
      const info = groupAndLiberties(t, nx, ny);
      if (info.libs.size === 0) captured.push(info.group);
    }
  }
  for (const g of captured) removeGroup(t, g);
  const selfInfo = groupAndLiberties(t, x, y);
  if (selfInfo.libs.size === 0) return null;
  return t;
}
function territoryScore(s) {
  const n = s.length;
  let b = 0, w = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (s[y][x] === 1) b++; else if (s[y][x] === -1) w++; }
  const seen = new Set();
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (s[y][x] !== 0) continue;
      const key0 = `${x},${y}`;
      if (seen.has(key0)) continue;
      const q = [[x, y]];
      const empties = [];
      const adj = new Set();
      seen.add(key0);
      while (q.length) {
        const [cx, cy] = q.shift();
        empties.push([cx, cy]);
        for (const [nx, ny] of neighbors(cx, cy, n)) {
          const v = s[ny][nx];
          const key = `${nx},${ny}`;
          if (v === 0 && !seen.has(key)) { seen.add(key); q.push([nx, ny]); }
          else if (v === 1) adj.add('B');
          else if (v === -1) adj.add('W');
        }
      }
      if (adj.size === 1) {
        if (adj.has('B')) b += empties.length;
        else w += empties.length;
      }
    }
  }
  return b - w;
}
function intValue(n) {
  if (n === 0) return namesToValues["0"];
  if (n > 0) {
    let acc = namesToValues["1"];
    for (let i = 1; i < n; i++) acc = plus(acc, namesToValues["1"]);
    return acc;
  }
  const pos = intValue(-n);
  return neg(pos);
}
function keyOf(s) {
  return s.map(r => r.join(',')).join('|');
}
function optionsForPlayer(s, player, justPassed, visited) {
  const opts = [];
  const baseKey = keyOf(s) + `|P:${justPassed?1:0}`;
  if (justPassed) {
    const sc = territoryScore(s);
    opts.push(intValue(sc));
  }
  const n = s.length;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (s[y][x] !== 0) continue;
      const next = playMove(s, player, x, y);
      if (!next) continue;
      const childKey = keyOf(next) + '|P:0';
      if (visited.has(childKey)) continue;
      visited.add(childKey);
      opts.push(positionToGame(next, false, visited));
      visited.delete(childKey);
    }
  }
  if (!justPassed) {
    const passKey = keyOf(s) + '|P:1';
    if (!visited.has(passKey)) {
      visited.add(passKey);
      opts.push(positionToGame(s, true, visited));
      visited.delete(passKey);
    }
  }
  return opts;
}
function positionToGame(s, justPassed, visited) {
  const lefts = optionsForPlayer(s, 1, justPassed, visited);
  const rights = optionsForPlayer(s, -1, justPassed, visited);
  const li = lefts.map(x => x);
  const ri = rights.map(x => x);
  return get_game(li, ri);
}
function computeCgtValue() {
  const regions = buildRegions(boardState);
  if (CGT) {
    const vec = new CGT.VectorInt();
    for (let y = 0; y < goSize; y++) for (let x = 0; x < goSize; x++) vec.push_back(boardState[y][x]);
    const res = CGT.compute_go_value(vec, goSize);
    vec.delete();
    const items = [];
    const getSize = typeof res.items.size === 'function' ? res.items.size() : (Array.isArray(res.items) ? res.items.length : 0);
    let selectedSumIdx = namesToValues["0"];
    const useSubset = selectedRegions && selectedRegions.size > 0;
    for (let i = 0; i < getSize; i++) {
      const it = typeof res.items.get === 'function' ? res.items.get(i) : res.items[i];
      if (!useSubset || selectedRegions.has(it.id)) {
        items.push({ id: it.id, valueStr: it.value_str, meanStr: it.mean_str, idx: it.idx });
        try {
          const parsed = parse(lex(it.value_str));
          if (parsed && parsed[0]) {
            const gi = toGame(parsed[1]);
            selectedSumIdx = plus(selectedSumIdx, gi);
          }
        } catch (_) {}
      }
    }
    const sumStr = useSubset ? display(selectedSumIdx) : res.sum_str;
    return { sumStr, items };
  }
  let sum = namesToValues["0"];
  const items = [];
  for (const r of regions) {
    if (selectedRegions && selectedRegions.size > 0 && !selectedRegions.has(r.id)) continue;
    const visited = new Set();
    visited.add(keyOf(boardState) + '|R:' + r.id);
    const gi = positionToRegionGame(boardState, r, visited);
    sum = plus(sum, gi);
    items.push({ id: r.id, idx: gi });
  }
  return { sum, items };
}
goRenderer.whenReady().then(() => {
  goRenderer.render();
});
goRenderer.on('click', ({ point }) => {
  if (!point) return;
  const x = point.x, y = point.y;
  clearAllMarks();
  if (currentTool === 'erase') {
    boardState[y][x] = 0;
    goBoard.setStone({ x, y }, JGO.STONE.CLEAR);
  } else {
    const isBlack = currentTool === 'black';
    boardState[y][x] = isBlack ? 1 : -1;
    goBoard.setStone({ x, y }, isBlack ? JGO.STONE.BLACK : JGO.STONE.WHITE);
  }
  goRenderer.render();
  const regions = buildRegions(boardState);
  labelRegionsOnBoard(regions);
  renderRegionSelector(regions);
  setRouteFromState();
});
function setActiveTool(t) {
  currentTool = t;
  goBtnBlack.classList.toggle('active', t === 'black');
  goBtnWhite.classList.toggle('active', t === 'white');
  goBtnErase.classList.toggle('active', t === 'erase');
}
goBtnBlack.addEventListener('click', () => setActiveTool('black'));
goBtnWhite.addEventListener('click', () => setActiveTool('white'));
goBtnErase.addEventListener('click', () => setActiveTool('erase'));
goSizeSel.addEventListener('change', () => {
  goSize = parseInt(goSizeSel.value);
  goBoard = JGO.createBoard({ size: goSize });
  goRenderer.setBoard(goBoard);
  boardState = makeEmptyState(goSize);
  syncBoard();
  goResult.textContent = '';
  goRenderer.render();
  setRouteFromState();
});
goClearBtn.addEventListener('click', () => {
  boardState = makeEmptyState(goSize);
  goBoard.clear();
  goResult.textContent = '';
  goRenderer.render();
  setRouteFromState();
});
goCalcBtn.addEventListener('click', () => {
  const res = computeCgtValue();
  if (res == null) return;
  const regions = buildRegions(boardState);
  const modal = document.getElementById('resultModal');
  const modalClose = document.getElementById('modalClose');
  const modalBoard = document.getElementById('modalBoard');
  const modalBreakdown = document.getElementById('modalBreakdown');
  if (!modal || !modalBoard || !modalBreakdown) return;
  modalBreakdown.innerHTML = '';
  const table = document.createElement('table');
  table.id = 'goBreakdownTable';
  const colgroup = document.createElement('colgroup');
  const colRegion = document.createElement('col');
  colRegion.className = 'col-region';
  const colValue = document.createElement('col');
  colValue.className = 'col-value';
  const colMean = document.createElement('col');
  colMean.className = 'col-mean';
  colgroup.appendChild(colRegion);
  colgroup.appendChild(colValue);
  colgroup.appendChild(colMean);
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const th1 = document.createElement('th');
  const th2 = document.createElement('th');
  const th3 = document.createElement('th');
  th1.textContent = '区域';
  th2.textContent = '值';
  th3.textContent = '均值';
  hr.appendChild(th1);
  hr.appendChild(th2);
  hr.appendChild(th3);
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  let sumMean = { num: 0, exp: 0 };
  let sumKnown = true;
  for (const it of res.items) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = String(it.id + 1);
    const td2 = document.createElement('td');
    const latexVal = toLatex(it.valueStr ? it.valueStr : display(it.idx));
    td2.innerHTML = `<span class="latex-math">\\(${latexVal}\\)</span>`;
    const td3 = document.createElement('td');
    if (it.meanStr) {
      td3.innerHTML = `<span class="latex-math">\\(${toLatex(it.meanStr)}\\)</span>`;
      const dy = parseDy(it.meanStr);
      if (dy) sumMean = dyAdd(sumMean, dy);
      else sumKnown = false;
    } else {
      const mt = typeof gameMeanTemp === 'function' ? gameMeanTemp(it.idx) : { mean: null, temp: null };
      if (mt.mean) {
        const meanStr = dyToString(mt.mean);
        td3.innerHTML = `<span class="latex-math">\\(${toLatex(meanStr)}\\)</span>`;
        sumMean = dyAdd(sumMean, mt.mean);
      } else {
        td3.textContent = '—';
        sumKnown = false;
      }
    }
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tbody.appendChild(tr);
  }
  const totalTr = document.createElement('tr');
  const totalTd1 = document.createElement('td');
  totalTd1.textContent = '总值';
  const totalTd2 = document.createElement('td');
  const totalLatex = toLatex(res.sumStr ? res.sumStr : display(res.sum));
  totalTd2.innerHTML = `<span class="latex-math">\\(${totalLatex}\\)</span>`;
  const totalTd3 = document.createElement('td');
  if (sumKnown) {
    const sumMeanStr = dyToString(sumMean);
    totalTd3.innerHTML = `<span class="latex-math">\\(${toLatex(sumMeanStr)}\\)</span>`;
  } else {
    totalTd3.textContent = '—';
  }
  totalTr.appendChild(totalTd1);
  totalTr.appendChild(totalTd2);
  totalTr.appendChild(totalTd3);
  tbody.appendChild(totalTr);
  table.appendChild(colgroup);
  table.appendChild(thead);
  table.appendChild(tbody);
  modalBreakdown.appendChild(table);
  modalBoard.innerHTML = '';
  const mBoard = JGO.createBoard({ size: goSize });
  const mRenderer = JGO.createRenderer('#modalBoard', { board: mBoard, theme: 'kaya-medium', interactions: { enabled: false } });
  for (let y = 0; y < goSize; y++) for (let x = 0; x < goSize; x++) {
    const v = boardState[y][x];
    if (v === 1) mBoard.setStone({ x, y }, JGO.STONE.BLACK);
    else if (v === -1) mBoard.setStone({ x, y }, JGO.STONE.WHITE);
  }
  for (const r of regions) {
    if (!r.cells || r.cells.length === 0) continue;
    const [x, y] = r.cells[0];
    mBoard.setMark({ x, y }, String(r.id + 1));
  }
  mRenderer.render();
  renderLatexTargets([modalBreakdown]);
  modal.classList.add('show');
  if (modalClose) modalClose.onclick = () => { modal.classList.remove('show'); };
});
window.addEventListener('hashchange', () => {
  tryInitFromHash();
});
tryInitFromHash();
