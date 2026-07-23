/* Verifies suit isomorphism: (1) it produces the SAME equilibrium as full
 * enumeration on suit-symmetric spots, and (2) it actually reduces the tree. */
const G = require('./engine.js');
let fails = 0;
const ok = (n, c, extra) => { console.log(c ? 'ok  ' : 'FAIL', n, extra || ''); if (!c) fails++; };

function solve(cfg, iters) {
  const info = G.setup(cfg);
  G.iterate(iters);
  const m = G.metrics();
  return { info, m };
}

// ---- symmetric TURN spot (monotone-ish board -> off-suit symmetry) ----
const base = {
  board: G.parseCards('As Js 4s 2s'), // 4 spades -> suits h,d,c interchangeable
  pot: 60, stack: 80,
  oop: 'AA,KK,QQ,AKs,AQs,KQs,JTs,T9s,AKo,KQo',
  ip: 'KK,QQ,JJ,AQs,KQs,QJs,JTs,AJo,KJo,QJo',
  betSizes: [0.75], raiseSizes: [1], allowAllIn: true, maxRaises: 1, maxMemoryMB: 400,
  // exact average strategy: tight convergence threshold at few iterations
  // (the default last-iterate reporting oscillates early), and this keeps
  // the STRAT-pool code path covered.
  exactAverage: true,
};
const on = solve({ ...base, isomorphism: true }, 200);
const off = solve({ ...base, isomorphism: false }, 200);
console.log('\nsymmetric turn:');
console.log('  ISO ON  symmetries=%d nodes=%d  evOOP=%s exploit%%=%s', on.info.symmetries, on.info.nodes, on.m.evOOP.toFixed(3), on.m.exploitPct.toFixed(3));
console.log('  ISO OFF symmetries=%d nodes=%d  evOOP=%s exploit%%=%s', off.info.symmetries, off.info.nodes, off.m.evOOP.toFixed(3), off.m.exploitPct.toFixed(3));
ok('symmetry detected (>1)', on.info.symmetries > 1, `(${on.info.symmetries})`);
ok('node count reduced', on.info.nodes < off.info.nodes, `(${on.info.nodes} < ${off.info.nodes})`);
ok('evOOP matches enumeration', Math.abs(on.m.evOOP - off.m.evOOP) < 0.15, `(Δ=${Math.abs(on.m.evOOP - off.m.evOOP).toFixed(4)})`);
ok('evIP matches enumeration', Math.abs(on.m.evIP - off.m.evIP) < 0.15);
ok('both converge (exploit<1%)', on.m.exploitPct < 1 && off.m.exploitPct < 1);

// ---- non-symmetric ranges (explicit combos) -> group must be identity ----
const ns = G.setup({
  board: G.parseCards('As Js 4s 2s'), pot: 60, stack: 80,
  oop: 'AhKd', ip: 'AcKh', betSizes: [0.75], raiseSizes: [1], // suit pattern no perm preserves
  allowAllIn: true, maxRaises: 1, isomorphism: true, maxMemoryMB: 400,
});
console.log('\nnon-symmetric ranges: symmetries=%d', ns.symmetries);
ok('no false symmetry on explicit combos', ns.symmetries === 1);

// ---- river spot stays correct (no chance nodes) ----
const rv = solve({
  board: G.parseCards('Ah Kd 7c 2s 9h'), pot: 100, stack: 100,
  oop: 'AA,KK,77,99,QJs,T8s,65s', ip: 'AK,AQ,KQ,99,77',
  betSizes: [0.75], raiseSizes: [1], allowAllIn: true, maxRaises: 1, isomorphism: true,
}, 100);
ok('river solves, zero-sum', Math.abs(rv.m.evOOP + rv.m.evIP) < 0.5);

console.log(fails ? `\n${fails} FAILURES` : '\nISOMORPHISM VERIFIED');
process.exit(fails ? 1 : 0);
