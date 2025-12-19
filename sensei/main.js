
const BLACK = 1n;
const WHITE = 2n;

// Initial positions:
// Black: e4 (row 3, col 4), d5 (row 4, col 3)
// White: d4 (row 3, col 3), e5 (row 4, col 4)
// Bit indices: row*8 + col
// e4: 3*8+4 = 28
// d5: 4*8+3 = 35
// d4: 3*8+3 = 27
// e5: 4*8+4 = 36

let boardBlack = (1n << 28n) | (1n << 35n);
let boardWhite = (1n << 27n) | (1n << 36n);
let currentPlayer = BLACK; // Black moves first

let worker = new Worker('worker.js', { type: 'module' });
let isWorkerReady = false;
let stopFlag = new Int32Array(new SharedArrayBuffer(4)); // 0 = run, 1 = stop
let isAnalyzing = false;
let pendingAnalysis = null;
let currentAnalysisId = 0;

let analysisResults = new Map(); // Store results by "r,c" key
let currentAnalysisDepth = 0;
let analysisStartTime = 0;

// History State
let moveHistory = [];
let historyIndex = -1;

// DOM Elements
const boardEl = document.getElementById('board');
const scoreBlackEl = document.getElementById('score-black');
const scoreWhiteEl = document.getElementById('score-white');
const evalMainEl = document.getElementById('eval-main');
const statNodesEl = document.getElementById('stat-nodes');
const statNpsEl = document.getElementById('stat-nps');
const statTimeEl = document.getElementById('stat-time');
const statEmptiesEl = document.getElementById('stat-empties');
const btnEvaluate = document.getElementById('btn-evaluate');

// Nav Buttons
const btnFirst = document.getElementById('btn-first');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnLast = document.getElementById('btn-last');

btnFirst.onclick = () => goToMove(0);
btnPrev.onclick = () => goToMove(historyIndex - 1);
btnNext.onclick = () => goToMove(historyIndex + 1);
btnLast.onclick = () => goToMove(moveHistory.length - 1);

worker.onmessage = (e) => {
    const data = e.data;
    if (data.type === 'ready') {
        isWorkerReady = true;
        console.log("Worker ready");
        // Send SAB
        worker.postMessage({ type: 'init', sab: stopFlag.buffer });
        triggerAnalysis();
    } else if (data.type === 'analysis_update') {
        if (data.id !== currentAnalysisId) return;

        // data.results is an array of updates (usually length 1)
        data.results.forEach(res => {
            const key = `${res.row},${res.col}`;
            // Update map with new result and depth
            analysisResults.set(key, { ...res, depth: data.depth });
        });
        
        // Only update UI if we have new info
        // We might want to throttle this if it's too fast, but let's try direct first
        updateOverlay();
        updateStats(analysisResults.size, data.depth);
    } else if (data.type === 'analysis_complete') {
        if (data.id !== currentAnalysisId && !pendingAnalysis) return;

        // console.log("Analysis complete");
        isAnalyzing = false;
        if (pendingAnalysis) {
            Atomics.store(stopFlag, 0, 0); // Reset stop flag
            worker.postMessage(pendingAnalysis);
            isAnalyzing = true;
            pendingAnalysis = null;
        }
    } else if (data.type === 'error') {
        console.error("Worker Error:", data.message);
    }
};

function initBoard() {
    // Initial state push
    moveHistory = [{
        black: boardBlack,
        white: boardWhite,
        player: currentPlayer
    }];
    historyIndex = 0;

    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.onclick = () => handleCellClick(r, c);
            
            boardEl.appendChild(cell);
        }
    }
    renderBoard();
}

function renderBoard() {
    const validMoves = getValidMoves(boardBlack, boardWhite, currentPlayer);
    
    // Update scores
    let bCount = countSetBits(boardBlack);
    let wCount = countSetBits(boardWhite);
    scoreBlackEl.textContent = bCount;
    scoreWhiteEl.textContent = wCount;
    statEmptiesEl.textContent = 64 - bCount - wCount;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const idx = r * 8 + c;
            const cell = boardEl.children[idx];
            
            // Clear content except marker and overlay
            // We need to preserve overlay if it exists, but easier to rebuild
            // Actually, let's just clear specific elements
            const existingDisc = cell.querySelector('.disc');
            if (existingDisc) existingDisc.remove();
            
            const existingHint = cell.querySelector('.legal-move-marker');
            if (existingHint) existingHint.remove();

            const mask = 1n << BigInt(idx);
            if (boardBlack & mask) {
                const disc = document.createElement('div');
                disc.className = 'disc black';
                cell.appendChild(disc);
            } else if (boardWhite & mask) {
                const disc = document.createElement('div');
                disc.className = 'disc white';
                cell.appendChild(disc);
            } else {
                // Check if valid move
                const isValid = validMoves.some(m => m.r === r && m.c === c);
                if (isValid) {
                    const hint = document.createElement('div');
                    hint.className = 'legal-move-marker';
                    cell.appendChild(hint);
                }
            }
        }
    }
    
    // Clear old overlays if board changed significantly? 
    // We'll update overlays separately.
}

function updateOverlay() {
    // We don't clear all overlays anymore to prevent flickering
    // Instead we update existing ones or create new ones
    
    // First, clear overlays for invalid moves (if any logic changed) or reset
    // Actually, it's safer to clear if we want to be sure, but for "all points" 
    // we want to keep them.
    // Let's just iterate our results map.
    
    let bestScore = -Infinity;

    analysisResults.forEach((res, key) => {
        const idx = res.row * 8 + res.col;
        const cell = boardEl.children[idx];
        if (!cell) return;

        let overlay = cell.querySelector('.cell-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'cell-overlay';
            cell.appendChild(overlay);
        }

        // Format score
        let scoreText = res.score.toFixed(2);
        if (res.score > 0) scoreText = "+" + scoreText;
        
        // Determine color based on score (optional)
        // const color = res.score > 0 ? '#4caf50' : (res.score < 0 ? '#f44336' : '#e0e0e0');
        
        overlay.innerHTML = `
            <div class="eval-score">${scoreText}</div>
            <div class="eval-depth">d:${res.depth}</div>
        `;
        
        if (res.score > bestScore) {
            bestScore = res.score;
        }
    });

    if (bestScore > -Infinity) {
        evalMainEl.textContent = bestScore.toFixed(2);
    }
}

function updateStats(count, depth) {
    const now = Date.now();
    const time = (now - analysisStartTime) / 1000;
    statTimeEl.textContent = time.toFixed(1) + " sec";
    statNodesEl.textContent = "Depth " + depth; // Using nodes field for depth for now
    // statNpsEl.textContent = ...
}

function handleCellClick(r, c) {
    // Prevent moving if not at latest state (optional, or truncate history)
    // Here we will truncate history if we move from a past state
    if (historyIndex < moveHistory.length - 1) {
        moveHistory = moveHistory.slice(0, historyIndex + 1);
    }

    const validMoves = getValidMoves(boardBlack, boardWhite, currentPlayer);
    const move = validMoves.find(m => m.r === r && m.c === c);
    
    if (move) {
        // Execute move
        if (currentPlayer === BLACK) {
            makeMove(boardBlack, boardWhite, r, c, BLACK);
            currentPlayer = WHITE;
        } else {
            makeMove(boardWhite, boardBlack, r, c, WHITE);
            currentPlayer = BLACK;
        }
        
        // Handle Pass
        let nextMoves = getValidMoves(boardBlack, boardWhite, currentPlayer);
        if (nextMoves.length === 0) {
            console.log("Pass");
            currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
            nextMoves = getValidMoves(boardBlack, boardWhite, currentPlayer);
            if (nextMoves.length === 0) {
                alert("Game Over");
                saveState(); // Save terminal state
                renderBoard();
                return;
            }
        }
        
        saveState();
        renderBoard();
        // Clear old analysis results
        analysisResults.clear();
        document.querySelectorAll('.cell-overlay').forEach(el => el.remove());
        evalMainEl.textContent = "0.00";
        statNodesEl.textContent = "Depth 0";
        statTimeEl.textContent = "0.0 sec";
        triggerAnalysis();
    }
}

function saveState() {
    moveHistory.push({
        black: boardBlack,
        white: boardWhite,
        player: currentPlayer
    });
    historyIndex = moveHistory.length - 1;
}

function goToMove(index) {
    if (index < 0 || index >= moveHistory.length) return;
    
    historyIndex = index;
    const state = moveHistory[index];
    
    boardBlack = state.black;
    boardWhite = state.white;
    currentPlayer = state.player;
    
    renderBoard();
    
    // Trigger analysis for the loaded state
    analysisResults.clear();
    document.querySelectorAll('.cell-overlay').forEach(el => el.remove());
    evalMainEl.textContent = "0.00";
    statNodesEl.textContent = "Depth 0";
    statTimeEl.textContent = "0.0 sec";
    triggerAnalysis();
}

function triggerAnalysis() {
    if (!isWorkerReady) return;
    
    currentAnalysisId++;
    analysisStartTime = Date.now();
    const msg = {
        type: 'analyze',
        id: currentAnalysisId,
        black: boardBlack.toString(),
        white: boardWhite.toString(),
        player: (currentPlayer === BLACK) ? 1 : 2,
        maxTime: 86400000 // 2 seconds
    };

    if (isAnalyzing) {
        // Signal stop
        Atomics.store(stopFlag, 0, 1);
        pendingAnalysis = msg;
    } else {
        Atomics.store(stopFlag, 0, 0);
        worker.postMessage(msg);
        isAnalyzing = true;
    }
}

// --- Logic Helpers ---

function countSetBits(n) {
    let count = 0;
    while (n > 0n) {
        n &= (n - 1n);
        count++;
    }
    return count;
}

function getValidMoves(blackBoard, whiteBoard, player) {
    const moves = [];
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    
    let own, opp;
    if (player === BLACK) {
        own = blackBoard;
        opp = whiteBoard;
    } else {
        own = whiteBoard;
        opp = blackBoard;
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const idx = r * 8 + c;
            const mask = 1n << BigInt(idx);
            if ((own & mask) || (opp & mask)) continue;
            
            for (let d of dirs) {
                let dr = d[0], dc = d[1];
                let nr = r + dr, nc = c + dc;
                let flips = 0;
                while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (opp & (1n << BigInt(nr*8+nc)))) {
                    nr += dr;
                    nc += dc;
                    flips++;
                }
                if (flips > 0 && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (own & (1n << BigInt(nr*8+nc)))) {
                    moves.push({r, c});
                    break;
                }
            }
        }
    }
    return moves;
}

function makeMove(own, opp, r, c, player) {
    const idx = r * 8 + c;
    const moveMask = 1n << BigInt(idx);
    
    let newOwn = own | moveMask;
    let newOpp = opp;
    
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    
    for (let d of dirs) {
        let dr = d[0], dc = d[1];
        let nr = r + dr, nc = c + dc;
        let flipMask = 0n;
        
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (newOpp & (1n << BigInt(nr*8+nc)))) {
            flipMask |= (1n << BigInt(nr*8+nc));
            nr += dr;
            nc += dc;
        }
        
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && (newOwn & (1n << BigInt(nr*8+nc))) && flipMask !== 0n) {
            newOwn |= flipMask;
            newOpp &= ~flipMask;
        }
    }
    
    if (player === BLACK) {
        boardBlack = newOwn;
        boardWhite = newOpp;
    } else {
        boardWhite = newOwn;
        boardBlack = newOpp;
    }
}

initBoard();
