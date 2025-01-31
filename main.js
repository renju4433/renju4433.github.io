// Add this helper function to convert coordinates
function formatMove([row, col]) {
    const letters = 'ABCDEFGHIJKLMNO';
    return `${letters[col]}${15 - row}`;
}

function formatPath(path) {
    return path.map(move => formatMove(move)).join(' ');
}
class GomokuAI {
    constructor() {
        this.EMPTY = 0;
        this.BLACK = 1;
        this.WHITE = 2;
        this.BOARD_SIZE = 15;
        this.RENJU = true;
        // Pattern types
        this.PATTERN = {
            LONG: 9,
            WIN: 8,
            FLEX4: 7,
            FOURFOUR: 6.5,
            BLOCK4: 6,
            FLEX3: 5,
            BLOCK3: 4,
            FLEX2: 3,
            BLOCK2: 2,
            FLEX1: 1,
            NONE: 0
        };

        // Initialize board and pattern storage
        this.board = Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.EMPTY));
        this.patterns = {
            [this.BLACK]: {
                horizontal: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE)),
                vertical: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE)),
                diagonal1: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE)),
                diagonal2: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE))
            },
            [this.WHITE]: {
                horizontal: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE)),
                vertical: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE)),
                diagonal1: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE)),
                diagonal2: Array(this.BOARD_SIZE).fill().map(() => Array(this.BOARD_SIZE).fill(this.PATTERN.NONE))
            }
        };
        this.weights = {
            [this.PATTERN.WIN]: 10000 / 5,
            [this.PATTERN.FLEX4]: 1200 / 4,
            [this.PATTERN.BLOCK4]: 800 / 4,
            [this.PATTERN.FLEX3]: 144 / 3,
            [this.PATTERN.BLOCK3]: 96 / 3,
            [this.PATTERN.FLEX2]: 18 / 2,
            [this.PATTERN.BLOCK2]: 12 / 2,
            [this.PATTERN.FLEX1]: 2 / 1,
            [this.PATTERN.NONE]: 0,
        };
        // Initialize transposition table
        this.transpositionTable = new Map();

        // Store initial board hash
        this.zobristTable = this.initializeZobristTable();
        this.currentHash = 0n;
    }
    // Initialize Zobrist hashing table
    initializeZobristTable() {
        const table = Array(this.BOARD_SIZE).fill().map(() =>
            Array(this.BOARD_SIZE).fill().map(() => ({
                [this.BLACK]: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)),
                [this.WHITE]: BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
            }))
        );
        return table;
    }

    // Update hash when making a move
    updateHash(x, y, player) {
        this.currentHash ^= this.zobristTable[x][y][player];
    }

    // Store patterns in transposition table
    storePatterns() {
        // Deep copy current patterns
        const patternsCopy = JSON.stringify(this.patterns);
        this.transpositionTable.set(this.currentHash.toString(), patternsCopy);
    }

    // Retrieve patterns from transposition table
    retrievePatterns() {
        const hashKey = this.currentHash.toString();
        const storedPatterns = this.transpositionTable.get(hashKey);
        this.patterns = JSON.parse(storedPatterns);
    }
    // Get line of 11 points centered at (x, y) in specified direction
    getLine(x, y, direction) {
        const line = new Array(11).fill(this.EMPTY);
        const directions = {
            horizontal: [0, 1],
            vertical: [1, 0],
            diagonal1: [1, 1],
            diagonal2: [1, -1]
        };
        const [dx, dy] = directions[direction];

        for (let i = -5; i <= 5; i++) {
            const newX = x + dx * i;
            const newY = y + dy * i;
            if (this.isOnBoard(newX, newY)) {
                line[i + 5] = this.board[newX][newY];
            }
            else {
                line[i + 5] = -1;
            }
        }
        return line;
    }
    checkLine(line, who) {
        line[5] = who;
        for (let i = 3; i <= 5; i++) {
            if (line[i - 2] === who && line[i - 1] === 0 && line[i] === who && line[i + 1] === who && line[i + 2] === who && line[i + 3] === 0 && line[i + 4] === who) {
                if (!this.RENJU || who !== this.BLACK || (line[i - 3] !== this.BLACK && line[i + 5] !== this.BLACK)) return this.PATTERN.FOURFOUR;
            }
        }
        for (let i = 4; i <= 5; i++) {
            if (line[i - 3] === who && line[i - 2] === who && line[i - 1] === 0 && line[i] === who && line[i + 1] === who && line[i + 2] === 0 && line[i + 3] === who && line[i + 4] === who) {
                if (!this.RENJU || who !== this.BLACK || (line[i - 4] !== this.BLACK && line[i + 5] !== this.BLACK)) return this.PATTERN.FOURFOUR;
            }
        }
        if (line[1] === who && line[2] === who && line[3] === who && line[4] === 0 && line[5] === who && line[6] === 0 && line[7] === who && line[8] === who && line[9] === who) {
            if (!this.RENJU || who !== this.BLACK || (line[0] !== this.BLACK && line[10] !== this.BLACK)) return this.PATTERN.FOURFOUR;
        }
        if (this.RENJU && who === this.BLACK) {
            for (let i = 2; i <= 5; i++) {
                if (line[i - 1] !== 1 && line[i] === 1 && line[i + 1] === 1 && line[i + 2] === 1 && line[i + 3] === 1 && line[i + 4] !== 1) {
                    let block = 0;
                    if (line[i - 1] === 2 || line[i - 1] === -1 || line[i - 2] === 1) block++;
                    if (line[i + 4] === 2 || line[i + 4] === -1 || line[i + 5] === 1) block++;
                    if (block === 0) return this.PATTERN.FLEX4;
                    if (block === 1) return this.PATTERN.BLOCK4;
                    return this.PATTERN.NONE;
                }
                if (line[i - 1] !== 1 && line[i] === 1 && line[i + 1] === 1 && line[i + 2] === 0 && line[i + 3] === 1 && line[i + 4] !== 1) {
                    let block = 0;
                    if (line[i - 1] === 2 || line[i - 1] === -1 || line[i - 2] === 1) block++;
                    if (line[i + 4] === 2 || line[i + 4] === -1 || line[i + 5] === 1) block++;
                    if (block === 0) return this.PATTERN.FLEX3;
                    if (block === 1) return this.PATTERN.BLOCK3;
                    return this.PATTERN.NONE;
                }
                if (line[i - 1] !== 1 && line[i] === 1 && line[i + 1] === 0 && line[i + 2] === 1 && line[i + 3] === 1 && line[i + 4] !== 1) {
                    let block = 0;
                    if (line[i - 1] === 2 || line[i - 1] === -1 || line[i - 2] === 1) block++;
                    if (line[i + 4] === 2 || line[i + 4] === -1 || line[i + 5] === 1) block++;
                    if (block === 0) return this.PATTERN.FLEX3;
                    if (block === 1) return this.PATTERN.BLOCK3;
                    return this.PATTERN.NONE;
                }
            }
            for (let i = 3; i <= 5; i++) {
                if (line[i - 1] !== 1 && line[i] === 1 && line[i + 1] === 1 && line[i + 2] === 1 && line[i + 3] === 0 && line[i + 4] === 1 && line[i + 5] === 1) {
                    let block = 1;
                    if (line[i - 1] === 2 || line[i - 1] === -1 || line[i - 2] === 2 || line[i - 2] === -1 || line[i - 3] === 1) block++;
                    if (block === 1) return this.PATTERN.BLOCK3;
                    return this.PATTERN.NONE;
                }
                if (line[i - 3] === 1 && line[i - 2] === 1 && line[i - 1] === 0 && line[i] === 1 && line[i + 1] === 1 && line[i + 2] === 1 && line[i + 3] !== 1) {
                    let block = 1;
                    if (line[i + 3] === 2 || line[i + 3] === -1 || line[i + 4] === 2 || line[i + 4] === -1 || line[i + 5] === 1) block++;
                    if (block === 1) return this.PATTERN.BLOCK3;
                    return this.PATTERN.NONE;
                }
                if (line[i - 1] !== 1 && line[i] === 1 && line[i + 1] === 1 && line[i + 2] === 1 && line[i + 3] !== 1) {
                    if (!(line[i - 1] === 0 && line[i - 2] === 1) && !(line[i + 3] === 0 && line[i + 4] === 1)) {
                        let block = 0;
                        if (line[i - 1] === 2 || line[i - 1] === -1) block++;
                        if (line[i + 3] === 2 || line[i + 3] === -1) block++;
                        let block2 = 0;
                        if (line[i - 2] === 2 || line[i - 2] === -1 || line[i - 3] === 1) block2++;
                        if (line[i + 4] === 2 || line[i + 4] === -1 || line[i + 5] === 1) block2++;
                        if (block === 0 && block2 < 2) return this.PATTERN.FLEX3;
                        if (block === 0 && block2 === 2) return this.PATTERN.BLOCK3;
                        if (block === 1 && block2 === 0) return this.PATTERN.BLOCK3;
                        return this.PATTERN.NONE;
                    }
                }
            }
            for (let i = 4; i <= 5; i++) {
                if (line[i - 1] !== 1 && line[i] === 1 && line[i + 1] === 1 && line[i + 2] === 0 && line[i + 3] === 1 && line[i + 4] === 1 && line[i + 5] === 1) {
                    let block = 1;
                    if (line[i - 1] === 2 || line[i - 1] === -1 || line[i - 2] === 2 || line[i - 2] === -1 || line[i - 3] === 2 || line[i - 3] === -1 || line[i - 4] === 1) block++;
                    if (block === 1) return this.PATTERN.BLOCK2;
                    return this.PATTERN.NONE;
                }
                if (line[i - 4] === 1 && line[i - 3] === 1 && line[i - 2] === 1 && line[i - 1] === 0 && line[i] === 1 && line[i + 1] === 1 && line[i + 2] !== 1) {
                    let block = 1;
                    if (line[i + 2] === 2 || line[i + 2] === -1 || line[i + 3] === 2 || line[i + 3] === -1 || line[i + 4] === 2 || line[i + 4] === -1 || line[i + 5] === 1) block++;
                    if (block === 1) return this.PATTERN.BLOCK2;
                    return this.PATTERN.NONE;
                }
            }
            if (line[4] !== 1 && line[5] === 1 && line[6] === 0 && line[7] === 1 && line[8] === 1 && line[9] === 1 && line[10] === 1) {
                return this.PATTERN.NONE;
            }
            if (line[1] === 1 && line[2] === 1 && line[3] === 1 && line[4] === 0 && line[5] === 1 && line[6] !== 1) {
                return this.PATTERN.NONE;
            }
        }
        let kong = 0, block = 0;
        let len = 1, len2 = 1, count = 1;
        // Check right side
        for (let k = 6; k <= 10; k++) {
            if (line[k] === who) {
                if (kong + count > 4 && !(this.RENJU && kong === 0 && count === 5)) break;
                count++;
                len++;
                len2 = kong + count;
            } else if (line[k] === this.EMPTY) {
                len++;
                kong++;
            } else {
                if (line[k - 1] === who) block++;
                break;
            }
        }
        // Reset kong for left side check
        kong = len2 - count;

        // Check left side
        for (let k = 4; k >= 0; k--) {
            if (line[k] === who) {
                if (kong + count > 4 && !(this.RENJU && kong === 0 && count === 5)) break;
                count++;
                len++;
                len2 = kong + count;
            } else if (line[k] === this.EMPTY) {
                len++;
                kong++;
            } else {
                if (line[k + 1] === who) block++;
                break;
            }
        }
        return this.generatePattern(len, len2, count, block, who);
    }
    // Analyze pattern in a line (port of the ShortLine function)
    analyzeLine(line, who) {
        return Math.max(this.checkLine(line, who), this.checkLine(line.reverse(), who));
    }

    // Pattern classification (port of the GenerateAssist function)
    generatePattern(len, len2, count, block, who) {
        if (len >= 5 && count > 0) {
            if (this.RENJU && who === this.BLACK && count === 6) return this.PATTERN.LONG
            if (count >= 5) return this.PATTERN.WIN;
            if (len > 5 && len2 < 5 && block === 0) {
                switch (count) {
                    case 1: return this.PATTERN.FLEX1;
                    case 2: return this.PATTERN.FLEX2;
                    case 3: return this.PATTERN.FLEX3;
                    case 4: return this.PATTERN.FLEX4;
                }
            } else {
                switch (count) {
                    case 1: return this.PATTERN.NONE;
                    case 2: return this.PATTERN.BLOCK2;
                    case 3: return this.PATTERN.BLOCK3;
                    case 4: return this.PATTERN.BLOCK4;
                }
            }
        }
        return this.PATTERN.NONE;
    }

    // Update patterns after a move
    updatePatterns(x, y) {
        // Update horizontal pattern
        for (let i = Math.max(0, y - 5); i <= Math.min(this.BOARD_SIZE - 1, y + 5); i++) {
            const line = this.getLine(x, i, 'horizontal');
            this.patterns[this.BLACK].horizontal[x][i] = this.analyzeLine(line, this.BLACK);
            this.patterns[this.WHITE].horizontal[x][i] = this.analyzeLine(line, this.WHITE);
        }
        // Update vertical pattern
        for (let i = Math.max(0, x - 5); i <= Math.min(this.BOARD_SIZE - 1, x + 5); i++) {
            const line = this.getLine(i, y, 'vertical');
            this.patterns[this.BLACK].vertical[i][y] = this.analyzeLine(line, this.BLACK);
            this.patterns[this.WHITE].vertical[i][y] = this.analyzeLine(line, this.WHITE);
        }

        // Update diagonal patterns
        for (let i = -5; i <= 5; i++) {
            const dx = x + i;
            const dy = y + i;
            if (this.isOnBoard(dx, dy)) {
                const line = this.getLine(dx, dy, 'diagonal1');
                this.patterns[this.BLACK].diagonal1[dx][dy] = this.analyzeLine(line, this.BLACK);
                this.patterns[this.WHITE].diagonal1[dx][dy] = this.analyzeLine(line, this.WHITE);
            }

            const dy2 = y - i;
            if (this.isOnBoard(dx, dy2)) {
                const line = this.getLine(dx, dy2, 'diagonal2');
                this.patterns[this.BLACK].diagonal2[dx][dy2] = this.analyzeLine(line, this.BLACK);
                this.patterns[this.WHITE].diagonal2[dx][dy2] = this.analyzeLine(line, this.WHITE);
            }
        }
    }

    // Make a move
    makeMove(x, y, player) {
        if (!this.isOnBoard(x, y) || this.board[x][y] !== this.EMPTY) {
            return false;
        }
        this.board[x][y] = player;
        this.updateHash(x, y, player);
        this.updatePatterns(x, y);
        return true;
    }

    // Undo a move
    undoMove(x, y) {
        if (!this.isOnBoard(x, y)) {
            return false;
        }
        this.updateHash(x, y, this.board[x][y]);
        this.board[x][y] = this.EMPTY;
        this.updatePatterns(x, y);
        return true;
    }

    // Helper function to check if coordinates are within board
    isOnBoard(x, y) {
        return x >= 0 && x < this.BOARD_SIZE && y >= 0 && y < this.BOARD_SIZE;
    }

    // Evaluate position for a player
    evaluatePosition(player) {
        let score = 0;

        // Count patterns for the player
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] !== this.EMPTY) {
                    for (const direction of Object.values(this.patterns[this.board[i][j]])) {
                        const pattern = direction[i][j];
                        score += (this.board[i][j] === player ? 2 : -1) * this.weights[pattern];
                    }
                }
            }
        }
        return score;
    }
    getValidMoves(player) {
        const moves = [];
        let dis5 = [];
        let makeFlex4 = [];
        let make44 = [];
        let make4 = [];
        let dis4 = [];
        let disFlex4 = false;
        let fullMoves = [];
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] === this.EMPTY) {
                    let score = 0;
                    let ok = false;
                    let long = false;
                    let flexFour = false;
                    let four = 0;
                    let three = 0;
                    for (const direction of Object.values(this.patterns[player])) {
                        const pattern = direction[i][j];
                        if (pattern === this.PATTERN.LONG) long = true;
                        if (pattern === this.PATTERN.WIN) return [{ p: [i, j], s: 10000 }];
                        if (pattern === this.PATTERN.FLEX4) {
                            flexFour = true;
                            four++;
                        }
                        if (pattern === this.PATTERN.FOURFOUR) {
                            four += 2;
                        }
                        if (pattern === this.PATTERN.BLOCK4) four++;
                        if (pattern === this.PATTERN.FLEX3) three++;
                        score += 2 * this.weights[pattern];
                        if (pattern >= this.PATTERN.BLOCK2) ok = true;
                    }
                    let temp = false;
                    for (const direction of Object.values(this.patterns[3 - player])) {
                        const pattern = direction[i][j];
                        if (pattern === this.PATTERN.LONG) continue;
                        if (pattern === this.PATTERN.WIN) {
                            if (this.RENJU && player === this.BLACK && (four >= 2 || three >= 2 || long)) {
                                dis5.push({ p: [i, j], s: -1 });
                            } else {
                                dis5.push({ p: [i, j], s: 8500 });
                            }
                        }
                        if (pattern === this.PATTERN.FLEX4) {
                            temp = true;
                            disFlex4 = true;
                        }
                        if (pattern === this.PATTERN.BLOCK4) {
                            temp = true;
                        }
                        score += this.weights[pattern];
                        if (pattern >= this.PATTERN.FLEX2) ok = true;
                    }
                    if (this.RENJU && player === this.BLACK && (four >= 2 || three >= 2 || long)) continue;
                    fullMoves.push({ p: [i, j], s: 0 });
                    if (flexFour) makeFlex4.push({ p: [i, j], s: 8000 });
                    if (four >= 2) make44.push({ p: [i, j], s: 7500 });
                    if (temp) dis4.push({ p: [i, j], s: score });
                    if (four === 1) make4.push({ p: [i, j], s: score });
                    if (ok) moves.push({ p: [i, j], s: score });
                }
            }
        }
        if (fullMoves.length === this.BOARD_SIZE ** 2) return [{ p: [Math.floor(this.BOARD_SIZE / 2), Math.floor(this.BOARD_SIZE / 2)], s: 0 }];
        if (dis5.length > 1) return [{ p: dis5[0].p, s: 9000 }];
        if (dis5.length > 0) return [dis5[0]];
        if (makeFlex4.length > 0) return [makeFlex4[0]];
        if (make44.length > 0) return [make44[0]];
        if (disFlex4) return [...dis4, ...make4].sort((a, b) => b.s - a.s);
        if (moves.length === 0) return fullMoves;
        return moves.sort((a, b) => b.s - a.s);
    }

    // 使用negamax算法搜索最佳着法
    negamax(depth, alpha, beta, player, path = []) {
        // 基础情况：到达叶子节点
        if (depth <= 0) {
            const result = this.quiesce(6, alpha, beta, player, path);
            return {
                score: result.score,
                path: result.path
            };
        }
        // 让对手走一步,深度减少3
        const nullMoveResult = this.negamax(depth - 3, -beta, -beta + 1, 3 - player, path);
        const nullScore = -nullMoveResult.score;
        // 如果空着之后分数仍然很高,说明当前局面已经很好,可以直接返回beta截断
        if (nullScore >= beta) {
            return {
                score: beta,
                path: path
            };
        }
        let bestScore = -10000;
        let bestPath = [...path];
        const moves = this.getValidMoves(player);
        if (moves.length === 0) {
            return {
                score: 0,
                path: path
            };
        }
        let score;
        // 对每个可能的着法进行搜索
        for (const move of moves) {
            let x = move.p[0];
            let y = move.p[1];
            if (move.s === 10000) {
                return {
                    score: 10000 - path.length - 1,
                    path: [...path, [x, y]]
                };
            }
            if (move.s === 9000 || move.s === -1) {
                return {
                    score: -10000 + path.length + 2,
                    path: [...path, [x, y]]
                };
            }
            if (move.s === 7500 || move.s === 8000) {
                return {
                    score: 10000 - path.length - 3,
                    path: [...path, [x, y]]
                };
            }
            if (this.makeMove(x, y, player)) {
                // PVS搜索
                if (bestScore > -10000) {
                    // 第一个节点,使用完整窗口
                    const result = this.negamax(
                        depth - 1,
                        -beta,
                        -alpha,
                        3 - player,
                        [...path, [x, y]],
                    );
                    score = -result.score;
                    if (score > bestScore) {
                        bestPath = result.path;
                    }
                } else {
                    // 其他节点先进行零窗口搜索
                    const result = this.negamax(
                        depth - 1,
                        -alpha - 1,
                        -alpha,
                        3 - player,
                        [...path, [x, y]],
                    );
                    score = -result.score;

                    // 如果零窗口搜索失败,需要重新完整搜索
                    if (score > alpha && score < beta) {
                        const result = this.negamax(
                            depth - 1,
                            -beta,
                            -alpha,
                            3 - player,
                            [...path, [x, y]],
                        );
                        score = -result.score;
                        if (score > bestScore) {
                            bestPath = result.path;
                        }
                    }
                }

                this.undoMove(x, y);

                if (score > bestScore) {
                    bestScore = score;
                }

                alpha = Math.max(alpha, score);
                if (alpha >= beta) {
                    break;
                }
            }
        }

        return {
            score: bestScore,
            path: bestPath
        };
    }

    quiesce(depth, alpha, beta, player, path = []) {
        let score = this.evaluatePosition(player);
        // 基础情况：到达叶子节点
        if (depth <= 0 || score >= beta) {
            return {
                score: score,
                path: path
            };
        }

        let bestScore = score;
        alpha = Math.max(score, alpha);
        let bestPath = [...path];
        const moves = this.getValidMoves(player);
        if (moves.length === 0) {
            return {
                score: 0,
                path: path
            };
        }
        // 对每个可能的着法进行搜索
        for (const move of moves) {
            if (move.s < 2 * 800 / 4) {
                continue;
            }
            let x = move.p[0];
            let y = move.p[1];
            if (move.s === 10000) {
                return {
                    score: 10000 - path.length - 1,
                    path: [...path, [x, y]]
                };
            }
            if (move.s === 9000 || move.s === -1) {
                return {
                    score: -10000 + path.length + 2,
                    path: [...path, [x, y]]
                };
            }
            if (move.s === 7500 || move.s === 8000) {
                return {
                    score: 10000 - path.length - 3,
                    path: [...path, [x, y]]
                };
            }
            if (this.makeMove(x, y, player)) {
                const result = this.quiesce(
                    depth - 1,
                    -beta,
                    -alpha,
                    3 - player,
                    [...path, [x, y]]
                );

                this.undoMove(x, y);
                const score = -result.score;
                if (score > bestScore) {
                    bestScore = score;
                    bestPath = result.path;
                }
                alpha = Math.max(alpha, score);

                if (alpha >= beta) {
                    break;
                }
            }
        }

        return {
            score: bestScore,
            path: bestPath
        };
    }

    getBestMove(player, time) {
        let result;
        let t = new Date();
        const analysisBody = document.getElementById('analysisBody');

        // Clear previous analysis
        analysisBody.innerHTML = '';

        const updateAnalysis = (depth, score, path, timeSpent) => {
            return new Promise((resolve) => {
                // Create single row and reuse it
                if (!analysisBody.firstChild) {
                    const row = document.createElement('tr');
                    analysisBody.appendChild(row);
                }

                analysisBody.firstChild.innerHTML = `
                <td>${depth} 层</td>
                <td>${score} 分</td>
                <td>${formatPath(path)}</td>
                <td>${timeSpent} 毫秒</td>
            `;
                // Small delay to allow UI update
                setTimeout(resolve, 0);
            });
        };

        const iterativeDeepening = async () => {
            for (let depth = 1; new Date() - t <= time; depth++) {
                result = this.negamax(depth, -10000, 10000, player);
                const timeSpent = new Date() - t;
                await updateAnalysis(depth, result.score, result.path, timeSpent);
            }
            return result;
        };

        return iterativeDeepening().then(() => ({
            move: result.path[0],
            score: result.score,
            path: result.path
        }));
    }
}