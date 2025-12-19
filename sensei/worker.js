import Module from './othello.js';

let wasmModule = null;

Module().then(m => {
    wasmModule = m;
    postMessage({ type: 'ready' });
});

let stopFlag = null;

self.onmessage = function(e) {
    if (e.data.type === 'init') {
        stopFlag = new Int32Array(e.data.sab);
        return;
    }

    if (!wasmModule) return;
    
    const { type, id, black, white, player, maxTime } = e.data;
    
    if (type === 'analyze') {
        try {
            // callback: (results, depth)
            const callback = (results, depth) => {
                // results is a JS array of objects
                postMessage({
                    type: 'analysis_update',
                    id: id,
                    results: results,
                    depth: depth
                });
            };
            
            // black/white should be strings to handle 64-bit integers
            wasmModule.analyze_with_callback(
                black, 
                white, 
                player, 
                maxTime, 
                callback,
                stopFlag || new Int32Array(1)
            );
            
            postMessage({ type: 'analysis_complete', id: id });
        } catch (err) {
            console.error("Worker error:", err);
            postMessage({ type: 'error', message: err.toString() });
        }
    }
};
