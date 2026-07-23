/* UI controller for the Pocket GTO solver. When served over http(s) the
 * engine runs in a Web Worker (UI never blocks); on file:// it falls back
 * to the main thread in small async batches (Workers are blocked from
 * file:// in most browsers). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

  // distinct colours per action index for the legend/cells (more readable than by-name)
  const PALETTE = ['var(--check)', 'var(--bet1)', 'var(--bet2)', 'var(--bet3)', 'var(--allin)', 'var(--good)', '#a86bd8'];
  function colorFor(label, idx) {
    if (label === 'check' || label === 'call') return 'var(--check)';
    if (label === 'allin') return 'var(--allin)';
    if (label === 'fold') return 'var(--fold)';
    return PALETTE[idx % PALETTE.length];
  }

  // ---- presets -----------------------------------------------------------
  const RANGE_PRESETS = {
    'Preset 1': '50 51, 40 41, 30 31',
    'Preset 2': '20 21, 10 11, 30 32',
  };
  const BOARD_PRESETS = {
    'Preset 1': '10 20 30',
    'Preset 2': '2 3 4',
    'Preset 3': '51 52 53',
    'Preset 4': '15 25 35',
    'Preset 5': '8 18 28',
    'Preset 6': '40 41 42',
  };
  let presetTarget = 'oop'; // which range box presets load into
  function buildPresets() {
    const pc = $('presets');
    pc.innerHTML = '';
    const lab = document.createElement('span');
    lab.className = 'preset-lab'; lab.textContent = 'Load into:';
    pc.appendChild(lab);
    const tgt = {};
    ['oop', 'ip'].forEach((t) => {
      const b = document.createElement('span');
      b.className = 'chip tgt' + (t === presetTarget ? ' on' : '');
      b.textContent = t.toUpperCase();
      b.onclick = () => {
        presetTarget = t;
        tgt.oop.className = 'chip tgt' + (presetTarget === 'oop' ? ' on' : '');
        tgt.ip.className = 'chip tgt' + (presetTarget === 'ip' ? ' on' : '');
      };
      tgt[t] = b; pc.appendChild(b);
    });
    const sep = document.createElement('span');
    sep.className = 'preset-lab'; sep.textContent = '·'; pc.appendChild(sep);
    Object.keys(RANGE_PRESETS).forEach((k) => {
      const c = document.createElement('span'); c.className = 'chip'; c.textContent = k;
      c.onclick = () => { $(presetTarget).value = RANGE_PRESETS[k]; };
      pc.appendChild(c);
    });
    const bc = $('boardPresets');
    bc.innerHTML = '';
    Object.entries(BOARD_PRESETS).forEach(([k, v]) => {
      const c = document.createElement('span'); c.className = 'chip'; c.textContent = k;
      c.onclick = () => { $('board').value = v; };
      bc.appendChild(c);
    });
  }

  function parseSizes(str) {
    return str.split(/[,\s]+/).map(parseFloat).filter((x) => isFinite(x) && x > 0);
  }

  // ---- preflop charts (8-max cash, 100bb) ---------------------------------
  function flash(el) { el.style.borderColor = 'var(--good)'; setTimeout(() => { el.style.borderColor = ''; }, 700); }
  function scrollTop() { if (typeof window !== 'undefined' && window.scrollTo) { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} } }

  function loadRange(which, range) { $(which).value = range; flash($(which)); scrollTop(); }
  // load both ranges of a vs-RFI matchup into the solver as a 3-bet pot
  function setup3betPot(opener, me, entry) {
    const oopSeat = earlierPostflop(opener, me);
    const ipSeat = oopSeat === opener ? me : opener;
    const rangeFor = (seat) => (seat === me ? entry.threebet : RFI[opener]);
    $('oop').value = rangeFor(oopSeat);
    $('ip').value = rangeFor(ipSeat);
    $('pot').value = 20; $('stack').value = 90; // ~3-bet pot at 100bb
    ['oop', 'ip', 'pot', 'stack'].forEach((id) => flash($(id)));
    const role = (seat) => (seat === me ? '3-bet' : 'open');
    $('setupNote').textContent = `3-bet pot loaded · OOP = ${oopSeat} ${role(oopSeat)}, IP = ${ipSeat} ${role(ipSeat)} · pot 20 / stack 90. Pick a board and Solve. (Opener shown as full open range — narrow to taste.)`;
    scrollTop();
  }
  function loadRow(label, range) {
    const row = document.createElement('div'); row.className = 'loadrow';
    if (label) { const l = document.createElement('span'); l.className = 'loadlabel'; l.textContent = label; row.appendChild(l); }
    [['→ OOP', 'oop'], ['→ IP', 'ip']].forEach(([lbl, which]) => {
      const b = document.createElement('button'); b.className = 'loadbtn'; b.textContent = lbl;
      b.onclick = () => loadRange(which, range); row.appendChild(b);
    });
    return row;
  }
  // single-colour chart (RFI opening ranges)
  function renderEntry(display, pos, range, naNote) {
    display.innerHTML = '';
    if (!range) {
      const n = document.createElement('p'); n.className = 'chart-note';
      n.textContent = pos + ' ' + naNote; display.appendChild(n); return;
    }
    const { set, combos } = rangeClasses(range);
    const t = document.createElement('div'); t.className = 'chart-title'; t.textContent = `${pos} open `;
    const s = document.createElement('span'); s.className = 'chart-sub';
    s.textContent = '· ' + (combos / 1326 * 100).toFixed(0) + '% of hands';
    t.appendChild(s); display.appendChild(t);
    const sc = document.createElement('div'); sc.className = 'chart-wrap';
    sc.appendChild(chartGridEl(set)); display.appendChild(sc);
    display.appendChild(loadRow('', range));
    const txt = document.createElement('div'); txt.className = 'chart-range'; txt.textContent = range;
    display.appendChild(txt);
  }
  function buildChartSection(hostId, data, naNote) {
    const host = $(hostId); if (!host) return;
    host.innerHTML = '';
    const row = document.createElement('div'); row.className = 'posbtns';
    const display = document.createElement('div'); display.className = 'chart-display';
    host.appendChild(row); host.appendChild(display);
    const btns = {};
    const select = (pos) => {
      POSITIONS.forEach((p) => { btns[p].className = 'posbtn' + (p === pos ? ' on' : ''); });
      renderEntry(display, pos, data[pos], naNote);
    };
    POSITIONS.forEach((pos) => {
      const b = document.createElement('span'); b.className = 'posbtn'; b.textContent = pos;
      b.onclick = () => select(pos); btns[pos] = b; row.appendChild(b);
    });
    select(POSITIONS.find((p) => data[p]) || POSITIONS[0]); // default to first playable position
  }

  // two-colour chart (vs-RFI: call = blue, 3-bet = green)
  function renderVs(display, opener, me, entry) {
    display.innerHTML = '';
    const tb = entry.threebet ? rangeClasses(entry.threebet) : { set: new Set(), combos: 0 };
    const call = entry.call ? rangeClasses(entry.call) : { set: new Set(), combos: 0 };
    const t = document.createElement('div'); t.className = 'chart-title';
    t.textContent = `${me} vs ${opener} open`; display.appendChild(t);
    const leg = document.createElement('div'); leg.className = 'legend';
    leg.innerHTML = `<span><i style="background:var(--good)"></i>3-bet ${(tb.combos / 1326 * 100).toFixed(0)}%</span>`
      + (call.combos ? `<span><i style="background:var(--check)"></i>call ${(call.combos / 1326 * 100).toFixed(0)}%</span>`
        : `<span style="color:var(--muted)">3-bet or fold — no flatting from the SB</span>`);
    display.appendChild(leg);
    const sc = document.createElement('div'); sc.className = 'chart-wrap';
    const g = document.createElement('div'); g.className = 'chartgrid';
    const allCl = new Set([...tb.set, ...call.set]);
    for (const cl of allCl) {
      const kind = tb.set.has(cl) ? 'tb' : call.set.has(cl) ? 'call' : ''; // 3-bet takes precedence
      const cell = document.createElement('div');
      cell.className = 'chartcell' + (kind ? ' ' + kind : '');
      cell.textContent = cl; g.appendChild(cell);
    }
    sc.appendChild(g); display.appendChild(sc);
    display.appendChild(loadRow('3-bet', entry.threebet || ''));
    if (call.combos) display.appendChild(loadRow('call', entry.call));
    const setup = document.createElement('button'); setup.className = 'setupbtn';
    setup.textContent = '⚔ Set up this 3-bet pot in the solver';
    setup.onclick = () => setup3betPot(opener, me, entry);
    display.appendChild(setup);
  }
  function buildVsSection(hostId) {
    const host = $(hostId); if (!host) return;
    host.innerHTML = '';
    const lblO = document.createElement('div'); lblO.className = 'vs-label'; lblO.textContent = 'Opener seat:';
    const openerRow = document.createElement('div'); openerRow.className = 'posbtns';
    const lblM = document.createElement('div'); lblM.className = 'vs-label'; lblM.textContent = 'My seat:';
    const meRow = document.createElement('div'); meRow.className = 'posbtns';
    const display = document.createElement('div'); display.className = 'chart-display';
    host.appendChild(lblO); host.appendChild(openerRow);
    host.appendChild(lblM); host.appendChild(meRow); host.appendChild(display);
    let curOpener = null, curMe = null;
    const oBtns = {}, mBtns = {};
    const selectMe = (me) => {
      curMe = me;
      Object.keys(mBtns).forEach((p) => { mBtns[p].className = 'posbtn' + (p === me ? ' on' : ''); });
      renderVs(display, curOpener, curMe, vsEntry(curOpener, curMe));
    };
    const buildMe = () => {
      meRow.innerHTML = ''; Object.keys(mBtns).forEach((k) => delete mBtns[k]);
      const resp = respondersFor(curOpener);
      resp.forEach((me) => {
        const b = document.createElement('span'); b.className = 'posbtn'; b.textContent = me;
        b.onclick = () => selectMe(me); mBtns[me] = b; meRow.appendChild(b);
      });
      selectMe(resp[0]);
    };
    const selectOpener = (op) => {
      curOpener = op;
      OPENERS.forEach((p) => { oBtns[p].className = 'posbtn' + (p === op ? ' on' : ''); });
      buildMe();
    };
    OPENERS.forEach((op) => {
      const b = document.createElement('span'); b.className = 'posbtn'; b.textContent = op;
      b.onclick = () => selectOpener(op); oBtns[op] = b; openerRow.appendChild(b);
    });
    selectOpener('CO'); // default: multiple responders to choose from
  }
  function buildCharts() {
    buildChartSection('charts', RFI, RFI_NA);
    buildVsSection('vscharts');
  }

  // ---- engine backend ------------------------------------------------------
  // Worker when served over http(s); direct (main-thread) on file:// and in
  // the Node smoke test. Both expose the same promise API; direct also has
  // viewNow() so navigation renders synchronously.
  let backend = null, backendReady = null;

  function directBackend() {
    const viewNow = (p) => ({ strategy: GTO.strategyAt(p), line: GTO.pathInfo(p) });
    return {
      mode: 'direct',
      setup: (cfg) => Promise.resolve(GTO.setup(cfg)),
      iterate: (n) => { GTO.iterate(n); return Promise.resolve({ done: n }); },
      metrics: () => Promise.resolve(GTO.metrics()),
      view: (p) => Promise.resolve(viewNow(p)),
      viewNow,
    };
  }
  function workerBackend(w) {
    const pend = new Map(); let seq = 0;
    w.addEventListener('message', (e) => {
      const d = e.data; if (!d || d.id == null) return;
      const p = pend.get(d.id); if (!p) return;
      pend.delete(d.id);
      if (d.ok) p.res(d.result); else p.rej(new Error(d.error));
    });
    w.addEventListener('error', () => { for (const p of pend.values()) p.rej(new Error('Solver worker crashed — reload the page.')); pend.clear(); });
    const call = (op, args) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); w.postMessage({ id, op, args }); });
    return {
      mode: 'worker',
      setup: (cfg) => call('setup', { cfg }),
      iterate: (n, msBudget) => call('iterate', { n, msBudget }),
      metrics: () => call('metrics'),
      view: (p) => call('view', { path: p }),
      call,
      terminate: () => { w.terminate(); }
    };
  }

  function multiWorkerBackend(workers) {
    let useMulti = false;
    return {
      mode: 'worker',
      numThreads: workers.length,
      setup: (cfg) => {
        useMulti = cfg.sampling === 'chance' && workers.length > 1;
        if (useMulti) {
          return Promise.all(workers.map(w => w.setup(cfg))).then(res => res[0]);
        } else {
          return workers[0].setup(cfg);
        }
      },
      iterate: (n, msBudget) => {
        if (useMulti) {
          return Promise.all(workers.map(w => w.iterate(n, msBudget))).then(res => res[0]);
        } else {
          return workers[0].iterate(n, msBudget);
        }
      },
      metrics: async () => {
        if (useMulti) {
          const strats = await Promise.all(workers.map(w => w.call('getStrat')));
          if (!strats[0]) return workers[0].metrics();
          const combined = new Float32Array(strats[0].length);
          for (let i = 0; i < strats.length; i++) {
            const s = strats[i];
            for (let j = 0; j < combined.length; j++) combined[j] += s[j];
          }
          return workers[0].call('metricsCombined', { strat: combined });
        } else {
          return workers[0].metrics();
        }
      },
      view: async (p) => {
        if (useMulti) {
          const strats = await Promise.all(workers.map(w => w.call('getStrat')));
          if (!strats[0]) return workers[0].view(p);
          const combined = new Float32Array(strats[0].length);
          for (let i = 0; i < strats.length; i++) {
            const s = strats[i];
            for (let j = 0; j < combined.length; j++) combined[j] += s[j];
          }
          return workers[0].call('viewCombined', { path: p, strat: combined });
        } else {
          return workers[0].view(p);
        }
      }
    };
  }

  function createBackend() {
    return new Promise((resolve) => {
      const direct = () => resolve(directBackend());
      if (typeof Worker === 'undefined' || typeof location === 'undefined' || location.protocol === 'file:') return direct();
      
      const numThreads = navigator.hardwareConcurrency || 4;
      const workers = [];
      let readyCount = 0;
      let settled = false;

      const fail = () => { 
        if (!settled) { 
          settled = true; 
          clearTimeout(t); 
          workers.forEach(w => w.terminate()); 
          direct(); 
        } 
      };
      const t = setTimeout(fail, 3000);

      for (let i = 0; i < numThreads; i++) {
        let w;
        try { w = new Worker('worker.js'); } catch (e) { 
          if (i === 0) fail(); 
          break; 
        }
        const wb = workerBackend(w);
        workers.push(wb);
        w.addEventListener('error', () => { if (i === 0) fail(); });
        w.addEventListener('message', (e) => {
          if (!settled && e.data && e.data.type === 'ready') {
            readyCount++;
            if (readyCount === workers.length) {
              settled = true;
              clearTimeout(t);
              resolve(multiWorkerBackend(workers));
            }
          }
        });
      }
    });
  }
  function ensureBackend() {
    if (!backendReady) {
      backendReady = createBackend().then((b) => {
        backend = b;
        const el = $('engineMode');
        if (el) el.textContent = b.mode === 'worker'
          ? `Solver runs in ${b.numThreads} background threads — the page stays fully responsive.`
          : 'Solver runs on the main thread in small batches (file:// mode).';
        return b;
      });
    }
    return backendReady;
  }

  // ---- solve loop --------------------------------------------------------
  let running = false;
  const sleep = () => new Promise((r) => setTimeout(r, 0));

  async function solve() {
    if (running) return;
    $('err').textContent = ''; $('setupNote').textContent = '';
    const be = await ensureBackend();
    let info;
    const cfg = {
      board: GTO.parseCards($('board').value),
      pot: Math.max(1, +$('pot').value || 1),
      stack: Math.max(1, +$('stack').value || 1),
      oop: $('oop').value, ip: $('ip').value,
      betSizes: parseSizes($('bets').value),
      raiseSizes: parseSizes($('raises').value),
      allowAllIn: $('allin').checked,
      maxRaises: Math.max(0, +$('maxr').value || 0),
      // memory budget scaled to the device so a flop solve can't exhaust RAM;
      // high-memory mode raises the ceiling for big flop solves on desktops
      // (the build still aborts safely before allocating if the spot won't fit)
      maxMemoryMB: (() => {
        const dm = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
        return $('himem') && $('himem').checked
          ? Math.min(768, Math.round(dm * 96))
          : Math.min(256, Math.round(dm * 48));
      })(),
      sampling: $('sampling').checked ? 'chance' : 'none', // MCCFR public chance sampling
    };
    if (cfg.board.length < 0 || cfg.board.length > 3) { $('err').textContent = 'Board must be 0–3 cards.'; return; }
    if (new Set(cfg.board).size !== cfg.board.length) { $('err').textContent = 'Board has duplicate cards.'; return; }
    if (!cfg.betSizes.length) cfg.betSizes = [0.75];
    if (!cfg.raiseSizes.length) cfg.raiseSizes = [1.0];
    try { info = await be.setup(cfg); } catch (e) { $('err').textContent = e.message; return; }
    path = []; // new spot -> back to OOP first decision

    $('treeInfo').textContent = `${info.oopCombos}×${info.ipCombos} combos · ${info.nodes.toLocaleString()} nodes · ${info.memMB} MB`
      + (info.symmetries > 1 ? ` · ${info.symmetries}× symmetry` : '');
    if (info.nodes > 80000) {
      $('err').textContent = be.mode === 'worker'
        ? '⚠ Heavy tree — solving will take a while. Tip: fewer bet sizes, smaller ranges, or solve the turn/river.'
        : '⚠ Heavy tree — solving may take a while and stay busy. Tip: fewer bet sizes, smaller ranges, or solve the turn/river.';
    }
    const total = Math.max(1, +$('iters').value || 100);
    // auto-stop: 0 / blank disables it
    const target = Math.max(0, parseFloat($('target') && $('target').value) || 0);
    running = true; $('solve').disabled = true; $('stop').disabled = false;

    // direct mode: shrink batches as the tree grows so each frame stays short
    const batch = info.nodes > 4000 ? 1 : info.nodes > 800 ? 2 : 5;
    let done = 0, lastUI = 0, lastMetric = 0, converged = false;
    while (running && done < total) {
      if (be.mode === 'worker') {
        // time-boxed batch in the worker; stop latency ≤ ~160ms
        const res = await be.iterate(total - done, 160);
        done += res.done;
      } else {
        const n = Math.min(batch, total - done);
        await be.iterate(n); done += n;
      }
      const now = performance.now();
      if (now - lastUI > 100 || done >= total) {
        lastUI = now;
        $('progFill').style.width = (100 * done / total) + '%';
        // metrics() is 2 full traversals — throttle it so big trees stay responsive
        if (now - lastMetric > 700 || done >= total) {
          lastMetric = now;
          const m = await be.metrics();
          $('evoop').textContent = m.evOOP.toFixed(2);
          $('evip').textContent = m.evIP.toFixed(2);
          $('expl').textContent = m.exploitPct.toFixed(2) + '%';
          if (target > 0 && done >= 10 && m.exploitPct <= target) { converged = true; break; }
        }
        await render();
        if (be.mode === 'direct') await sleep();
      }
    }
    $('progFill').style.width = '100%';
    if (converged) $('setupNote').textContent = `✓ Converged after ${done} iterations — exploitability ≤ ${target}% of pot.`;
    await render();
    running = false; $('solve').disabled = false; $('stop').disabled = true;
  }

  // ---- rendering ---------------------------------------------------------
  let path = [];                 // action-index line from root to current node
  const playerName = (p) => (p === 0 ? 'OOP' : 'IP');

  function renderNav(line) {
    const nav = $('nav'); nav.innerHTML = '';
    if (!line.length) { nav.textContent = 'Root — OOP acts first.'; return; }
    const back = document.createElement('button');
    back.className = 'navbtn'; back.textContent = '← Back';
    back.onclick = () => { path = path.slice(0, -1); render(); };
    nav.appendChild(back);
    const reset = document.createElement('button');
    reset.className = 'navbtn'; reset.textContent = '⟲ Root';
    reset.onclick = () => { path = []; render(); };
    nav.appendChild(reset);
    const crumb = document.createElement('span'); crumb.className = 'crumb';
    crumb.textContent = line.map((s) => `${playerName(s.player)} ${prettyLabel(s.label)}`).join('  ▸  ');
    nav.appendChild(crumb);
  }

  function renderDrill(rs) {
    const d = $('drill'); d.innerHTML = '';
    const drillable = rs.children.filter((c) => c.type === 'decision');
    if (!drillable.length) return;
    const opp = playerName(1 - rs.player);
    const head = document.createElement('div');
    head.className = 'dlabel';
    head.textContent = `See ${opp}'s strategy after ${playerName(rs.player)}…`;
    d.appendChild(head);
    rs.children.forEach((c, i) => {
      if (c.type !== 'decision') return;
      const b = document.createElement('button');
      b.className = 'drillbtn';
      b.textContent = prettyLabel(c.label) + ' →';
      b.onclick = () => { path = path.concat([i]); render(); };
      d.appendChild(b);
    });
  }

  // render: synchronous in direct mode (file:// and the Node smoke test),
  // one worker round-trip otherwise. Stale async responses are dropped.
  let renderSeq = 0;
  function render() {
    if (!backend) return;
    if (backend.mode === 'direct') { applyView(backend.viewNow(path)); return; }
    const my = ++renderSeq;
    return backend.view(path).then((v) => { if (my === renderSeq) applyView(v); }, () => {});
  }
  function applyView(view) {
    const rs = view.strategy;
    if (!rs) { if (path.length) { path = []; render(); } return; } // guard against stale path
    $('stratTitle').textContent = `${playerName(rs.player)} strategy${path.length ? ' — response' : ' — first decision'}`;
    renderNav(view.line);
    renderDrill(rs);
    // legend
    const leg = $('legend'); leg.innerHTML = '';
    rs.labels.forEach((lab, i) => {
      const s = document.createElement('span');
      s.innerHTML = `<i style="background:${colorFor(lab, i)}"></i>${prettyLabel(lab)}`;
      leg.appendChild(s);
    });
    // grid
    const grid = $('grid'); grid.innerHTML = '';
    for (let r = 53; r >= 2; r--) {
      for (let c = 53; c >= 2; c--) {
        const cell = document.createElement('div'); cell.className = 'cell';
        const lab = document.createElement('span'); lab.className = 'lab'; 
        
        if (r === c) {
          cell.classList.add('empty');
          // lab.textContent = r; // Don't show number on main diagonal
        } else {
          let a = Math.max(r, c);
          let b = Math.min(r, c);
          let cl = a + ' ' + b;
          lab.innerHTML = a + '<br>' + b;
          const fill = document.createElement('div'); fill.className = 'fill';
          const e = rs.classes.get(cl);
          if (e) {
            rs.labels.forEach((label, i) => {
              const f = e.freq[i];
              if (f > 0.001) {
                const seg = document.createElement('i');
                seg.style.width = (f * 100) + '%';
                seg.style.background = colorFor(label, i);
                fill.appendChild(seg);
              }
            });
            cell.onclick = () => showDetail(cl, e, rs.labels);
          } else {
            cell.classList.add('empty');
          }
          cell.appendChild(fill);
        }
        cell.appendChild(lab);
        grid.appendChild(cell);
      }
    }
  }
  function prettyLabel(lab) {
    if (lab === 'allin') return 'all-in';
    return lab;
  }
  function showDetail(cl, e, labels) {
    const parts = labels.map((lab, i) => `<b>${prettyLabel(lab)}</b> ${(e.freq[i] * 100).toFixed(1)}%`)
      .filter((_, i) => e.freq[i] > 0.001);
    const combos = e.n ? ` <span style="color:var(--muted)">· ${e.n} combo${e.n === 1 ? '' : 's'}</span>` : '';
    const evInfo = e.ev !== undefined ? ` <span style="color:var(--muted)">· EV: ${e.ev.toFixed(2)}</span>` : '';
    $('detail').innerHTML = `<b>${cl}</b>${combos}${evInfo} &nbsp; ` + (parts.length ? parts.join(' &nbsp;·&nbsp; ') : 'no combos');
  }

  let hashTimeout;
  function saveToHash() {
    clearTimeout(hashTimeout);
    hashTimeout = setTimeout(() => {
      const params = new URLSearchParams();
      ['oop', 'ip', 'board', 'pot', 'stack', 'iters', 'target', 'bets', 'raises', 'maxr'].forEach(id => {
        if ($(id)) params.set(id, $(id).value);
      });
      ['allin', 'sampling', 'himem'].forEach(id => {
        if ($(id)) params.set(id, $(id).checked ? '1' : '0');
      });
      window.history.replaceState(null, '', '#' + params.toString().replace(/%20/g, '+'));
    }, 500);
  }

  function loadFromHash() {
    if (!window.location.hash || window.location.hash.length <= 1) return;
    const params = new URLSearchParams(window.location.hash.substring(1).replace(/\+/g, '%20'));
    ['oop', 'ip', 'board', 'pot', 'stack', 'iters', 'target', 'bets', 'raises', 'maxr'].forEach(id => {
      if (params.has(id) && $(id)) $(id).value = params.get(id);
    });
    ['allin', 'sampling', 'himem'].forEach(id => {
      if (params.has(id) && $(id)) $(id).checked = params.get(id) === '1' || params.get(id) === 'true';
    });
  }

  function wireAutoSave() {
    ['oop', 'ip', 'board', 'pot', 'stack', 'iters', 'target', 'bets', 'raises', 'maxr'].forEach(id => {
      if ($(id)) $(id).addEventListener('input', saveToHash);
    });
    ['allin', 'sampling', 'himem'].forEach(id => {
      if ($(id)) $(id).addEventListener('change', saveToHash);
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    loadFromHash();
    wireAutoSave();
    ensureBackend(); // start the worker (or pick direct mode) up front
    $('solve').onclick = () => {
      saveToHash();
      solve();
    };
    $('stop').onclick = () => { running = false; };
  });
})();
