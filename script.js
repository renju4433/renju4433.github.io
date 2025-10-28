// 当前选手数量
let playerCount = 4;

// 生成真实的比赛结果
function generateTrueResults() {
    const results = Array(playerCount).fill(null).map(() => Array(playerCount).fill(null));
    const scores = Array(playerCount).fill(0);
    
    // 生成随机比赛结果
    for (let i = 0; i < playerCount; i++) {
        for (let j = i + 1; j < playerCount; j++) {
            const winner = Math.random() < 0.5 ? i : j;
            if (winner === i) {
                results[i][j] = 1; // i胜j
                results[j][i] = 0; // j负i
                scores[i]++;
            } else {
                results[i][j] = 0; // i负j
                results[j][i] = 1; // j胜i
                scores[j]++;
            }
        }
    }
    
    return { results, scores };
}

// 初始化游戏状态
function initializeGameState() {
    return {
        trueResults: null,
        currentGuess: Array(playerCount).fill(null).map(() => Array(playerCount).fill(null)),
        excludedScores: Array(playerCount).fill(null).map(() => []), // 每个选手已排除的积分
        confirmedScores: Array(playerCount).fill(null), // 每个选手已确定的积分
        excludedCombinations: [], // 已排除的胜负组合
        correctPlayers: Array(playerCount).fill(false) // 完全正确的选手
    };
}

let gameState = initializeGameState();

// 初始化游戏
function initializeGame() {
    gameState.trueResults = generateTrueResults();
    createTable();
    console.log('真实结果:', gameState.trueResults); // 调试用
}

// 创建表格
function createTable() {
    const table = document.getElementById('matchTable');
    if (!table) {
        console.error('找不到matchTable元素');
        return;
    }
    
    // 清空表格
    table.innerHTML = '';
    
    // 创建表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // 空白单元格
    const emptyHeader = document.createElement('th');
    headerRow.appendChild(emptyHeader);
    
    // 选手列标题
    for (let j = 0; j < playerCount; j++) {
        const th = document.createElement('th');
        th.textContent = `${j + 1}号`;
        headerRow.appendChild(th);
    }
    
    // 积分列标题
    const scoreHeader = document.createElement('th');
    scoreHeader.textContent = '积分';
    headerRow.appendChild(scoreHeader);
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // 创建表体
    const tbody = document.createElement('tbody');
    tbody.id = 'tableBody';
    
    for (let i = 0; i < playerCount; i++) {
        const row = document.createElement('tr');
        
        // 行标题
        const headerCell = document.createElement('th');
        headerCell.textContent = `${i + 1}号`;
        row.appendChild(headerCell);
        
        // 对战结果单元格
        for (let j = 0; j < playerCount; j++) {
            const cell = document.createElement('td');
            
            if (i === j) {
                // 对角线单元格
                cell.className = 'diagonal-cell';
                cell.textContent = '-';
            } else {
                cell.className = 'match-cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.onclick = () => toggleCell(cell, i, j);
            }
            
            row.appendChild(cell);
        }
        
        // 积分单元格
        const scoreCell = document.createElement('td');
        scoreCell.className = 'score-cell';
        scoreCell.id = `score-${i}`;
        scoreCell.textContent = '-';
        row.appendChild(scoreCell);
        
        tbody.appendChild(row);
    }
    
    table.appendChild(tbody);
}

// 切换单元格状态
function toggleCell(cell, row, col) {
    if (gameState.correctPlayers[row]) {
        return; // 如果该选手已完全正确，不允许修改
    }
    
    if (cell.textContent === '') {
        cell.textContent = '1';
        cell.classList.add('filled');
        gameState.currentGuess[row][col] = 1;
        // 自动设置对应的对手结果
        gameState.currentGuess[col][row] = 0;
        updateOpponentCell(col, row, '0');
    } else if (cell.textContent === '1') {
        cell.textContent = '0';
        cell.classList.add('filled');
        gameState.currentGuess[row][col] = 0;
        // 自动设置对应的对手结果
        gameState.currentGuess[col][row] = 1;
        updateOpponentCell(col, row, '1');
    } else {
        cell.textContent = '';
        cell.classList.remove('filled');
        gameState.currentGuess[row][col] = null;
        // 清除对应的对手结果
        gameState.currentGuess[col][row] = null;
        updateOpponentCell(col, row, '');
    }
    
    updateScores();
}

// 更新对手单元格
function updateOpponentCell(row, col, value) {
    if (gameState.correctPlayers[row]) {
        return; // 如果该选手已完全正确，不允许修改
    }
    
    const opponentCell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (opponentCell) {
        opponentCell.textContent = value;
        if (value === '') {
            opponentCell.classList.remove('filled');
        } else {
            opponentCell.classList.add('filled');
        }
    }
}

// 计算当前积分
function calculateCurrentScores() {
    const scores = Array(playerCount).fill(0);
    
    for (let i = 0; i < playerCount; i++) {
        for (let j = 0; j < playerCount; j++) {
            if (i !== j && gameState.currentGuess[i][j] === 1) {
                scores[i]++;
            }
        }
    }
    
    return scores;
}

// 更新积分显示
function updateScores() {
    const scores = calculateCurrentScores();
    
    for (let i = 0; i < playerCount; i++) {
        const scoreCell = document.getElementById(`score-${i}`);
        
        // 计算该选手填写的对战数量
        let filledCount = 0;
        for (let j = 0; j < playerCount; j++) {
            if (i !== j && gameState.currentGuess[i][j] !== null) {
                filledCount++;
            }
        }
        
        let displayText = '';
        
        if (filledCount === playerCount - 1) {
            displayText = scores[i].toString();
            
            // 根据积分格子的颜色状态显示不同信息
            if (scoreCell.classList.contains('correct')) {
                // 绿色：显示战胜的对手
                const wins = getPlayerWins(i);
                if (wins.length > 0) {
                    displayText += '\n战胜: ' + wins.map(n => n + '号').join(', ');
                }
            } else if (scoreCell.classList.contains('present')) {
                // 黄色：显示已排除的胜选手组合
                const excludedWins = getExcludedWinCombinations(i);
                if (excludedWins.length > 0) {
                    displayText += '\n排除胜: ' + excludedWins.join(', ');
                }
            } else if (scoreCell.classList.contains('absent') && gameState.excludedScores[i].length > 0) {
                // 灰色：显示已排除的积分
                displayText += '\n排除分: ' + gameState.excludedScores[i].join(',');
            }
        } else {
            displayText = '-';
            // 只在没有填满时移除颜色状态
            if (!scoreCell.classList.contains('correct') && 
                !scoreCell.classList.contains('present') && 
                !scoreCell.classList.contains('absent')) {
                // 保持当前状态
            }
        }
        
        scoreCell.textContent = displayText;
    }
}

// 获取某选手已排除的胜选手组合
function getExcludedWinCombinations(playerIndex) {
    const excludedWins = [];
    const confirmedScore = gameState.confirmedScores[playerIndex];
    
    if (confirmedScore === null) return excludedWins;
    
    // 根据确定的积分，找出已排除的胜选手组合
    for (const combination of gameState.excludedCombinations) {
        // 解析组合字符串，提取该选手的胜负情况
        const playerPattern = new RegExp(`${playerIndex + 1}号: (.+?) \\|`);
        const match = combination.match(playerPattern);
        
        if (match) {
            const playerResults = match[1];
            // 计算该组合中该选手的积分
            let score = 0;
            const wins = [];
            
            // 解析vs结果
            const vsPattern = /vs(\d+)号(胜|负)/g;
            let vsMatch;
            while ((vsMatch = vsPattern.exec(playerResults)) !== null) {
                const opponent = parseInt(vsMatch[1]);
                const result = vsMatch[2];
                if (result === '胜') {
                    score++;
                    wins.push(opponent);
                }
            }
            
            // 如果积分匹配确定的积分，记录胜选手组合
            if (score === confirmedScore && wins.length > 0) {
                const winStr = wins.sort().join(',') + '号';
                if (!excludedWins.includes(winStr)) {
                    excludedWins.push(winStr);
                }
            }
        }
    }
    
    return excludedWins;
}

// 提交猜测
function makeGuess() {
    // 检查是否所有对战都已填写
    for (let i = 0; i < playerCount; i++) {
        for (let j = 0; j < playerCount; j++) {
            if (i !== j && gameState.currentGuess[i][j] === null) {
                alert('请填完所有对战结果！');
                return;
            }
        }
    }
    
    // 清除所有积分格子的颜色状态
    for (let i = 0; i < playerCount; i++) {
        const scoreCell = document.getElementById(`score-${i}`);
        scoreCell.classList.remove('correct', 'present', 'absent');
    }
    
    const currentScores = calculateCurrentScores();
    let allCorrect = true;
    
    // 检查每个选手的积分
    for (let i = 0; i < playerCount; i++) {
        const scoreCell = document.getElementById(`score-${i}`);
        const trueScore = gameState.trueResults.scores[i];
        const currentScore = currentScores[i];
        
        if (currentScore === trueScore) {
            // 检查该选手的所有对战是否都正确
            let playerAllCorrect = true;
            for (let j = 0; j < playerCount; j++) {
                if (i !== j && gameState.currentGuess[i][j] !== gameState.trueResults.results[i][j]) {
                    playerAllCorrect = false;
                    break;
                }
            }
            
            if (playerAllCorrect) {
                // 完全正确 - 绿色
                scoreCell.classList.add('correct');
                gameState.correctPlayers[i] = true;
                gameState.confirmedScores[i] = currentScore;
            } else {
                // 积分正确但对战有误 - 黄色
                scoreCell.classList.add('present');
                gameState.confirmedScores[i] = currentScore;
                allCorrect = false;
            }
        } else {
            // 积分错误 - 灰色
            scoreCell.classList.add('absent');
            if (!gameState.excludedScores[i].includes(currentScore)) {
                gameState.excludedScores[i].push(currentScore);
            }
            allCorrect = false;
        }
    }
    
    // 记录已排除的组合
    const combinationStr = formatCurrentCombination();
    if (!gameState.excludedCombinations.includes(combinationStr)) {
        gameState.excludedCombinations.push(combinationStr);
    }
    
    if (allCorrect) {
        setTimeout(() => {
            alert('🎉 恭喜你猜对了！所有选手的积分和对战结果都正确！');
        }, 500);
        return;
    }
    
    // 更新积分显示（包含排除信息）
    updateScores();
}

// 获取选手战胜的对手列表
function getPlayerWins(playerIndex) {
    const wins = [];
    for (let j = 0; j < playerCount; j++) {
        if (playerIndex !== j && gameState.trueResults.results[playerIndex][j] === 1) {
            wins.push(j + 1); // 转换为1-based编号
        }
    }
    return wins;
}



// 格式化当前组合
function formatCurrentCombination() {
    let result = '';
    for (let i = 0; i < playerCount; i++) {
        result += `${i + 1}号: `;
        for (let j = 0; j < playerCount; j++) {
            if (i !== j) {
                const vs = gameState.currentGuess[i][j] === 1 ? '胜' : '负';
                result += `vs${j + 1}号${vs} `;
            }
        }
        result += '| ';
    }
    return result;
}



// 重置游戏
function resetGame() {
    gameState = {
        trueResults: generateTrueResults(),
        currentGuess: Array(playerCount).fill(null).map(() => Array(playerCount).fill(null)),
        excludedScores: Array(playerCount).fill(null).map(() => []),
        confirmedScores: Array(playerCount).fill(null),
        excludedCombinations: [],
        correctPlayers: Array(playerCount).fill(false)
    };
    
    // 重新创建表格
    createTable();
    
    console.log('新的真实结果:', gameState.trueResults); // 调试用
}

// 初始化游戏
// 处理选手数量变更
function changePlayerCount() {
    const select = document.getElementById('playerCount');
    playerCount = parseInt(select.value);
    
    // 重新初始化游戏状态
    gameState = initializeGameState();
    gameState.trueResults = generateTrueResults();
    
    // 重新创建表格
    createTable();
    
    console.log(`游戏重置为${playerCount}人模式，新的真实结果:`, gameState.trueResults);
}

window.onload = initializeGame;