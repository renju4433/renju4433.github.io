import { createDeck, shuffle, getBestCombo, compareCombos } from './game.js';

let deck = [];
let playersCards = [[], []];
let communityCards = [];
let communityCardsRevealed = 0;

function speak(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // 停止当前正在播放的语音
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'zh-CN';
        window.speechSynthesis.speak(msg);
    }
}

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
    communityCardsRevealed = 0;
    
    // Clear UI
    resultBanner.textContent = '';
    document.getElementById('community-cards').innerHTML = renderEmptyCard().repeat(5);
    
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
    btnCommunity.textContent = '发翻牌 (3张)';
    btnCommunity.disabled = false;
    btnCalc.disabled = true;
});

btnCommunity.addEventListener('click', async () => {
    btnCommunity.disabled = true;
    
    if (communityCardsRevealed === 0) {
        // Flop: Deal 3 cards
        const flopCards = [deck.pop(), deck.pop(), deck.pop()];
        communityCards.push(...flopCards);
        communityCardsRevealed = 3;
        
        speak(`翻牌 ${flopCards.join('、')}`);
        
        const container = document.getElementById('community-cards');
        // Animation delay for Flop
        for (let i = 0; i < 3; i++) {
            await new Promise(r => setTimeout(r, 400));
            const cardsHtml = communityCards.slice(0, i + 1).map(renderCard).join('') + 
                              renderEmptyCard().repeat(4 - i);
            container.innerHTML = cardsHtml;
        }
        
        btnCommunity.textContent = '发转牌 (1张)';
        btnCommunity.disabled = false;
        
    } else if (communityCardsRevealed === 3) {
        // Turn: Deal 1 card
        const turnCard = deck.pop();
        communityCards.push(turnCard);
        communityCardsRevealed = 4;
        
        speak(`转牌 ${turnCard}`);
        
        const container = document.getElementById('community-cards');
        const cardsHtml = communityCards.map(renderCard).join('') + renderEmptyCard();
        container.innerHTML = cardsHtml;
        
        btnCommunity.textContent = '发河牌 (1张)';
        btnCommunity.disabled = false;
        
    } else if (communityCardsRevealed === 4) {
        // River: Deal 1 card
        const riverCard = deck.pop();
        communityCards.push(riverCard);
        communityCardsRevealed = 5;
        
        speak(`河牌 ${riverCard}`);
        
        const container = document.getElementById('community-cards');
        const cardsHtml = communityCards.map(renderCard).join('');
        container.innerHTML = cardsHtml;
        
        btnCommunity.textContent = '公共牌已发完';
        btnCalc.disabled = false;
    }
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
        
        const cardsHtml = best.sortedCards.map(val => {
            if (best.gcdCards.includes(val)) {
                return `<div class="card highlight">${val}<span class="badge">${best.G}</span></div>`;
            } else {
                return `<div class="card">${val}</div>`;
            }
        }).join('');
        
        document.getElementById(`p${pIndex}-best-cards`).innerHTML = cardsHtml;
        const typeStr = `${best.L}张公约${best.G}`;
        document.getElementById(`p${pIndex}-status`).innerHTML = `牌型: <strong>${typeStr}</strong>`;
    }
    
    renderBest(1, p1Best);
    renderBest(2, p2Best);
    
    // Compare
    const comp = compareCombos(p1Best, p2Best);
    
    const p1Box = document.getElementById('player-1');
    const p2Box = document.getElementById('player-2');
    
    if (comp > 0) {
        resultBanner.textContent = '🏆 玩家 1 获胜！';
        p1Box.classList.add('winner');
        speak('玩家1获胜');
    } else if (comp < 0) {
        resultBanner.textContent = '🏆 玩家 2 获胜！';
        p2Box.classList.add('winner');
        speak('玩家2获胜');
    } else {
        resultBanner.textContent = '🤝 平局！';
        p1Box.classList.add('winner');
        p2Box.classList.add('winner');
        speak('平局');
    }
});

// ---------------- Equity Calculator Logic ----------------

const btnCalcEq = document.getElementById('btn-calc-eq');
const eqProgressContainer = document.getElementById('eq-progress-container');
const eqProgressFill = document.getElementById('eq-progress-fill');
const eqProgressText = document.getElementById('eq-progress-text');
const eqResult = document.getElementById('eq-result');
const eqPlayersContainer = document.getElementById('eq-players-container');

let equityWorker = null;

function parseCards(str, expectedLen = null) {
    if (!str.trim() && expectedLen !== null && expectedLen !== 0) return null;
    if (!str.trim() && (expectedLen === null || expectedLen === 0)) return [];
    
    const cards = str.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 2 && n <= 53);
    if (expectedLen !== null && cards.length !== expectedLen) return null;
    return cards;
}

btnCalcEq.addEventListener('click', () => {
    const p1Cards = parseCards(document.getElementById('eq-p1').value, 2);
    const p2Cards = parseCards(document.getElementById('eq-p2').value, 2);
    const commCards = parseCards(document.getElementById('eq-comm').value, null);

    if (!p1Cards || !p2Cards) {
        alert("请输入合法的玩家手牌 (正好2张，2-53)！");
        return;
    }
    if (commCards === null || commCards.length > 5) {
        alert("请输入合法的公共牌 (0-5张，2-53)！");
        return;
    }

    // 检查重复牌
    const allCards = [...p1Cards, ...p2Cards, ...commCards];
    if (new Set(allCards).size !== allCards.length) {
        alert("输入的牌中有重复，请检查！");
        return;
    }

    btnCalcEq.disabled = true;
    eqProgressContainer.style.display = 'block';
    eqProgressFill.style.width = '0%';
    eqProgressText.textContent = '0%';
    eqResult.style.display = 'none';

    if (equityWorker) equityWorker.terminate();
    equityWorker = new Worker('equityWorker.js', { type: 'module' });

    equityWorker.onmessage = function(e) {
        if (e.data.type === 'progress') {
            const p = e.data.progress.toFixed(1);
            eqProgressFill.style.width = p + '%';
            eqProgressText.textContent = `计算中... ${p}%`;
        } else if (e.data.type === 'done') {
            eqProgressFill.style.width = '100%';
            eqProgressText.textContent = '计算完成！';
            btnCalcEq.disabled = false;

            const res = e.data;
            eqResult.style.display = 'block';
            
            function renderOuts(outs) {
                if (outs.length === 0) return `<div style="color:#999; margin-top:8px;">无补牌</div>`;
                const cardsHtml = outs.map(val => `<div class="card mini">${val}</div>`).join('');
                return `<div style="margin-top: 8px;">补牌 (${outs.length}张):</div>
                        <div class="card-container mini-container" style="justify-content: flex-start; margin-top: 8px;">${cardsHtml}</div>`;
            }

            eqPlayersContainer.innerHTML = `
                <div class="player-box">
                    <h2>玩家 1</h2>
                    <div style="font-size: 28px; font-weight: bold; color: #3498db; text-align: center; margin: 16px 0;">
                        胜率: ${(res.p1Eq * 100).toFixed(2)}%
                    </div>
                    ${commCards.length >= 3 && commCards.length < 5 ? renderOuts(res.p1Outs) : ''}
                </div>
                <div class="player-box">
                    <h2>玩家 2</h2>
                    <div style="font-size: 28px; font-weight: bold; color: #e74c3c; text-align: center; margin: 16px 0;">
                        胜率: ${(res.p2Eq * 100).toFixed(2)}%
                    </div>
                    ${commCards.length >= 3 && commCards.length < 5 ? renderOuts(res.p2Outs) : ''}
                </div>
            `;
            
            // 语音播报
            speak(`计算完成。玩家1胜率 ${(res.p1Eq * 100).toFixed(2)}%，玩家2胜率 ${(res.p2Eq * 100).toFixed(2)}%。`);
        }
    };

    equityWorker.postMessage({
        p1: p1Cards,
        p2: p2Cards,
        comm: commCards
    });
});

// ---------------- GTO Solver Logic ----------------

const tabSim = document.getElementById('tab-sim');
const tabEquity = document.getElementById('tab-equity');
const tabGto = document.getElementById('tab-gto');

const viewSim = document.getElementById('view-sim');
const viewEquity = document.getElementById('view-equity');
const viewGto = document.getElementById('view-gto');

function switchTab(activeTab, activeView) {
    [tabSim, tabEquity, tabGto].forEach(t => t.classList.remove('active'));
    [viewSim, viewEquity, viewGto].forEach(v => v.style.display = 'none');
    
    activeTab.classList.add('active');
    activeView.style.display = 'block';
}

tabSim.addEventListener('click', () => switchTab(tabSim, viewSim));
tabEquity.addEventListener('click', () => switchTab(tabEquity, viewEquity));
tabGto.addEventListener('click', () => switchTab(tabGto, viewGto));

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

    const commCards = commStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 2 && n <= 53);
    
    if (commCards.length !== 5) {
        alert("请输入正好 5 张合法的公共牌 (2-53)！");
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
                    <td>${r.bestCombo.L + '张公约' + r.bestCombo.G}</td>
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
