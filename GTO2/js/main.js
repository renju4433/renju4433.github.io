document.addEventListener('DOMContentLoaded', () => {
    const solveBtn = document.getElementById('solve-btn');
    const loadingDiv = document.getElementById('loading');
    const resultsPanel = document.getElementById('results-panel');
    const treeViewerContainer = document.getElementById('tree-viewer');
    
    initGrid('oop-range-grid', []);
    initGrid('ip-range-grid', []);
    loadFromHash();

    // Add event listeners to update hash on change
    document.getElementById('board-cards').addEventListener('input', updateAllHashParameters);
    document.getElementById('starting-pot').addEventListener('input', updateAllHashParameters);
    document.getElementById('effective-stack').addEventListener('input', updateAllHashParameters);
    document.getElementById('bet-sizes').addEventListener('input', updateAllHashParameters);
    document.getElementById('raise-sizes').addEventListener('input', updateAllHashParameters);
    document.getElementById('iterations').addEventListener('input', updateAllHashParameters);

    // For the range grids, the update should happen after the drag/touch ends
    document.getElementById('oop-range-grid').addEventListener('mouseup', updateAllHashParameters);
    document.getElementById('oop-range-grid').addEventListener('touchend', updateAllHashParameters);
    document.getElementById('ip-range-grid').addEventListener('mouseup', updateAllHashParameters);
    document.getElementById('ip-range-grid').addEventListener('touchend', updateAllHashParameters);


    solveBtn.addEventListener('click', () => {
        const boardStr = document.getElementById('board-cards').value;
        const startingPot = parseInt(document.getElementById('starting-pot').value);
        const effStack = parseInt(document.getElementById('effective-stack').value);
        const betSizesStr = document.getElementById('bet-sizes').value;
        const raiseSizesStr = document.getElementById('raise-sizes').value;
        const iterations = parseInt(document.getElementById('iterations').value);
        
        let oopReach = getGridReach('oop-range-grid');
        let ipReach = getGridReach('ip-range-grid');
        let boardCards = parseBoard(boardStr);
        let betSizes = betSizesStr.split(',').map(s => parseFloat(s.trim())).filter(s => !isNaN(s));
        let raiseSizes = raiseSizesStr.split(',').map(s => s.trim().toLowerCase() === 'a' ? 'a' : parseFloat(s.trim())).filter(s => s === 'a' || !isNaN(s));
        
        updateAllHashParameters();
        
        solveBtn.disabled = true;
        loadingDiv.style.display = 'block';
        resultsPanel.style.display = 'block';
        treeViewerContainer.innerHTML = '';
        
        setTimeout(() => {
            const builder = new GameTreeBuilder({
                betSizes,
                raiseSizes,
                startingPot,
                effectiveStack: effStack
            });
            
            const root = builder.build(boardCards, startingPot, effStack);
            const solver = new GTOSolver(root, oopReach, ipReach);
            
            solver.solve(iterations, (cur, total, done) => {
                loadingDiv.innerText = `计算中... ${cur} / ${total}`;
                if (done) {
                    loadingDiv.innerText = '渲染结果...';
                    setTimeout(() => {
                        renderTreeViewer(root, treeViewerContainer);
                        loadingDiv.style.display = 'none';
                        solveBtn.disabled = false;
                    }, 50);
                }
            });
        }, 50);
    });
});

function initGrid(containerId, initialSelected) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const gridRanks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
    gridRanks.forEach(r => {
        const cell = document.createElement('div');
        cell.className = 'range-cell';
        if (initialSelected.includes(r)) {
            cell.classList.add('selected');
        }
        cell.innerText = r;
        cell.dataset.rank = r;
        container.appendChild(cell);
    });

    let isDragging = false;
    let toggleState = true;

    const handleDown = (target) => {
        if (target && target.classList.contains('range-cell')) {
            isDragging = true;
            toggleState = !target.classList.contains('selected');
            target.classList.toggle('selected', toggleState);
        }
    };

    const handleMove = (target) => {
        if (isDragging && target && target.classList.contains('range-cell')) {
            target.classList.toggle('selected', toggleState);
        }
    };

    container.addEventListener('mousedown', (e) => handleDown(e.target));
    container.addEventListener('mouseover', (e) => handleMove(e.target));
    document.addEventListener('mouseup', () => isDragging = false);

    container.addEventListener('touchstart', (e) => {
        let touch = e.touches[0];
        let target = document.elementFromPoint(touch.clientX, touch.clientY);
        handleDown(target);
        e.preventDefault();
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        let touch = e.touches[0];
        let target = document.elementFromPoint(touch.clientX, touch.clientY);
        handleMove(target);
        e.preventDefault();
    }, { passive: false });

    container.addEventListener('touchend', () => isDragging = false);
}

function setGridRange(containerId, selectedRanks) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.range-cell').forEach(cell => {
        cell.classList.toggle('selected', selectedRanks.includes(cell.dataset.rank));
    });
}

function getGridRangeStr(containerId) {
    const container = document.getElementById(containerId);
    const selected = container.querySelectorAll('.range-cell.selected');
    return Array.from(selected).map(el => el.dataset.rank).join(',');
}

function getGridReach(containerId) {
    let reach = new Float64Array(13);
    const container = document.getElementById(containerId);
    const selected = container.querySelectorAll('.range-cell.selected');
    selected.forEach(el => {
        let idx = RANKS.indexOf(el.dataset.rank);
        if (idx !== -1) reach[idx] = 1.0;
    });
    return reach;
}

function updateHash(params) {
    const query = new URLSearchParams();
    for (const key in params) {
        query.set(key, params[key]);
    }
    window.history.replaceState(null, '', '#' + query.toString());
}

function updateAllHashParameters() {
    const boardStr = document.getElementById('board-cards').value;
    const startingPot = parseInt(document.getElementById('starting-pot').value);
    const effStack = parseInt(document.getElementById('effective-stack').value);
    const betSizesStr = document.getElementById('bet-sizes').value;
    const raiseSizesStr = document.getElementById('raise-sizes').value;
    const iterations = parseInt(document.getElementById('iterations').value);

    updateHash({
        oop: getGridRangeStr('oop-range-grid'),
        ip: getGridRangeStr('ip-range-grid'),
        board: boardStr,
        pot: startingPot,
        stack: effStack,
        bet: betSizesStr,
        raise: raiseSizesStr,
        iter: iterations
    });
}

function loadFromHash() {
    if (!window.location.hash) return false;
    const query = new URLSearchParams(window.location.hash.substring(1));
    
    if (query.has('oop')) setGridRange('oop-range-grid', query.get('oop').split(','));
    if (query.has('ip')) setGridRange('ip-range-grid', query.get('ip').split(','));
    if (query.has('board')) document.getElementById('board-cards').value = query.get('board');
    if (query.has('pot')) document.getElementById('starting-pot').value = query.get('pot');
    if (query.has('stack')) document.getElementById('effective-stack').value = query.get('stack');
    if (query.has('bet')) document.getElementById('bet-sizes').value = query.get('bet');
    if (query.has('raise')) document.getElementById('raise-sizes').value = query.get('raise');
    if (query.has('iter')) document.getElementById('iterations').value = query.get('iter');
    
    return true;
}

function parseBoard(str) {
    if (!str.trim()) return [];
    let parts = str.toUpperCase().split(',');
    let board = [];
    for (let p of parts) {
        p = p.trim();
        if (RANKS.includes(p)) board.push(p);
    }
    return board;
}

function renderTreeViewer(root, container) {
    let historyStack = [root];
    
    function updateView() {
        container.innerHTML = '';
        let current = historyStack[historyStack.length - 1];
        
        let breadcrumb = document.createElement('div');
        breadcrumb.style.marginBottom = '16px';
        breadcrumb.innerHTML = historyStack.map((n, i) => {
            if (i === 0) return `<a href="#" data-idx="${i}" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">Root</a>`;
            return ` <span style="color: #888;">></span> <a href="#" data-idx="${i}" style="color: var(--primary-color); text-decoration: none;">${n.lastAction || 'Chance'}</a>`;
        }).join('');
        container.appendChild(breadcrumb);
        
        breadcrumb.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                let idx = parseInt(e.target.getAttribute('data-idx'));
                historyStack = historyStack.slice(0, idx + 1);
                updateView();
            });
        });
        
        if (current.type === 'ACTION') {
            let title = document.createElement('h3');
            title.innerText = `玩家 ${current.player === 0 ? 'OOP' : 'IP'} 行动`;
            title.style.marginBottom = '8px';
            container.appendChild(title);
            
            let info = document.createElement('p');
            info.style.marginBottom = '16px';
            info.style.color = '#666';
            info.innerText = `历史: ${current.history || '无'} | 公共牌: ${current.board.join(',') || '无'} | 底池: ${current.pot}`;
            container.appendChild(info);
            
            let tableContainer = document.createElement('div');
            tableContainer.className = 'strategy-table-container';
            
            let table = document.createElement('table');
            let thead = document.createElement('thead');
            let actionNames = Object.keys(current.children);
            let headRow = `<tr><th>手牌</th><th>EV</th>`;
            actionNames.forEach(a => headRow += `<th>${a}</th>`);
            headRow += `<th>策略分布</th></tr>`;
            thead.innerHTML = headRow;
            table.appendChild(thead);
            
            let tbody = document.createElement('tbody');
            for (let i = 0; i < 13; i++) {
                let sum = 0;
                for (let a = 0; a < actionNames.length; a++) sum += current.strategySum[i][a];
                if (sum === 0) continue; 
                
                let tr = document.createElement('tr');
                let evStr = current.ev && current.ev[i] !== undefined ? current.ev[i].toFixed(2) : '0.00';
                let html = `<td><strong>${RANKS[i]}</strong></td><td>${evStr}</td>`;
                
                let barHtml = '';
                for (let a = 0; a < actionNames.length; a++) {
                    let freq = current.strategySum[i][a] / sum;
                    let pct = (freq * 100).toFixed(1) + '%';
                    html += `<td>${pct}</td>`;
                    
                    let color = getActionColor(actionNames[a]);
                    let barText = '';
                    if (freq > 0.1) {
                        if (actionNames[a].startsWith('Raise')) {
                            const parts = actionNames[a].split(' ');
                            if (parts.length > 1) {
                                barText = 'R' + parts[1]; // e.g., "R100" or "RAll-in"
                            } else {
                                barText = 'R';
                            }
                        } else {
                            barText = actionNames[a][0];
                        }
                    }
                    barHtml += `<div class="action-segment" style="width: ${freq * 100}%; background-color: ${color};" title="${actionNames[a]}: ${pct}">${barText}</div>`;
                }
                
                html += `<td style="width: 250px;"><div class="action-bar">${barHtml}</div></td>`;
                tr.innerHTML = html;
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            tableContainer.appendChild(table);
            container.appendChild(tableContainer);
            
            let childDiv = document.createElement('div');
            childDiv.style.marginTop = '20px';
            let nextTitle = document.createElement('h4');
            nextTitle.innerText = '探索下一步:';
            nextTitle.style.marginBottom = '10px';
            childDiv.appendChild(nextTitle);
            
            actionNames.forEach(a => {
                let btn = document.createElement('button');
                btn.innerText = a;
                btn.style.marginRight = '8px';
                btn.style.backgroundColor = getActionColor(a);
                btn.addEventListener('click', () => {
                    let child = current.children[a];
                    child.lastAction = a;
                    historyStack.push(child);
                    updateView();
                });
                childDiv.appendChild(btn);
            });
            container.appendChild(childDiv);
            
        } else if (current.type === 'CHANCE') {
            let title = document.createElement('h3');
            title.innerText = `发牌 (Chance)`;
            title.style.marginBottom = '8px';
            container.appendChild(title);
            
            let info = document.createElement('p');
            info.style.marginBottom = '16px';
            info.style.color = '#666';
            info.innerText = `历史: ${current.history} | 底池: ${current.pot}`;
            container.appendChild(info);
            
            let childDiv = document.createElement('div');
            Object.keys(current.children).forEach(c => {
                let btn = document.createElement('button');
                btn.innerText = `发 ${c}`;
                btn.style.marginRight = '8px';
                btn.style.marginBottom = '8px';
                btn.style.backgroundColor = '#888';
                btn.addEventListener('click', () => {
                    let child = current.children[c];
                    child.lastAction = `发 ${c}`;
                    historyStack.push(child);
                    updateView();
                });
                childDiv.appendChild(btn);
            });
            container.appendChild(childDiv);
            
        } else if (current.type === 'TERMINAL') {
            let title = document.createElement('h3');
            let result = current.foldedPlayer !== -1 ? `玩家 ${current.foldedPlayer === 0 ? 'OOP' : 'IP'} 弃牌` : '摊牌 (Showdown)';
            title.innerText = `游戏结束 - ${result}`;
            title.style.marginBottom = '8px';
            container.appendChild(title);
            
            let info = document.createElement('p');
            info.style.color = '#666';
            info.innerText = `最终底池: ${current.pot}`;
            container.appendChild(info);
        }
    }
    
    updateView();
}

function getActionColor(actionName) {
    if (actionName.startsWith('Fold')) return 'var(--action-fold)';
    if (actionName.startsWith('Check') || actionName.startsWith('Call')) return 'var(--action-call)';
    if (actionName.startsWith('Bet') || actionName.startsWith('Raise')) return 'var(--action-bet)';
    return '#888';
}