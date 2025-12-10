const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const minesInput = document.getElementById('totalMines');
const minesUnknownCheckbox = document.getElementById('mines-unknown');
const gridEl = document.getElementById('grid');
const statusEl = document.getElementById('status');
const paletteEl = document.getElementById('palette');

let width = 9;
let height = 9;
let totalMines = 10;
let grid = []; // 2D array: { type: 'unknown' | 'number', value: 0-8 }
let selectedTool = { type: 'unknown', value: 0 }; // Default tool
let hoveredCell = null; // Track hovered cell for keyboard input

function initPalette() {
    paletteEl.innerHTML = '';
    
    // Tools: Unknown, 0, 1, ..., 8
    const tools = [
        { type: 'unknown', value: 0, label: '' },
        { type: 'number', value: 0, label: '' }, // 0
        { type: 'number', value: 1, label: '1' },
        { type: 'number', value: 2, label: '2' },
        { type: 'number', value: 3, label: '3' },
        { type: 'number', value: 4, label: '4' },
        { type: 'number', value: 5, label: '5' },
        { type: 'number', value: 6, label: '6' },
        { type: 'number', value: 7, label: '7' },
        { type: 'number', value: 8, label: '8' }
    ];

    tools.forEach(tool => {
        const item = document.createElement('div');
        item.className = 'palette-item';
        
        if (tool.type === 'number') {
            item.classList.add('open');
                item.textContent = tool.label;
                item.classList.add(`val-${tool.value}`);
        }
        
        item.addEventListener('click', () => {
            selectTool(tool, item);
        });

        // Select default (Unknown) initially
        if (tool.type === 'unknown') {
            selectTool(tool, item);
        }

        paletteEl.appendChild(item);
    });
}

function selectTool(tool, element) {
    selectedTool = tool;
    // Update UI
    const items = paletteEl.children;
    for (let i = 0; i < items.length; i++) {
        items[i].classList.remove('selected');
    }
    element.classList.add('selected');
}

function clearProbabilities() {
    const cells = gridEl.children;
    for (let i = 0; i < cells.length; i++) {
         const prob = cells[i].querySelector('.prob');
         if (prob) prob.remove();
         cells[i].style.backgroundColor = '';
    }
    statusEl.textContent = '就绪';
}

function initGrid() {
    width = parseInt(widthInput.value);
    height = parseInt(heightInput.value);
    totalMines = parseInt(minesInput.value);
    
    gridEl.style.gridTemplateColumns = `repeat(${width}, 32px)`;
    gridEl.innerHTML = '';
    grid = [];

    for (let y = 0; y < height; y++) {
        let row = [];
        for (let x = 0; x < width; x++) {
            row.push({ type: 'unknown', value: 0 });
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            
            // Left click to apply selected tool
            cell.addEventListener('click', (e) => {
                const s = grid[y][x];
                // Apply tool
                s.type = selectedTool.type;
                s.value = selectedTool.value;
                renderCell(cell, s);
                clearProbabilities();
            });
            
            // Hover tracking
            cell.addEventListener('mouseenter', () => {
                hoveredCell = { x, y, element: cell };
            });
            cell.addEventListener('mouseleave', () => {
                if (hoveredCell && hoveredCell.element === cell) {
                    hoveredCell = null;
                }
            });

            // Right click still resets to unknown (optional, but good for quick fix)
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const s = grid[y][x];
                s.type = 'unknown';
                s.value = 0;
                renderCell(cell, s);
                clearProbabilities();
            });

            gridEl.appendChild(cell);
        }
        grid.push(row);
    }
    statusEl.textContent = '就绪';
}

function renderCell(el, state) {
    el.className = 'cell';
    el.textContent = '';
    // Remove old probability display if any
    const prob = el.querySelector('.prob');
    if (prob) prob.remove();

    if (state.type === 'number') {
        el.classList.add('open');
        if (state.value !== 0) {
            el.textContent = state.value;
            el.classList.add(`val-${state.value}`);
        }
    }
}

// Update totalMines variable when input changes, without resetting grid
minesInput.addEventListener('change', () => {
    totalMines = parseInt(minesInput.value);
    statusEl.textContent = `总雷数更新为: ${totalMines}`;
    clearProbabilities();
});

minesUnknownCheckbox.addEventListener('change', () => {
    minesInput.disabled = minesUnknownCheckbox.checked;
    clearProbabilities();
    statusEl.textContent = minesUnknownCheckbox.checked ? '总雷数设置为未知' : `总雷数更新为: ${totalMines}`;
});

// Reset Board button applies all settings (width, height, mines) and resets grid
document.getElementById('resetBtn').addEventListener('click', initGrid);

document.getElementById('calcBtn').addEventListener('click', async () => {
    // Ensure we have the latest mine count
    totalMines = parseInt(minesInput.value);
    const effectiveTotalMines = minesUnknownCheckbox.checked ? -1 : totalMines;
    
    statusEl.textContent = '计算中...';
    try {
        // Clear previous probabilities
        const cells = gridEl.children;
        for (let i = 0; i < cells.length; i++) {
             const prob = cells[i].querySelector('.prob');
             if (prob) prob.remove();
             cells[i].style.backgroundColor = '';
             
             // Restore base styling
             const x = parseInt(cells[i].dataset.x);
             const y = parseInt(cells[i].dataset.y);
             if (grid[y][x].type === 'number') {
                 cells[i].classList.add('open');
             } else {
                 cells[i].classList.remove('open');
             }
        }

        // Add a small delay to allow UI to update text
        await new Promise(r => setTimeout(r, 10));

        const probabilities = await calculateProbabilities(grid, width, height, effectiveTotalMines);
        displayProbabilities(probabilities);
        statusEl.textContent = '计算完成';
    } catch (e) {
        statusEl.textContent = '错误: ' + e.message;
        console.error(e);
    }
});

function getProbabilityColor(p) {
    // Gradient: Green (0,255,0) -> Yellow (255,255,0) -> Red (255,0,0)
    let r, g, b;
    const alpha = 0.5;

    if (p <= 0.5) {
        // Green to Yellow
        // p: 0 -> 0.5 => ratio: 0 -> 1
        const ratio = p * 2;
        r = Math.round(255 * ratio);
        g = 255;
        b = 0;
    } else {
        // Yellow to Red
        // p: 0.5 -> 1 => ratio: 0 -> 1
        const ratio = (p - 0.5) * 2;
        r = 255;
        g = Math.round(255 * (1 - ratio));
        b = 0;
    }
    
    // Special case for 0 (Safe) - Pure Green
    if (p === 0) return `rgba(0, 255, 0, 0.5)`;
    // Special case for 1 (Mine) - Pure Red
    if (p === 1) return `rgba(255, 0, 0, 0.8)`;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function displayProbabilities(probs) {
    const cells = gridEl.children;
    for (let i = 0; i < cells.length; i++) {
        const x = parseInt(cells[i].dataset.x);
        const y = parseInt(cells[i].dataset.y);
        const p = probs[y][x];
        
        // Remove existing
        const existing = cells[i].querySelector('.prob');
        if (existing) existing.remove();

        if (p !== null && grid[y][x].type === 'unknown') {
            const probEl = document.createElement('div');
            probEl.className = 'prob';
            probEl.textContent = (p * 100).toFixed(2);
            
            // Color code based on probability
            const bg = getProbabilityColor(p);
            
            cells[i].style.backgroundColor = bg;
            cells[i].appendChild(probEl);
        } else {
            cells[i].style.backgroundColor = '';
        }
    }
}

initPalette();
initGrid();

// Keyboard input handler
document.addEventListener('keydown', (e) => {
    // Only process if we are hovering over a cell and not typing in an input field
    if (!hoveredCell || e.target.tagName === 'INPUT') return;

    const { x, y, element } = hoveredCell;
    const s = grid[y][x];
    let changed = false;

    // Numbers 0-8
    if (e.key >= '0' && e.key <= '8') {
        s.type = 'number';
        s.value = parseInt(e.key);
        changed = true;
    } 
    // Clear cell (Backspace, Delete, u, Space)
    else if (['Backspace', 'Delete', 'u', 'U', ' '].includes(e.key)) {
        s.type = 'unknown';
        s.value = 0;
        changed = true;
    }

    if (changed) {
        e.preventDefault(); // Prevent scrolling for Space
        renderCell(element, s);
        clearProbabilities();
    }
});
