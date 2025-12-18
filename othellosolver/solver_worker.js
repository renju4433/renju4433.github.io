importScripts('./solver.js');
let ModuleFactory = self.SolverModule || self.Module;
let ModuleInstance = null;
let ready = false;
let pending = [];
let lastReqId = -1;
function boot() {
  let p = ModuleFactory();
  p.then(m => { ModuleInstance = m; ready = true; for (let msg of pending) handle(msg); pending = []; });
}
boot();
function handle(data) {
  if (!ready) { pending.push(data); return; }
  const board = new Int8Array(data.board);
  const player = data.player;
  const move = data.move;
  const depth = data.depth;
  const reqId = data.reqId;
  const weights = data.weights || { div:28, mob:24, stable:32, flip:22, parity:12 };
  const hardConstraints = data.hardConstraints !== undefined ? data.hardConstraints : false;
  if (reqId !== lastReqId) {
    lastReqId = reqId;
    ModuleInstance._solver_reset(reqId);
  }
  ModuleInstance._solver_set_weights(weights.div, weights.mob, weights.stable, weights.flip, weights.parity);
  ModuleInstance._solver_set_hard_constraints(hardConstraints ? 1 : 0);
  const ptr = ModuleInstance._malloc(64);
  ModuleInstance.HEAP8.set(board, ptr);
  if (data.type === 'sort_moves') {
    const ms = data.moves.map(m => {
      const s = ModuleInstance._solver_calc_score(ptr, player, m, 2, -Infinity, Infinity);
      return { x: (m>>3), y: (m&7), score: s };
    }).sort((a,b) => b.score - a.score);
    ModuleInstance._free(ptr);
    postMessage({ type: 'sorted_moves', moves: ms, board: data.board, player: player, reqId: reqId });
    return;
  }
  let val;
  if (data.mode === 'perfect_solver' || data.mode === 'endgame') {
    const a = typeof data.alpha === 'number' ? data.alpha : -Infinity;
    val = ModuleInstance._solver_endgame_after_move(ptr, player, move, a);
  } else {
    val = ModuleInstance._solver_search_root(ptr, player, move, depth);
  }
  ModuleInstance._free(ptr);
  postMessage({ type: 'result', x: (move>>3), y: (move&7), val: val, reqId: reqId });
}
onmessage = function(e){ handle(e.data); };
