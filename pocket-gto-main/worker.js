/* Web Worker wrapper around the solver engine. Used when the app is served
 * over http(s); on file:// the app falls back to running the engine on the
 * main thread (workers are blocked from file:// in most browsers).
 * Protocol: {id, op, args} in -> {id, ok, result|error} out. */
importScripts('engine.js');

onmessage = (e) => {
  const { id, op, args } = e.data;
  try {
    let result;
    if (op === 'setup') {
      result = GTO.setup(args.cfg);
    } else if (op === 'iterate') {
      // time-boxed batch: run iterations until n done or msBudget elapsed,
      // so stop/navigation messages are handled with low latency.
      const t0 = Date.now();
      let done = 0;
      while (done < args.n && Date.now() - t0 < args.msBudget) { GTO.iterate(1); done++; }
      result = { done, iters: GTO.iters };
    } else if (op === 'metrics') {
      result = GTO.metrics();
    } else if (op === 'view') {
      result = { strategy: GTO.strategyAt(args.path), line: GTO.pathInfo(args.path) };
    } else {
      throw new Error('unknown op: ' + op);
    }
    postMessage({ id, ok: true, result });
  } catch (err) {
    postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};

postMessage({ type: 'ready' });
