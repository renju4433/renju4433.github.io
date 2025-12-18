import Module from './othello.js';

let wasmModule = null;

console.log('Worker: Initializing...');

Module().then(instance => {
    console.log('Worker: Module loaded');
    wasmModule = instance;
    postMessage({ type: 'ready' });
});

onmessage = function(e) {
    // console.log('Worker: Received message', e.data.type);
    if (!wasmModule) {
        console.error('Worker: Module not ready');
        postMessage({ type: 'error', message: 'Module not ready' });
        return;
    }

    const { type, black, white, player, maxTime } = e.data;

    if (type === 'analyze') {
        console.log('Worker: Starting analysis...');
        try {
            // Callback function to handle partial results
            const progressCallback = (resultsArray, depth) => {
                // console.log('Worker: Progress callback, depth', depth);
                const results = [];
                const size = resultsArray.length;
                for (let i = 0; i < size; i++) {
                    const item = resultsArray[i];
                    results.push({
                        row: item.row,
                        col: item.col,
                        score: item.score,
                        player: item.player
                    });
                }
                postMessage({ type: 'progress', results, depth });
            };

            wasmModule.analyze_with_callback(black, white, player, maxTime, progressCallback);
            console.log('Worker: Analysis done');
            postMessage({ type: 'done' }); // Final done message
        } catch (err) {
            console.error('Worker: Error during analysis', err);
            postMessage({ type: 'error', message: err.toString() });
        }
    }
};
