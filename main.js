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
        this.highlights = {
            calculating: new Set(),
            best: new Set(),
            losing: new Set(),
            calculated: new Set() // Add new state for calculated moves
        };
        this.node = 0;
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
            FLEX3A: 5.5,
            FLEX3: 5,
            BLOCK3: 4,
            FLEX2B: 3.5,
            FLEX2A: 3.25,
            FLEX2: 3,
            BLOCK2: 2,
            FLEX1: 1,
            NONE: 0
        };
        // Add history table
        this.historyTable;
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
            [this.PATTERN.FLEX3A]: 144 / 3,
            [this.PATTERN.FLEX3]: 132 / 3,
            [this.PATTERN.BLOCK3]: 96 / 3,
            [this.PATTERN.FLEX2B]: 36 / 2,
            [this.PATTERN.FLEX2A]: 28 / 2,
            [this.PATTERN.FLEX2]: 20 / 2,
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
    // Add method to update history table
    updateHistory(x, y, player, depth) {
        this.historyTable[x][y][player] += depth ** 2;
    }
    // Add new methods for visualization
    addHighlight(x, y, type) {
        const cell = document.querySelector(`[data-row="${x}"][data-col="${y}"]`);
        if (!cell) return;

        // Remove any existing highlights of this type
        this.removeHighlight(x, y, type);

        // Add new highlight
        const highlight = document.createElement('div');
        highlight.className = `highlight ${type}`;
        cell.appendChild(highlight);
        this.highlights[type].add(`${x},${y}`);
    }

    removeHighlight(x, y, type) {
        const cell = document.querySelector(`[data-row="${x}"][data-col="${y}"]`);
        if (!cell) return;

        const highlight = cell.querySelector(`.highlight.${type}`);
        if (highlight) {
            highlight.remove();
            this.highlights[type].delete(`${x},${y}`);
        }
    }

    clearHighlights() {
        ['calculating', 'best', 'losing', 'calculated'].forEach(type => {
            Array.from(this.highlights[type]).forEach(coord => {
                const [x, y] = coord.split(',');
                this.removeHighlight(parseInt(x), parseInt(y), type);
            });
            this.highlights[type].clear();
        });
    }
    clearBest() {
        ['best'].forEach(type => {
            Array.from(this.highlights[type]).forEach(coord => {
                const [x, y] = coord.split(',');
                this.removeHighlight(parseInt(x), parseInt(y), type);
                this.addHighlight(parseInt(x), parseInt(y), 'calculated');
            });
            this.highlights[type].clear();
        });
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
                    if (block === 0) return this.PATTERN.FLEX3A;
                    if (block === 1) return this.PATTERN.BLOCK3;
                    return this.PATTERN.NONE;
                }
                if (line[i - 1] !== 1 && line[i] === 1 && line[i + 1] === 0 && line[i + 2] === 1 && line[i + 3] === 1 && line[i + 4] !== 1) {
                    let block = 0;
                    if (line[i - 1] === 2 || line[i - 1] === -1 || line[i - 2] === 1) block++;
                    if (line[i + 4] === 2 || line[i + 4] === -1 || line[i + 5] === 1) block++;
                    if (block === 0) return this.PATTERN.FLEX3A;
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
                    case 2: return this.PATTERN.FLEX2 + 0.5 - (len2 - 2) * 0.25;
                    case 3: return this.PATTERN.FLEX3 + 0.5 - (len2 - 3) * 0.5;
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
    evaluatePosition(player, pathlength) {
        let score = 0;
        let my4 = false;
        let myFlex3 = false;
        let opFlex4 = false;
        let opBlock4 = false;
        let opFlex3 = false;
        // Count patterns for the player
        for (let i = 0; i < this.BOARD_SIZE; i++) {
            for (let j = 0; j < this.BOARD_SIZE; j++) {
                if (this.board[i][j] !== this.EMPTY) {
                    let four = 0;
                    for (const direction of Object.values(this.patterns[this.board[i][j]])) {
                        const pattern = direction[i][j];
                        score += (this.board[i][j] === player ? 2 : -1) * this.weights[pattern];
                        if (this.board[i][j] === player) {
                            if (pattern === this.PATTERN.WIN) return 10000 - pathlength;
                            if (pattern === this.PATTERN.FLEX4 || pattern === this.PATTERN.BLOCK4 || pattern === this.PATTERN.FOURFOUR) my4 = true;
                            if (pattern === this.PATTERN.FLEX3 || pattern === this.PATTERN.FLEX3A) myFlex3 = true;
                        }
                        else {
                            if (pattern === this.PATTERN.WIN) return -10000 + pathlength;
                            if (pattern === this.PATTERN.FLEX4 || pattern === this.PATTERN.FOURFOUR) opFlex4 = true;
                            if (pattern === this.PATTERN.BLOCK4) {
                                opBlock4 = true;
                                four++;
                            }
                            // if (pattern === this.PATTERN.FLEX3 || pattern === this.PATTERN.FLEX3A) opFlex3 = true;
                        }
                    }
                    if (four >= 2) {
                        opFlex4 = true;
                    }
                }
            }
        }
        if (my4) return 9999 - pathlength;
        if (opFlex4) return -9998 + pathlength;
        if (myFlex3 && !opBlock4) return 9997 - pathlength;
        if (opBlock4 || opFlex3) return score - 1;
        return score;
    }
    getValidMoves(player) {
        const cnt2d = {
            0: 'horizontal',
            1: 'vertical',
            2: 'diagonal1',
            3: 'diagonal2',
        }
        const moves = [];
        let dis5 = [];
        let makeFlex4 = [];
        let make44 = [];
        let make4 = [];
        let dis4 = [];
        let disFlex4 = false;
        let zhuajin = false;
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
                    let attack = false;
                    for (const direction of Object.values(this.patterns[player])) {
                        const pattern = direction[i][j];
                        if (pattern === this.PATTERN.LONG) long = true;
                        if (pattern === this.PATTERN.WIN) return [{ p: [i, j], s: 0, attack: true }];
                        if (pattern === this.PATTERN.FLEX4) {
                            flexFour = true;
                            four++;
                        }
                        if (pattern === this.PATTERN.FOURFOUR) {
                            four += 2;
                        }
                        if (pattern === this.PATTERN.BLOCK4) {
                            four++;
                            attack = true;
                        }
                        if (pattern === this.PATTERN.FLEX3 || pattern === this.PATTERN.FLEX3A) {
                            three++;
                            // attack = true;
                        }
                        score += 2 * this.weights[pattern];
                        if (pattern >= this.PATTERN.FLEX2B) ok = true;
                    }
                    let temp = false;
                    let cnt = 0;

                    for (const direction of Object.values(this.patterns[3 - player])) {
                        const pattern = direction[i][j];
                        if (pattern === this.PATTERN.LONG) continue;
                        if (pattern === this.PATTERN.WIN) {
                            if (this.RENJU && player === this.BLACK && (four >= 2 || three >= 2 || long)) {
                                zhuajin = true;
                            } else {
                                dis5.push({ p: [i, j], s: 0, attack });
                            }
                        }
                        if (pattern === this.PATTERN.FLEX4) {
                            temp = true;
                            disFlex4 = true;
                        }
                        if (pattern === this.PATTERN.BLOCK4) {
                            if (this.isDis3(i, j, cnt2d[cnt], player)) {
                                temp = true;
                            }
                        }
                        score += this.weights[pattern];
                        if (pattern >= this.PATTERN.FLEX2A) ok = true;
                        cnt++;
                    }
                    score += this.historyTable[i][j][player] * 1000;
                    if (this.RENJU && player === this.BLACK && (four >= 2 || three >= 2 || long)) continue;
                    fullMoves.push({ p: [i, j], s: 0 });
                    if (flexFour) makeFlex4.push({ p: [i, j], s: 0 });
                    if (four >= 2) make44.push({ p: [i, j], s: 0 });
                    if (temp) dis4.push({ p: [i, j], s: score, attack });
                    if (four === 1) make4.push({ p: [i, j], s: score, attack });
                    if (ok) moves.push({ p: [i, j], s: score, attack });
                }
            }
        }
        if (fullMoves.length === this.BOARD_SIZE ** 2) return [{ p: [Math.floor(this.BOARD_SIZE / 2), Math.floor(this.BOARD_SIZE / 2)], s: 0, dis4: false, attack: false, dis5: false }];
        if (zhuajin) return [fullMoves[0]];
        if (dis5.length > 0) return [dis5[0]];
        if (makeFlex4.length > 0) return [makeFlex4[0]];
        if (make44.length > 0) return [make44[0]];
        if (disFlex4) return [...dis4, ...make4].sort((a, b) => b.s - a.s);
        if (moves.length === 0) return fullMoves;
        return moves.sort((a, b) => b.s - a.s);
    }
    isDis3(x, y, direction, player) {
        const directions = {
            horizontal: [0, 1],
            vertical: [1, 0],
            diagonal1: [1, 1],
            diagonal2: [1, -1]
        };
        if (this.isOnBoard(x + directions[direction][0], y + directions[direction][1]) &&
            (this.patterns[3 - player][direction][x + directions[direction][0]][y + directions[direction][1]] === this.PATTERN.FLEX3 ||
                this.patterns[3 - player][direction][x + directions[direction][0]][y + directions[direction][1]] === this.PATTERN.FLEX3A)) return true;
        if (this.isOnBoard(x - directions[direction][0], y - directions[direction][0]) &&
            (this.patterns[3 - player][direction][x - directions[direction][0]][y - directions[direction][1]] === this.PATTERN.FLEX3 ||
                this.patterns[3 - player][direction][x - directions[direction][0]][y - directions[direction][1]] === this.PATTERN.FLEX3A)) return true;
        if (this.isOnBoard(x + directions[direction][0] * 6, y + directions[direction][1] * 6)) {
            if (this.patterns[3 - player][direction][x + directions[direction][0] * 2][y + directions[direction][1] * 2] === this.PATTERN.FLEX3A &&
                this.board[x + directions[direction][0] * 6][y + directions[direction][1] * 6] === player) return true;
        }
        if (this.isOnBoard(x - directions[direction][0] * 6, y - directions[direction][1] * 6)) {
            if (this.patterns[3 - player][direction][x - directions[direction][0] * 2][y - directions[direction][1] * 2] === this.PATTERN.FLEX3A &&
                this.board[x - directions[direction][0] * 6][y - directions[direction][1] * 6] === player) return true;
        }
        return false;
    }
    // Modify negamax to include visualization
    async negamax(depth, alpha, beta, player, killDepth, isNullMove, path = []) {

        const result = await this.quiesce(killDepth, alpha, beta, player, true, path);
        if (depth <= 0 || result.score + path.length === 10000 || result.score - path.length === -10000) {
            return {
                score: result.score,
                path: result.path
            };
        }

        const nullMoveResult = await this.negamax(depth - 3, -beta, -beta + 1, 3 - player, killDepth, true, path);
        const nullScore = -nullMoveResult.score;
        if (nullScore >= beta) {
            return {
                score: beta,
                path: path
            };
        }

        let bestScore = -10000;
        let bestPath = [...path];
        let bestMove = null;
        let newDepth = this.isChong(result.score) ? depth : depth - 1;
        const moves = this.getValidMoves(player);

        for (const move of moves) {
            const [x, y] = move.p;

            // Add calculating highlight
            if (path.length === 0 && !isNullMove) {
                this.addHighlight(x, y, 'calculating');
            }

            this.makeMove(x, y, player);
            let score;
            if (bestScore > -10000) {
                const result = await this.negamax(newDepth, -beta, -alpha, 3 - player, killDepth, false, [...path, [x, y]]);
                score = -result.score;
                if (score > bestScore) {
                    bestPath = result.path;
                    if (path.length === 0 && !isNullMove) {
                        this.clearBest();
                        if (score > -9000) this.addHighlight(x, y, 'best');
                    }
                }
            } else {
                const result = await this.negamax(newDepth, -alpha - 1, -alpha, 3 - player, killDepth, false, [...path, [x, y]]);
                score = -result.score;

                if (score > alpha && score < beta) {
                    const result = await this.negamax(newDepth, -beta, -alpha, 3 - player, killDepth, false, [...path, [x, y]]);
                    score = -result.score;
                    if (score > bestScore) {
                        bestPath = result.path;
                        if (path.length === 0 && !isNullMove) {
                            this.clearBest();
                            if (score > -9000) this.addHighlight(x, y, 'best');
                        }
                    }
                }
            }

            this.undoMove(x, y);
            if (path.length === 0 && !isNullMove) {
                if (score <= -9000) {
                    this.removeHighlight(x, y, 'calculating');
                    this.addHighlight(x, y, 'losing');
                }
                else {
                    this.removeHighlight(x, y, 'calculating');
                    this.addHighlight(x, y, 'calculated');
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = [x, y];
                if (path.length === 0 && !isNullMove) {
                    this.clearBest();
                    if (score > -9000) this.addHighlight(x, y, 'best');
                }
            }

            alpha = Math.max(alpha, score);
            if (alpha >= beta) {
                break;
            }
        }
        if (bestMove) {
            const [bx, by] = bestMove;
            this.updateHistory(bx, by, 3 - player, depth);
        }
        return {
            score: bestScore,
            path: bestPath
        };
    }

    isChong(score) {
        return score % 2 !== 0 && score <= 9000 && score >= -9000;
    }
    async quiesce(depth, alpha, beta, player, isAttack, path = []) {
        let score = this.evaluatePosition(player, path.length);
        this.node++;
        if (this.node % 1000 === 0) await new Promise(resolve => setTimeout(resolve, 0)); // Small delay for visualization
        // 基础情况：到达叶子节点
        if (depth <= 0 && !this.isChong(score)) {
            return {
                score: score,
                path: path
            };
        }
        let bestScore = -10000;
        if (!this.isChong(score)) {
            if (score >= beta) {
                return {
                    score: score,
                    path: path
                };
            }
            bestScore = score;
            alpha = Math.max(score, alpha);
        }
        let bestPath = [...path];
        const moves = this.getValidMoves(player);
        // 对每个可能的着法进行搜索
        for (const move of moves) {
            if (!this.isChong(score)) {
                if (!move.attack) continue;
            }
            let x = move.p[0];
            let y = move.p[1];
            this.makeMove(x, y, player)
            const result = await this.quiesce(
                depth - 1,
                -beta,
                -alpha,
                3 - player,
                !isAttack,
                [...path, [x, y]]
            );
            this.undoMove(x, y);
            score = -result.score;
            if (score > bestScore) {
                bestScore = score;
                bestPath = result.path;
            }
            alpha = Math.max(alpha, score);

            if (alpha >= beta) {
                break;
            }
        }
        return {
            score: bestScore,
            path: bestPath
        };
    }
    async getBestMove(player, time) {

        let result;
        let t = new Date();
        const analysisBody = document.getElementById('analysisBody');
        analysisBody.innerHTML = '';

        const updateAnalysis = (depth, killDepth, score, path, timeSpent) => {
            return new Promise((resolve) => {
                if (!analysisBody.firstChild) {
                    const row = document.createElement('tr');
                    analysisBody.appendChild(row);
                }

                analysisBody.firstChild.innerHTML = `
                    <td>${depth}-${killDepth} 层</td>
                    <td>${score} 分</td>
                    <td>${formatPath(path)}</td>
                    <td>${timeSpent} 毫秒</td>
                `;
                setTimeout(resolve, 0);
            });
        };

        const iterativeDeepening = async () => {
            // Add history table
            this.historyTable = Array(this.BOARD_SIZE).fill().map(() =>
                Array(this.BOARD_SIZE).fill().map(() => ({
                    [this.BLACK]: 0,
                    [this.WHITE]: 0
                }))
            );
            for (let depth = 1; new Date() - t <= time; depth++) {
                // Clear all previous highlights
                this.clearHighlights();
                let killDepth = 6;
                result = await this.negamax(depth, -10000, 10000, player, killDepth);
                const timeSpent = new Date() - t;
                await updateAnalysis(depth, killDepth, result.score, result.path, timeSpent);
            }
            // Clear all previous highlights
            this.clearHighlights();
            return result;
        };
        return iterativeDeepening().then(() => ({
            move: result.path[0],
            score: result.score,
            path: result.path
        }));
    }
}