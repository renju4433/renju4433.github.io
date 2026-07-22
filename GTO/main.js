import { createDeck, shuffle, getBestCombo, compareCombos } from './game.js';

let deck = [];
let playersCards = [[], []];
let communityCards = [];

const btnStart = document.getElementById('btn-start');
const btnCommunity = document.getElementById('btn-community');
const btnCalc = document.getElementById('btn-calc');
const resultBanner = document.getElementById('result-banner');

function renderCard(val) {
    return `<div class="card">${val}</div>`;
}

function renderEmptyCard() {
    return `<div class="card empty"></div>`;
}

btnStart.addEventListener('click', () => {
    // Reset state
    deck = shuffle(createDeck());
    playersCards = [[], []];
    communityCards = [];
    
    // Clear UI
    resultBanner.textContent = '';
    document.getElementById('community-cards').innerHTML = renderEmptyCard().repeat(3);
    
    for (let i = 1; i <= 2; i++) {
        const pBox = document.getElementById(`player-${i}`);
        pBox.classList.remove('winner');
        document.getElementById(`p${i}-status`).textContent = '';
        document.getElementById(`p${i}-best-combo`).classList.remove('visible');
    }
    
    // Deal 2 cards to each player
    playersCards[0].push(deck.pop(), deck.pop());
    playersCards[1].push(deck.pop(), deck.pop());
    
    // Render player cards
    document.getElementById('p1-cards').innerHTML = playersCards[0].map(renderCard).join('');
    document.getElementById('p2-cards').innerHTML = playersCards[1].map(renderCard).join('');
    
    // Update buttons
    btnStart.textContent = '重新开始';
    btnCommunity.disabled = false;
    btnCalc.disabled = true;
});

btnCommunity.addEventListener('click', async () => {
    btnCommunity.disabled = true;
    
    // Deal 3 community cards
    communityCards = [deck.pop(), deck.pop(), deck.pop()];
    const container = document.getElementById('community-cards');
    
    // Reveal one by one with animation delay
    for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 600));
        const cardsHtml = communityCards.slice(0, i + 1).map(renderCard).join('') + 
                          renderEmptyCard().repeat(2 - i);
        container.innerHTML = cardsHtml;
    }
    
    btnCalc.disabled = false;
});

btnCalc.addEventListener('click', () => {
    btnCalc.disabled = true;
    
    const p1AllCards = [...playersCards[0], ...communityCards];
    const p2AllCards = [...playersCards[1], ...communityCards];
    
    const p1Best = getBestCombo(p1AllCards);
    const p2Best = getBestCombo(p2AllCards);
    
    // Render best combos
    function renderBest(pIndex, best) {
        document.getElementById(`p${pIndex}-best-combo`).classList.add('visible');
        document.getElementById(`p${pIndex}-best-cards`).innerHTML = best.cards.map(renderCard).join('');
        document.getElementById(`p${pIndex}-status`).innerHTML = `最大公约数 (GCD): <strong>${best.gcd}</strong> <br>比牌排序: ${best.sortedCards.join(' < ')}`;
    }
    
    renderBest(1, p1Best);
    renderBest(2, p2Best);
    
    // Compare
    const comp = compareCombos(p1Best.cards, p2Best.cards);
    
    const p1Box = document.getElementById('player-1');
    const p2Box = document.getElementById('player-2');
    
    if (comp > 0) {
        resultBanner.textContent = '🏆 玩家 1 获胜！';
        p1Box.classList.add('winner');
    } else if (comp < 0) {
        resultBanner.textContent = '🏆 玩家 2 获胜！';
        p2Box.classList.add('winner');
    } else {
        resultBanner.textContent = '🤝 平局！';
        p1Box.classList.add('winner');
        p2Box.classList.add('winner');
    }
    
    // Highlight used cards in player's hand
    highlightCards(1, p1Best.cards, playersCards[0]);
    highlightCards(2, p2Best.cards, playersCards[1]);
});

function highlightCards(pIndex, bestCards, handCards) {
    const bestSet = new Set(bestCards);
    const handEls = document.getElementById(`p${pIndex}-cards`).children;
    handCards.forEach((val, i) => {
        if (bestSet.has(val)) {
            handEls[i].classList.add('highlight');
        }
    });
}

// ---------------- GTO Solver Logic ----------------

const tabSim = document.getElementById('tab-sim');
const tabGto = document.getElementById('tab-gto');
const viewSim = document.getElementById('view-sim');
const viewGto = document.getElementById('view-gto');

tabSim.addEventListener('click', () => {
    tabSim.classList.add('active');
    tabGto.classList.remove('active');
    viewSim.style.display = 'block';
    viewGto.style.display = 'none';
});

tabGto.addEventListener('click', () => {
    tabGto.classList.add('active');
    tabSim.classList.remove('active');
    viewGto.style.display = 'block';
    viewSim.style.display = 'none';
});

const btnSolve = document.getElementById('btn-solve');
const progressContainer = document.getElementById('gto-progress-container');
const progressFill = document.getElementById('gto-progress-fill');
const progressText = document.getElementById('gto-progress-text');
const tbody = document.getElementById('gto-tbody');

let solverWorker = null;

function renderFreq(val1, label1, color1, val2, label2, color2) {
    const p1 = (val1 * 100).toFixed(1);
    const p2 = (val2 * 100).toFixed(1);
    return `
        <div>
            <span style="color:${color1}; font-weight:bold">${label1}: ${p1}%</span> | 
            <span style="color:${color2}; font-weight:bold">${label2}: ${p2}%</span>
        </div>
        <div style="display:flex; width:100%; height:8px; border-radius:4px; overflow:hidden; margin-top:4px;">
            <div style="width:${p1}%; background-color:${color1};"></div>
            <div style="width:${p2}%; background-color:${color2};"></div>
        </div>
    `;
}

btnSolve.addEventListener('click', () => {
    const commStr = document.getElementById('gto-community').value;
    const pot = parseFloat(document.getElementById('gto-pot').value) || 100;
    const bet = parseFloat(document.getElementById('gto-bet').value) || 50;

    const commCards = commStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 52);
    
    if (commCards.length !== 3) {
        alert("请输入正好 3 张合法的公共牌 (1-52)！");
        return;
    }

    btnSolve.disabled = true;
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    tbody.innerHTML = '';

    if (solverWorker) solverWorker.terminate();

    solverWorker = new Worker('cfrWorker.js', { type: 'module' });

    solverWorker.onmessage = function(e) {
        if (e.data.type === 'progress') {
            const p = e.data.progress.toFixed(1);
            progressFill.style.width = p + '%';
            progressText.textContent = `CFR 迭代中... ${p}%`;
        } else if (e.data.type === 'done') {
            progressFill.style.width = '100%';
            progressText.textContent = '求解完成！';
            btnSolve.disabled = false;

            const results = e.data.results;
            
            // 为了避免页面卡顿，只渲染前 100 条（最强组合）和后 100 条（最弱组合）或分页
            // 简单起见，这里渲染全部（1176行），可能稍微需要1-2秒
            const html = results.map(r => `
                <tr>
                    <td><strong>[${r.hand.join(', ')}]</strong></td>
                    <td>GCD: ${r.bestCombo.gcd} <br> <small>${r.bestCombo.sortedCards.join('<')}</small></td>
                    <td>${renderFreq(r.p1_root_check, 'Check', '#3498db', r.p1_root_bet, 'Bet', '#e74c3c')}</td>
                    <td>${renderFreq(r.p2_bet_fold, 'Fold', '#95a5a6', r.p2_bet_call, 'Call', '#e67e22')}</td>
                    <td>${renderFreq(r.p2_chk_check, 'Check', '#3498db', r.p2_chk_bet, 'Bet', '#e74c3c')}</td>
                    <td>${renderFreq(r.p1_chkbet_fold, 'Fold', '#95a5a6', r.p1_chkbet_call, 'Call', '#e67e22')}</td>
                </tr>
            `).join('');
            
            tbody.innerHTML = html;
        }
    };

    solverWorker.postMessage({
        communityCards: commCards,
        iterations: 1000,
        pot: pot,
        bet: bet
    });
});
