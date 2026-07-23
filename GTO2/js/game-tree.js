class TerminalNode {
    constructor(pot, p1Invested, p2Invested, foldedPlayer, board) {
        this.type = 'TERMINAL';
        this.pot = pot;
        this.p1Invested = p1Invested;
        this.p2Invested = p2Invested;
        this.foldedPlayer = foldedPlayer;
        this.board = board;
        
        // 预计算收益矩阵，大幅提升后续 CFR 迭代速度
        this.matrix1 = new Float64Array(169);
        this.matrix2 = new Float64Array(169);
        let counts = getCounts(board);
        
        for (let x = 0; x < 13; x++) {
            for (let y = 0; y < 13; y++) {
                let w = (x === y) ? counts[x] * (counts[x] - 1) : counts[x] * counts[y];
                if (w === 0) continue;
                
                let idx = x * 13 + y;
                if (foldedPlayer === 1) {
                    this.matrix1[idx] = w * p2Invested;
                    this.matrix2[idx] = -w * p2Invested;
                } else if (foldedPlayer === 0) {
                    this.matrix1[idx] = -w * p1Invested;
                    this.matrix2[idx] = w * p1Invested;
                } else {
                    let res = compareHands(RANKS[x], RANKS[y], board);
                    if (res === 1) {
                        this.matrix1[idx] = w * p2Invested;
                        this.matrix2[idx] = -w * p2Invested;
                    } else if (res === -1) {
                        this.matrix1[idx] = -w * p1Invested;
                        this.matrix2[idx] = w * p1Invested;
                    }
                }
            }
        }
    }
}

class ActionNode {
    constructor(player, board, history, pot, p1Stack, p2Stack) {
        this.type = 'ACTION';
        this.player = player;
        this.board = board;
        this.history = history;
        this.pot = pot;
        this.p1Stack = p1Stack;
        this.p2Stack = p2Stack;
        this.children = {};
        this.regretSum = null;
        this.strategySum = null;
        this.ev1 = null; // Expected Value for Player 1 (OOP)
        this.ev2 = null; // Expected Value for Player 2 (IP)
    }
}

class ChanceNode {
    constructor(board, history, pot, p1Stack, p2Stack, street) {
        this.type = 'CHANCE';
        this.board = board;
        this.history = history;
        this.pot = pot;
        this.p1Stack = p1Stack;
        this.p2Stack = p2Stack;
        this.street = street;
        this.children = {};
    }
}

class GameTreeBuilder {
    constructor(params) {
        this.betSizes = params.betSizes || [100];
        this.raiseSizes = params.raiseSizes || [3];
        this.maxRaises = 2;
    }

    build(board, startingPot, effStack) {
        let street = board.length;
        return this.buildBetting(board, '', startingPot, effStack, effStack, 0, 0, 0, street, 0);
    }

    buildChance(board, history, pot, p1Stack, p2Stack, street) {
        let node = new ChanceNode(board, history, pot, p1Stack, p2Stack, street);
        let counts = getCounts(board);
        for (let i = 0; i < 13; i++) {
            if (counts[i] > 0) {
                let r = RANKS[i];
                let newBoard = [...board, r];
                node.children[r] = this.buildBetting(newBoard, history, pot, p1Stack, p2Stack, 0, 0, 0, street, 0);
            }
        }
        return node;
    }

    buildBetting(board, history, pot, p1Stack, p2Stack, p1Commit, p2Commit, raises, street, currentPlayer) {
        let node = new ActionNode(currentPlayer, board, history, pot, p1Stack, p2Stack);
        let amountToCall = currentPlayer === 0 ? p2Commit - p1Commit : p1Commit - p2Commit;
        
        if (amountToCall > 0) {
            node.children['Fold'] = new TerminalNode(pot, p1Commit, p2Commit, currentPlayer, board);
        }
        
        let nextP1Commit = currentPlayer === 0 ? p1Commit + amountToCall : p1Commit;
        let nextP2Commit = currentPlayer === 1 ? p2Commit + amountToCall : p2Commit;
        let nextP1Stack = currentPlayer === 0 ? p1Stack - amountToCall : p1Stack;
        let nextP2Stack = currentPlayer === 1 ? p2Stack - amountToCall : p2Stack;
        let nextPot = pot + amountToCall;
        
        let isClosingAction = false;
        if (amountToCall > 0) isClosingAction = true;
        if (amountToCall === 0 && history.endsWith('X')) isClosingAction = true;
        if (amountToCall === 0 && currentPlayer === 1 && history === '') isClosingAction = true;
        
        let callHistory = history + (amountToCall > 0 ? 'C' : 'X');
        
        if (isClosingAction) {
            if (nextP1Stack === 0 || nextP2Stack === 0 || street === 2) {
                node.children[amountToCall > 0 ? 'Call' : 'Check'] = new TerminalNode(nextPot, nextP1Commit, nextP2Commit, -1, board);
            } else {
                node.children[amountToCall > 0 ? 'Call' : 'Check'] = this.buildChance(board, callHistory + '/', nextPot, nextP1Stack, nextP2Stack, street + 1);
            }
        } else {
            node.children['Check'] = this.buildBetting(board, callHistory, nextPot, nextP1Stack, nextP2Stack, nextP1Commit, nextP2Commit, raises, street, 1 - currentPlayer);
        }
        
        if (raises < this.maxRaises && nextP1Stack > 0 && nextP2Stack > 0) {
            let sizes = amountToCall === 0 ? this.betSizes : this.raiseSizes;
            for (let size of sizes) {
                let betAmount = 0;
                let maxPossible = currentPlayer === 0 ? nextP1Stack : nextP2Stack;
                let isAllIn = false;

                if (size === 'a') {
                    betAmount = maxPossible;
                    isAllIn = true;
                } else {
                    if (amountToCall === 0) {
                        betAmount = Math.floor(nextPot * (size / 100));
                    } else {
                        betAmount = Math.floor(amountToCall * size);
                    }
                    if (betAmount > maxPossible) betAmount = maxPossible;
                    if (betAmount === maxPossible) isAllIn = true;
                }
                
                if (betAmount < 1) betAmount = 1;
                
                let actionName = amountToCall === 0 ? `Bet ${betAmount}` : `Raise ${betAmount}`;
                if (isAllIn) actionName = amountToCall === 0 ? `Bet All-in` : `Raise All-in`;
                
                let b_nextP1Commit = currentPlayer === 0 ? nextP1Commit + betAmount : nextP1Commit;
                let b_nextP2Commit = currentPlayer === 1 ? nextP2Commit + betAmount : nextP2Commit;
                let b_nextP1Stack = currentPlayer === 0 ? nextP1Stack - betAmount : nextP1Stack;
                let b_nextP2Stack = currentPlayer === 1 ? nextP2Stack - betAmount : nextP2Stack;
                let b_nextPot = nextPot + betAmount;
                
                let b_history = history + (amountToCall === 0 ? `B${betAmount}` : `R${betAmount}`);
                if (isAllIn) b_history = history + (amountToCall === 0 ? `BA` : `RA`);
                
                node.children[actionName] = this.buildBetting(board, b_history, b_nextPot, b_nextP1Stack, b_nextP2Stack, b_nextP1Commit, b_nextP2Commit, raises + 1, street, 1 - currentPlayer);
                
                if (isAllIn) break;
            }
        }
        
        return node;
    }
}