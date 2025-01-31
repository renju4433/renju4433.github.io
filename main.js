class GomokuAI {
    constructor() {
        this.EMPTY = 0;
        this.BLACK = 1;
        this.WHITE = 2;
        this.BOARD_SIZE = 9;

        // Pattern types
        this.PATTERN = {
            WIN: 6,
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
            [this.PATTERN.WIN]: 576 / 4,
            [this.PATTERN.FLEX3]: 144 / 3,
            [this.PATTERN.BLOCK3]: 48 / 3,
            [this.PATTERN.FLEX2]: 12 / 2,
            [this.PATTERN.BLOCK2]: 4 / 2,
            [this.PATTERN.FLEX1]: 1 / 1,
            [this.PATTERN.NONE]: 0,
        };
    }

    // Get line of 9 points centered at (x, y) in specified direction
    getLine(x, y, direction) {
        const line = new Array(9).fill(this.EMPTY);
        const directions = {
            horizontal: [0, 1],
            vertical: [1, 0],
            diagonal1: [1, 1],
            diagonal2: [1, -1]
        };
        const [dx, dy] = directions[direction];

        for (let i = -4; i <= 4; i++) {
            const newX = x + dx * i;
            const newY = y + dy * i;
            if (this.isOnBoard(newX, newY)) {
                line[i + 4] = this.board[newX][newY];
            }
            else {
                line[i + 4] = -1;
            }
        }
        return line;
    }
    checkLine(line, who) {
        let kong = 0, block = 0;
        let len = 1, len2 = 1, count = 1;
        // Check right side
        for (let k = 5; k <= 8; k++) {
            if (line[k] === who) {
                if (kong + count > 3) break;
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
        for (let k = 3; k >= 0; k--) {
            if (line[k] === who) {
                if (kong + count > 3) break;
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
        if (len >= 4 && count > 0) {
            if (count >= 4) return this.PATTERN.WIN;
            if (len > 4 && len2 < 4 && block === 0) {
                switch (count) {
                    case 1: return this.PATTERN.FLEX1;
                    case 2: return this.PATTERN.FLEX2;
                    case 3: return this.PATTERN.FLEX3;
                }
            } else {
                switch (count) {
                    case 1: return this.PATTERN.NONE;
                    case 2: return this.PATTERN.BLOCK2;
                    case 3: return this.PATTERN.BLOCK3;
                }
            }
        }
        return this.PATTERN.NONE;
    }

    // Update patterns after a move
    updatePatterns(x, y) {
        // Update horizontal pattern
        for (let i = Math.max(0, y - 4); i <= Math.min(this.BOARD_SIZE - 1, y + 4); i++) {
            const line = this.getLine(x, i, 'horizontal');
            this.patterns[this.BLACK].horizontal[x][i] = this.analyzeLine(line, this.BLACK);
            this.patterns[this.WHITE].horizontal[x][i] = this.analyzeLine(line, this.WHITE);
        }
        // Update vertical pattern
        for (let i = Math.max(0, x - 4); i <= Math.min(this.BOARD_SIZE - 1, x + 4); i++) {
            const line = this.getLine(i, y, 'vertical');
            this.patterns[this.BLACK].vertical[i][y] = this.analyzeLine(line, this.BLACK);
            this.patterns[this.WHITE].vertical[i][y] = this.analyzeLine(line, this.WHITE);
        }

        // Update diagonal patterns
        for (let i = -4; i <= 4; i++) {
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
        this.updatePatterns(x, y);
        return true;
    }

    // Undo a move
    undoMove(x, y) {
        if (!this.isOnBoard(x, y)) {
            return false;
        }
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
        let myWin = 0;
        let opWin = 0;
        // Count patterns for the player
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] !== this.EMPTY) {
                    for (const direction of Object.values(this.patterns[this.board[i][j]])) {
                        const pattern = direction[i][j];
                        if (pattern === this.PATTERN.WIN) score += (this.board[i][j] === player ? 1 : -1) * this.weights[pattern];
                        else score += (this.board[i][j] === player ? 2 : -1) * this.weights[pattern];
                        if (this.board[i][j] === player) {
                            if (pattern === this.PATTERN.WIN) myWin++;
                        } else {
                            if (pattern === this.PATTERN.WIN) opWin++;
                        }
                    }
                }
            }
        }
        if (myWin - opWin >= 8) return 10000;
        if (myWin - opWin <= -8) return -10000;
        return score;
    }
    getValidMoves(player) {
        const moves = [];
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] === this.EMPTY) {
                    let score = 0;
                    let ok = false;
                    for (const direction of Object.values(this.patterns[player])) {
                        const pattern = direction[i][j];
                        score += 2 * this.weights[pattern];
                        if (pattern >= this.PATTERN.BLOCK2) ok = true;
                    }
                    for (const direction of Object.values(this.patterns[3 - player])) {
                        const pattern = direction[i][j];
                        score += this.weights[pattern];
                        if (pattern >= this.PATTERN.FLEX2) ok = true;
                    }
                    if (ok) moves.push({ p: [i, j], s: score });
                }
            }
        }
        return moves.sort((a, b) => b.s - a.s);
    }

    // 使用negamax算法搜索最佳着法
    negamax(depth, alpha, beta, player, path = []) {
        const result = this.quiesce(0, alpha, beta, player, path);
        // 基础情况：到达叶子节点
        if (depth <= 0 || result.score <= -9000 || result.score >= 9000) {
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
        let score;
        // 对每个可能的着法进行搜索
        for (const move of moves) {
            let x = move.p[0];
            let y = move.p[1];
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
        if (score === 10000) {
            return {
                score: 10000 - path.length,
                path: path
            };
        }
        if (score === -10000) {
            return {
                score: -10000 + path.length,
                path: path
            };
        }
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

    // 获取最佳着法
    getBestMove(player, time) {
        let result;
        let t = new Date();
        for (let depth = 1; new Date() - t <= time; depth++) {
            result = this.negamax(
                depth,
                -10000,
                10000,
                player
            );
            console.log("深度", depth, "分数", result.score, "路线", JSON.stringify(result.path), "时间", new Date() - t);
        }

        return {
            move: result.path[0],
            score: result.score,
            path: result.path
        };
    }
}