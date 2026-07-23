/* Headless smoke test of the real engine.js + app.js UI wiring,
 * using a minimal DOM stub. Verifies solve() runs end-to-end and the
 * 13x13 grid renders with action segments. */
const path = require('path');

// ---- minimal DOM ----
const handlers = {};
function mkEl(id) {
  const el = {
    id, value: '', textContent: '', className: '', checked: false, disabled: false,
    style: {}, children: [], onclick: null,
    classList: { add() {}, remove() {} },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
  };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return _html; },
    set(v) { _html = v; if (v === '') this.children.length = 0; },
  });
  return el;
}
const DEFAULTS = {
  oop: '50 51, 40 41, 30 31',
  ip: '20 21, 10 11',
  board: '2 3 4', pot: '60', stack: '100', iters: '60',
  bets: '0.5, 1.0', raises: '1.0', maxr: '1',
};
const els = {};
function getEl(id) {
  if (!els[id]) { els[id] = mkEl(id); if (DEFAULTS[id] !== undefined) els[id].value = DEFAULTS[id]; }
  return els[id];
}
els.allin = mkEl('allin'); els.allin.checked = true;

global.window = global;
global.document = {
  getElementById: getEl,
  createElement: () => mkEl(''),
  activeElement: null,
};
global.window.addEventListener = (ev, cb) => { handlers[ev] = cb; };
if (!global.performance) global.performance = { now: () => Date.now() };

require('./engine.js');
require('./app.js');

(async () => {
  let fails = 0;
  const ok = (n, c) => { console.log(c ? 'ok  ' : 'FAIL', n); if (!c) fails++; };

  // fire DOMContentLoaded -> wires buttons + presets
  handlers['DOMContentLoaded']();
  ok('solve button wired', typeof getEl('solve').onclick === 'function');

  // ---- preflop RFI section: 8 buttons + chart + load ----
  function gridInfo(disp) {
    const w = disp.children.find((c) => c.className === 'chart-wrap');
    const g = w && w.children[0]; const cells = g ? g.children : [];
    return { n: cells.length, inn: cells.filter((c) => c.className.includes('in')).length };
  }
  const rfi = getEl('charts');
  const rfiRow = rfi.children.find((c) => c.className === 'posbtns');
  const rfiDisp = rfi.children.find((c) => c.className === 'chart-display');
  ok('RFI has 8 position buttons', rfiRow && rfiRow.children.length === 8, `(${rfiRow ? rfiRow.children.length : 0})`);
  let gi = gridInfo(rfiDisp);
  ok('RFI default chart: >0 cells w/ opens', gi.n > 0 && gi.inn > 0, `(${gi.inn})`);
  // load → IP populates the ip box
  const loadIP = rfiDisp.children.find((c) => c.className === 'loadrow').children.find((b) => b.textContent.includes('IP'));
  loadIP.onclick();
  ok('load → IP populates ip box', getEl('ip').value.includes('50 51'));
  // BB shows the "doesn't open" note (no grid)
  rfiRow.children.find((b) => b.textContent === 'BB').onclick();
  ok('RFI BB shows note (no grid)', !rfiDisp.children.find((c) => c.className === 'chart-wrap'));

  // ---- vs-RFI section: opener + my-seat buttons, call + 3-bet ----
  const vs = getEl('vscharts');
  const vsRows = vs.children.filter((c) => c.className === 'posbtns');
  ok('vs has opener + my-seat rows', vsRows.length === 2);
  const openerRow = vsRows[0], meRow = vsRows[1];
  ok('vs has 7 opener buttons', openerRow.children.length === 7, `(${openerRow.children.length})`);
  ok('vs has responder buttons', meRow.children.length >= 1);
  const vsDisp = vs.children.find((c) => c.className === 'chart-display');
  function colored(disp) {
    const w = disp.children.find((c) => c.className === 'chart-wrap');
    const g = w && w.children[0]; const cells = g ? g.children : [];
    return { n: cells.length, tb: cells.filter((c) => c.className.includes('tb')).length, call: cells.filter((c) => c.className.includes('call')).length };
  }
  let ci = colored(vsDisp);
  ok('vs default (CO open) has 3-bet + call cells', ci.n > 0 && ci.tb > 0 && ci.call > 0, `(tb=${ci.tb} call=${ci.call})`);
  // load 3-bet → OOP
  const tbRow2 = vsDisp.children.filter((c) => c.className === 'loadrow').find((r) => r.children.some((x) => x.className === 'loadlabel' && x.textContent === '3-bet'));
  tbRow2.children.find((b) => b.textContent && b.textContent.includes('OOP')).onclick();
  ok('vs load 3-bet → OOP populates oop', getEl('oop').value.length > 3);

  // one-click 3-bet-pot setup. Default CO open + BTN responder: BTN is IP postflop.
  const findSetup = () => vsDisp.children.find((c) => c.className === 'setupbtn');
  ok('setup 3-bet pot button exists', !!findSetup());
  findSetup().onclick();
  ok('setup: opener (CO) range → OOP', getEl('oop').value.includes('50 51'));
  ok('setup: 3-bettor (BTN) range → IP', getEl('ip').value.includes('50 51'));
  ok('setup: 3-bet-pot pot/stack', getEl('pot').value == 20 && getEl('stack').value == 90);
  ok('setup: confirmation note shown', getEl('setupNote').textContent.includes('OOP = CO'));
  // BB 3-bettor vs UTG open: a blind 3-bettor is OOP postflop
  openerRow.children.find((b) => b.textContent === 'UTG').onclick();
  meRow.children.find((b) => b.textContent === 'BB').onclick();
  findSetup().onclick();
  ok('setup: blind 3-bettor (BB) → OOP', getEl('oop').value.includes('50 51') && getEl('ip').value.includes('50 51'));
  // UTG open -> SB responder -> 3-bet-or-fold (no call cells)
  meRow.children.find((b) => b.textContent === 'SB').onclick();
  ci = colored(vsDisp);
  ok('SB is 3-bet-or-fold (no call cells)', ci.call === 0 && ci.tb > 0, `(call=${ci.call})`);
  // restore boxes for the solve below
  getEl('oop').value = DEFAULTS.oop; getEl('ip').value = DEFAULTS.ip;
  getEl('pot').value = DEFAULTS.pot; getEl('stack').value = DEFAULTS.stack;

  // ---- preset target toggle: load a preset into IP ----
  const chips = getEl('presets').children;
  const ipToggle = chips.find((c) => c.className.includes('tgt') && c.textContent === 'IP');
  const presetChip = chips.find((c) => c.textContent === 'Preset 1');
  ok('IP toggle + preset chip exist', !!ipToggle && !!presetChip);
  ipToggle.onclick();                 // target = IP
  const ipBefore = getEl('ip').value;
  presetChip.onclick();               // load BTN open into IP
  ok('preset loaded into IP box', getEl('ip').value !== ipBefore && getEl('ip').value.includes('50 51'));
  ok('OOP box untouched by IP preset', getEl('oop').value === DEFAULTS.oop);
  // restore defaults for the solve below
  getEl('oop').value = DEFAULTS.oop; getEl('ip').value = DEFAULTS.ip;

  // run solve()
  await getEl('solve').onclick();

  const errTxt = getEl('err').textContent;
  if (errTxt) console.log('ERROR:', errTxt);

  const evoop = getEl('evoop').textContent;
  const expl = getEl('expl').textContent;
  console.log('  evOOP=', evoop, ' evIP=', getEl('evip').textContent, ' exploit=', expl);
  ok('evOOP populated', /-?\d/.test(evoop));
  ok('exploit % populated', /%/.test(expl));
  ok('progress at 100%', getEl('progFill').style.width === '100%');

  const grid = getEl('grid');
  ok('grid has >0 cells', grid.children.length > 0);
  // count cells that have at least one strategy segment
  let withSeg = 0;
  for (const cell of grid.children) {
    const fill = cell.children.find((c) => c.className === 'fill');
    if (fill && fill.children.length > 0) withSeg++;
  }
  console.log('  cells with strategy segments:', withSeg);
  ok('some cells rendered strategy', withSeg > 10);

  const legend = getEl('legend');
  ok('legend populated', legend.children.length >= 2);

  // ---- navigation: drill into IP response ----
  const drillBtns = getEl('drill').children.filter((c) => c.className === 'drillbtn');
  ok('drill buttons present', drillBtns.length > 0);
  drillBtns[0].onclick(); // view IP strategy after OOP's first action
  console.log('  drilled into:', getEl('stratTitle').textContent, '| line:', getEl('nav').textContent || '(buttons)');
  ok('title now IP strategy', /IP strategy/.test(getEl('stratTitle').textContent));
  ok('breadcrumb/back rendered', getEl('nav').children.length > 0);
  const g2 = getEl('grid');
  let seg2 = 0;
  for (const cell of g2.children) { const f = cell.children.find((c) => c.className === 'fill'); if (f && f.children.length > 0) seg2++; }
  ok('IP grid rendered', g2.children.length > 0 && seg2 > 0);

  console.log(fails ? `\n${fails} FAILURES` : '\nUI WIRING OK');
  process.exit(fails ? 1 : 0);
})();
