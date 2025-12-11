// Globals expected by solver.js
const PLAY_STYLE_NOFLAGS = 0;
const PLAY_STYLE_EFFICIENCY = 1;
const PLAY_STYLE_NOFLAGS_EFFICIENCY = 2;
const ACTION_CLEAR = 1;
const ACTION_FLAG = 2;
let analysisMode = false;
let binomialCache;

// Missing dependencies for solver.js
function combination(k, n) {
    if (k < 0 || k > n) return BigInt(0);
    if (k === 0 || k === n) return BigInt(1);
    if (k > n / 2) k = n - k;
    
    let res = BigInt(1);
    for (let i = 1; i <= k; i++) {
        res = res * BigInt(n - i + 1) / BigInt(i);
    }
    return res;
}

function divideBigInt(numerator, denominator, precision) {
    if (denominator === BigInt(0)) return 0;
    const scale = BigInt(10 ** precision);
    const scaledResult = (numerator * scale) / denominator;
    return Number(scaledResult) / (10 ** precision);
}

class Binomial {
    constructor(maxN, maxK) {}
}

class BinomialCache {
    constructor(maxN, maxK, binomial) {
        this.maxN = maxN;
    }
    getMaxN() { return this.maxN; }
}

class Cruncher {
    constructor(board, iterator) {
        this.tiles = [];
    }
}

class WitnessWebIterator {
    constructor(pe, tiles, limit) {}
}

// Initialize solver.js components
try {
    const binomial = new Binomial(5000, 500);
    binomialCache = new BinomialCache(5000, 500, binomial);
    console.log("Solver engine initialized.");
} catch (e) {
    console.warn("Solver engine init failed:", e);
}

const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const minesInput = document.getElementById('mines');
const boardElement = document.getElementById('board');
const pickerElement = document.getElementById('picker');
const resetBtn = document.getElementById('reset-btn');
const solveBtn = document.getElementById('solve-btn');

let rows = 9;
let cols = 9;
let totalMines = 10;
let grid = []; 
let hoveredCell = null;
let tooltipEl = null;
let selectedValue = -1;
let pressTimer = null;
let longPressSuppressClick = false;
const LONG_PRESS_MS = 500;

const STATE = {
    UNKNOWN: -1
};

class Cell {
    constructor(r, c) {
        this.r = r;
        this.c = c;
        this.value = STATE.UNKNOWN; 
        this.isMine = false; 
        this.isSafe = false; 
        this.element = null;
        this.probability = null; 
        this.index = -1; // For solver indexing
    }
}

function initGame() {
    rows = parseInt(rowsInput.value);
    cols = parseInt(colsInput.value);
    totalMines = parseInt(minesInput.value);
    if (rows < 1) rows = 1;
    if (cols < 1) cols = 1;

    grid = [];
    boardElement.innerHTML = '';
    boardElement.style.gridTemplateColumns = `repeat(${cols}, 25px)`;

    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            const cell = new Cell(r, c);
            const el = document.createElement('div');
            el.classList.add('cell', 'unknown');
            
            el.addEventListener('mouseenter', (ev) => {
                hoveredCell = { r, c };
                el.style.borderColor = '#000';
                updateTooltipForCell(cell, ev.clientX, ev.clientY);
            });
            el.addEventListener('mouseleave', () => {
                if (hoveredCell && hoveredCell.r === r && hoveredCell.c === c) {
                    hoveredCell = null;
                }
                el.style.borderColor = ''; 
                hideTooltip();
            });
            el.addEventListener('mousemove', (ev) => {
                if (hoveredCell && hoveredCell.r === r && hoveredCell.c === c) {
                    updateTooltipForCell(cell, ev.clientX, ev.clientY);
                }
            });
            el.addEventListener('mousedown', (e) => {
                if (pressTimer) clearTimeout(pressTimer);
                pressTimer = setTimeout(() => {
                    longPressSuppressClick = true;
                    const rect = el.getBoundingClientRect();
                    const cx = Math.floor(rect.left + rect.width / 2);
                    const cy = Math.floor(rect.top + rect.height / 2);
                    updateTooltipForCell(cell, cx, cy);
                }, LONG_PRESS_MS);
            });
            el.addEventListener('mouseup', () => {
                if (pressTimer) clearTimeout(pressTimer);
                if (longPressSuppressClick) {
                    hideTooltip();
                }
            });
            el.addEventListener('mouseleave', () => {
                if (pressTimer) clearTimeout(pressTimer);
            });
            el.addEventListener('touchstart', (ev) => {
                if (pressTimer) clearTimeout(pressTimer);
                const t = ev.touches && ev.touches[0];
                pressTimer = setTimeout(() => {
                    longPressSuppressClick = true;
                    if (t) {
                        updateTooltipForCell(cell, t.clientX, t.clientY);
                    } else {
                        const rect = el.getBoundingClientRect();
                        updateTooltipForCell(cell, Math.floor(rect.left + rect.width / 2), Math.floor(rect.top + rect.height / 2));
                    }
                }, LONG_PRESS_MS);
            }, { passive: true });
            el.addEventListener('touchend', () => {
                if (pressTimer) clearTimeout(pressTimer);
                if (longPressSuppressClick) {
                    hideTooltip();
                }
            });
            el.addEventListener('click', () => {
                if (longPressSuppressClick) {
                    longPressSuppressClick = false;
                    return;
                }
                if (selectedValue === STATE.UNKNOWN) {
                    cell.value = STATE.UNKNOWN;
                } else if (selectedValue >= 0 && selectedValue <= 8) {
                    cell.value = selectedValue;
                }
                clearDeductions();
                renderBoard();
                saveState();
            });

            cell.element = el;
            boardElement.appendChild(el);
            row.push(cell);
        }
        grid.push(row);
    }
}

function initPicker() {
    if (!pickerElement) return;
    pickerElement.innerHTML = '';
    const values = [STATE.UNKNOWN, 0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const el = document.createElement('div');
        el.className = 'picker-cell';
        if (v === STATE.UNKNOWN) {
            el.textContent = '?';
        } else {
            el.textContent = String(v);
            if (v > 0) el.classList.add('val-' + v);
        }
        if (v === selectedValue) el.classList.add('selected');
        el.addEventListener('click', () => {
            selectedValue = v;
            const children = pickerElement.children;
            for (let j = 0; j < children.length; j++) {
                children[j].classList.remove('selected');
            }
            el.classList.add('selected');
        });
        pickerElement.appendChild(el);
    }
}

function renderBoard() {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = grid[r][c];
            const el = cell.element;
            
            el.className = 'cell';
            el.textContent = '';
            el.style.backgroundColor = '';
            el.style.fontSize = '';
            el.style.color = '';

            if (cell.value !== STATE.UNKNOWN) {
                if (cell.value === 0) {
                    el.classList.add('revealed');
                    // No text content for 0
                } else {
                    el.classList.add('revealed');
                    el.textContent = cell.value;
                    el.classList.add(`val-${cell.value}`);
                }
            } else {
                el.classList.add('unknown');
                if (cell.isMine || cell.probability === 0) {
                    el.classList.add('is-mine');
                } else if (cell.isSafe || cell.probability === 1) {
                    el.classList.add('is-safe');
                }
                
                if (cell.probability !== null && cell.probability > 0 && cell.probability < 1 && !cell.isMine && !cell.isSafe) {
                    let pct = Math.round((1- cell.probability) * 100);
                    let text = pct;
                    
                    // Handle edge cases where rounding hides small/large probabilities
                    if (pct === 100) text = '99';
                    if (pct === 0) text = '1';

                    el.textContent = text;
                    el.style.fontSize = '14px'; // Slightly smaller to fit text
                    el.style.color = 'gray';
                }
            }
        }
    }
}

function createTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    tooltipEl.style.display = 'none';
    document.body.appendChild(tooltipEl);
}

function showTooltip(text, x, y) {
    if (!tooltipEl) createTooltip();
    tooltipEl.innerHTML = text;
    tooltipEl.style.left = (x + 12) + 'px';
    tooltipEl.style.top = (y + 12) + 'px';
    tooltipEl.style.display = 'block';
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
}

function gcdBigInt(a, b) {
    a = BigInt(a);
    b = BigInt(b);
    if (a < 0n) a = -a;
    if (b < 0n) b = -b;
    while (b !== 0n) {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
}

function formatFraction(numStr, denStr) {
    if (!numStr || !denStr) return '';
    const num = BigInt(numStr);
    const den = BigInt(denStr);
    if (den === 0n) return '';
    const g = gcdBigInt(num, den);
    const rn = num / g;
    const rd = den / g;
    return rn.toString() + '/' + rd.toString();
}

function updateTooltipForCell(cell, x, y) {
    let text = '';
    if (cell.value !== STATE.UNKNOWN) {
        text = '已知数字';
    } else {
        if (cell.isMine || cell.probability === 0) {
            text = '必雷';
        } else if (cell.isSafe || cell.probability === 1) {
            text = '必安全';
        } else if (cell.probability != null) {
            const safePct = Math.max(0, Math.min(1, cell.probability));
            const minePct = 1 - safePct;
            const mineText = (minePct * 100).toFixed(2) + '%';
            const safeText = (safePct * 100).toFixed(2) + '%';
            let mineFrac = '';
            let safeFrac = '';
            if (cell.probNumStr && cell.probDenStr) {
                try {
                    const den = BigInt(cell.probDenStr);
                    const safeNum = BigInt(cell.probNumStr);
                    const mineNum = den - safeNum;
                    mineFrac = formatFraction(mineNum.toString(), den.toString());
                    safeFrac = formatFraction(safeNum.toString(), den.toString());
                } catch {}
            }
            if (mineFrac && safeFrac) {
                text = '雷 ' + mineText + ' (' + mineFrac + ')<br>安全 ' + safeText + ' (' + safeFrac + ')';
            } else if (mineFrac) {
                text = '雷 ' + mineText + ' (' + mineFrac + ')<br>安全 ' + safeText;
            } else if (safeFrac) {
                text = '雷 ' + mineText + '<br>安全 ' + safeText + ' (' + safeFrac + ')';
            } else {
                text = '雷 ' + mineText + '<br>安全 ' + safeText;
            }
        } else {
            text = '暂无概率';
        }
    }
    showTooltip(text, x, y);
}

document.addEventListener('keydown', (e) => {
    if (!hoveredCell) return;
    
    const { r, c } = hoveredCell;
    const cell = grid[r][c];
    let changed = false;

    if (e.key >= '0' && e.key <= '8') {
        cell.value = parseInt(e.key);
        changed = true;
    } else if (e.code === 'Space') {
        cell.value = STATE.UNKNOWN;
        changed = true;
    }

    if (changed) {
        // Reset deductions when board changes
        clearDeductions();
        // Do NOT auto-solve, just re-render to clear old visualizations
        renderBoard();
        saveState();
    }
});

function clearDeductions() {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            grid[r][c].isMine = false;
            grid[r][c].isSafe = false;
            grid[r][c].probability = null;
        }
    }
}

function getNeighbors(r, c) {
    const neighbors = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                neighbors.push(grid[nr][nc]);
            }
        }
    }
    return neighbors;
}

// --- Solver Logic ---

function solve() {
    const v = parseInt(minesInput.value);
    if (!Number.isNaN(v) && v >= 0) {
        totalMines = v;
    }
    // Clear previous deductions (green/red highlights) before re-analysis
    clearDeductions();
    // 2. Probabilistic / Coupled Pass using solver.js
    if (typeof ProbabilityEngine !== 'undefined' && binomialCache) {
        runSolverJs();
    } else {
        // Fallback or just stop
        console.warn("Solver JS not loaded properly");
    }
}

// --- Solver.js Adapter ---

// Extend ProbabilityEngine to force full analysis even if safe tiles are found
class FullProbabilityEngine extends ProbabilityEngine {
    process() {
        super.process();
        
        // If the original process skipped full analysis (because it found local clears),
        // we force it now to get probabilities for all other cells.
        if (this.validWeb && !this.fullAnalysis) {
            console.log("Forcing full probability analysis...");
            this.calculateBoxProbabilities();
        }
    }
}

class SolverTile {
    constructor(cell) {
        this.cell = cell;
        this.x = cell.c;
        this.y = cell.r;
        this.index = cell.r * cols + cell.c;
    }

    isAdjacent(other) {
        const dx = Math.abs(this.x - other.x);
        const dy = Math.abs(this.y - other.y);
        return dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0);
    }

    isEqual(other) {
        return this.index === other.index;
    }

    asText() {
        return `(${this.x},${this.y})`;
    }

    getValue() {
        return this.cell.value;
    }

    isSolverFoundBomb() {
        return this.cell.isMine;
    }

    isCovered() {
        return this.cell.value === STATE.UNKNOWN && !this.cell.isSafe; 
        // Note: In solver.js logic, isCovered usually means unrevealed. 
        // If we marked it as safe, it's effectively "revealed" as empty for the solver?
        // Actually, solver.js seems to handle 'localClears' separately.
        // If isSafe is true, it means we know it's empty. The solver treats "covered" as unknowns.
        // So if isSafe is true, it should probably NOT be covered?
        // But if it's not covered, it needs a value (0-8). We don't know the value yet.
        // So it stays covered until the user reveals it (enters a number).
    }
    
    // Additional helper for SolverBoard
    getX() { return this.x; }
    getY() { return this.y; }
}

class SolverBoard {
    constructor(grid, rows, cols) {
        this.tiles = [];
        this.grid = grid;
        this.rows = rows;
        this.cols = cols;
        
        // Create wrappers
        this.map = new Map();
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                const tile = new SolverTile(grid[r][c]);
                this.tiles.push(tile);
                this.map.set(tile.index, tile);
            }
        }
    }

    getAdjacent(tile) {
        const neighbors = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = tile.y + dr;
                const nc = tile.x + dc;
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
                    const idx = nr * this.cols + nc;
                    neighbors.push(this.map.get(idx));
                }
            }
        }
        return neighbors;
    }
    
    getTile(r, c) {
        return this.map.get(r * this.cols + c);
    }
}

function runSolverJs() {
    const board = new SolverBoard(grid, rows, cols);
    const allWitnesses = [];
    const allWitnessed = []; // Set of unique witnessed tiles
    const witnessedSet = new Set();
    
    let minesFoundCount = 0;
    let squaresLeft = 0;

    // Categorize tiles
    for (let t of board.tiles) {
        if (t.isSolverFoundBomb()) {
            minesFoundCount++;
        }
        
        if (t.isCovered() && !t.isSolverFoundBomb()) {
            squaresLeft++;
        }

        if (!t.isCovered() && !t.isSolverFoundBomb()) {
            // It's a witness (revealed number)
            // But we must ensure it's not a deduced safe tile that hasn't been revealed yet.
            // My isCovered definition: value === UNKNOWN && !isSafe.
            // So if value !== UNKNOWN, it's a witness.
            if (t.getValue() !== STATE.UNKNOWN) {
                allWitnesses.push(t);
                
                // Add its neighbors to witnessed
                const adj = board.getAdjacent(t);
                for (let n of adj) {
                    if (n.isCovered() && !n.isSolverFoundBomb()) {
                        if (!witnessedSet.has(n.index)) {
                            witnessedSet.add(n.index);
                            allWitnessed.push(n);
                        }
                    }
                }
            }
        }
    }

    const minesLeft = totalMines - minesFoundCount;

    // If no mines left or something weird, abort
    if (minesLeft < 0) return;

    const options = {
        playStyle: PLAY_STYLE_NOFLAGS,
        verbose: false, // Turn off console logs
        fullProbability: true // We want probabilities
    };

    console.log("Running ProbabilityEngine...");
    const pe = new FullProbabilityEngine(board, allWitnesses, allWitnessed, squaresLeft, minesLeft, options);
    
    pe.process();

    // Apply results
    
    // 1. Mines Found
    for (let m of pe.minesFound) {
        m.cell.isMine = true;
    }

    // 2. Safe Tiles (Local Clears)
    for (let s of pe.localClears) {
        s.cell.isSafe = true;
    }

    // 3. Probabilities
    // pe.boxProb is an array indexed by box uid.
    // We need to map tiles to their probabilities.
    // pe.getProbability(tile) is the method.
    
    for (let t of board.tiles) {
        if (t.isCovered() && !t.isSolverFoundBomb()) {
            // If it was just marked safe/mine, skip probability update (or set to 0/1)
            if (t.cell.isMine) {
                t.cell.probability = 1;
            } else if (t.cell.isSafe) {
                t.cell.probability = 0;
            } else {
                const prob = pe.getProbability(t);
                t.cell.probability = prob;
                const box = pe.getBox(t);
                if (box && pe.finalSolutionsCount) {
                    const safeNumerator = (pe.finalSolutionsCount - box.mineTally).toString();
                    const denominator = pe.finalSolutionsCount.toString();
                    t.cell.probNumStr = safeNumerator;
                    t.cell.probDenStr = denominator;
                } else {
                    if (pe.offEdgeDenominator && pe.offEdgeSafeNumerator) {
                        t.cell.probNumStr = pe.offEdgeSafeNumerator.toString();
                        t.cell.probDenStr = pe.offEdgeDenominator.toString();
                    } else {
                        t.cell.probNumStr = null;
                        t.cell.probDenStr = null;
                    }
                }
            }
        }
    }

    saveState();
}

function calculateProbabilities() {
    // Legacy logic... (kept as fallback or remove?)
    // Remove to avoid confusion since user wants fully solver.js
}

// Init
resetBtn.addEventListener('click', () => {
    initGame();
});

solveBtn.addEventListener('click', () => {
    solve();
    renderBoard();
    saveState();
});

initGame();
initPicker();
createTooltip();
applyCachedState();
renderBoard();

function saveState() {
    const state = {
        rows, cols, totalMines,
        grid: grid.map(row => row.map(cell => ({
            value: cell.value,
            isMine: cell.isMine,
            isSafe: cell.isSafe,
            probability: cell.probability,
            probNumStr: cell.probNumStr || null,
            probDenStr: cell.probDenStr || null
        })))
    };
    try {
        localStorage.setItem('ms_state', JSON.stringify(state));
    } catch {}
}

function applyCachedState() {
    let raw;
    try {
        raw = localStorage.getItem('ms_state');
    } catch {}
    if (!raw) return;
    let state;
    try {
        state = JSON.parse(raw);
    } catch { return; }
    if (!state || !state.grid) return;
    const targetRows = state.rows || rows;
    const targetCols = state.cols || cols;
    const targetMines = state.totalMines != null ? state.totalMines : totalMines;
    rowsInput.value = targetRows;
    colsInput.value = targetCols;
    minesInput.value = targetMines;
    if (state.grid.length !== targetRows || state.grid[0].length !== targetCols) {
        initGame();
    }
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const src = state.grid[r][c];
            const cell = grid[r][c];
            cell.value = src.value;
            cell.isMine = !!src.isMine;
            cell.isSafe = !!src.isSafe;
            cell.probability = src.probability != null ? src.probability : null;
            cell.probNumStr = src.probNumStr || null;
            cell.probDenStr = src.probDenStr || null;
        }
    }
}
