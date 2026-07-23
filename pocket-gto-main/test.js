const G = require('./engine.js');

let fails = 0;
function eq(name, a, b) { if (a !== b) { console.log('FAIL', name, 'got', a, 'want', b); fails++; } else console.log('ok  ', name); }
function ok(name, cond) { if (!cond) { console.log('FAIL', name); fails++; } else console.log('ok  ', name); }

const C = G.cardToInt;
function sc(str) { return G.score7(G.parseCards(str)); }

// ---- evaluator ordering -------------------------------------------------
ok('royal>quads', sc('AsKsQsJsTs2h3h') > sc('AhAdAcAs2h3h4h'));
ok('quads>boat', sc('AhAdAcAsKhKd2h') > sc('AhAdAcKsKh2d3c'));
ok('boat>flush', sc('AhAdAcKsKh2h3h') > sc('Ah2h3h4h6h8d9c'));
ok('flush>straight', sc('Ah2h3h4h6h8s9d') > sc('5h6d7c8s9hAdKc'));
ok('straight>trips', sc('5h6d7c8s9hAdKc') > sc('AhAdAc2s3h4d6c'));
ok('wheel straight', sc('Ah2d3c4s5h9d8c') > sc('AhKdQcJs9h2d3c')); // 5-high straight > A-high
ok('trips>twopair', sc('AhAdAc2s3h4d6c') > sc('AhAdKsKh2d3c4s'));
ok('twopair>pair', sc('AhAdKsKh2d3c4s') > sc('AhAd2s3h4d6c8h'));
ok('pair>high', sc('AhAd2s3h4d6c8h') > sc('AhKdQcJs9h2d3c'));
ok('kicker matters', sc('AhAdKsQh2d3c4s') > sc('AhAdJsQh2d3c4s'));
ok('higher straight', sc('TsJhQdKcAh2s3d') > sc('9s Th Jd Qc Kh 2s 3d'.replace(/ /g,'')) ); // wrong format guard

// straight 6 vs 5 high
ok('6high>5high straight', sc('2h3d4c5s6h9dKc') > sc('Ah2d3c4s5h9dKc'));

// ---- range parsing ------------------------------------------------------
eq('AA combos', G.parseRange('AA').size, 6);
eq('AKs combos', G.parseRange('AKs').size, 4);
eq('AKo combos', G.parseRange('AKo').size, 12);
eq('AK combos', G.parseRange('AK').size, 16);
eq('TT+ combos', G.parseRange('TT+').size, 6 * 5);
eq('ATs+ combos', G.parseRange('ATs+').size, 4 * 4); // AT,AJ,AQ,AK suited
eq('22+ combos', G.parseRange('22+').size, 13 * 6);
eq('pair range 99-66', G.parseRange('99-66').size, 4 * 6);
eq('explicit AhKd', G.parseRange('AhKd').size, 1);
ok('weighted', G.parseRange('AA:0.5').get([...G.parseRange('AA').keys()][0]) === 0.5);

// ---- solver sanity: river, monotone exploitability drop -----------------
// Simple river spot. Polarized vs bluffcatcher-ish.
const info = G.setup({
  board: G.parseCards('Ah Kd 7c 2s 9h'),
  pot: 100, stack: 100,
  oop: 'AA,KK,77,99,QJs,QTs,JTs,T8s,86s,65s', // some nuts + air
  ip: 'AK,AQ,KQ,AJ,99,77',                     // bluffcatchers / value
  betSizes: [0.75], raiseSizes: [1], allowAllIn: true, maxRaises: 1,
});
console.log('\nsetup:', info);
let prev = null, m;
for (let i = 0; i < 6; i++) {
  G.iterate(50);
  m = G.metrics();
  console.log(`iter=${G.iters} evOOP=${m.evOOP.toFixed(3)} evIP=${m.evIP.toFixed(3)} exploit%=${m.exploitPct.toFixed(3)}`);
  prev = m;
}
ok('exploitability small after 300 iters', m.exploitPct < 5);
ok('EVs roughly zero-sum', Math.abs(m.evOOP + m.evIP) < 0.5);
ok('exploit non-negative', m.exploitPct > -0.001);

const rs = G.rootStrategy();
console.log('\nroot player(0=OOP):', rs.player, 'actions:', rs.labels);
for (const [cl, e] of rs.classes) {
  console.log(cl.padEnd(4), [...e.freq].map(x => x.toFixed(2)).join('  '));
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL TESTS PASSED');
process.exit(fails ? 1 : 0);
