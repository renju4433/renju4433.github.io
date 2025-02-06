var BOARD_SIZE = 15;
var NULL = 0;
var BLACK = 1;
var WHITE = 2;
var dx = [0, 1, 1, 1];
var dy = [1, 0, 1, -1];
function formatMove([row, col]) {
    let letters = 'ABCDEFGHIJKLMNO';
    return `${letters[col]}${15 - row}`;
}

function formatPath(path) {
    return path.map(move => formatMove(move)).join(' ');
}
class Gomoku {
    constructor() {
        this.PATTERN = {
            WIN: 8,
            FLEX4: 7,
            BLOCK44: 6,
            BLOCK4: 5,
            FLEX3: 4,
            BLOCK3: 3,
            FLEX2: 2,
            BLOCK2: 1,
            NONE: 0
        };

        this.weightsMy = {
            [this.PATTERN.WIN]: 0 / 5,
            [this.PATTERN.FLEX4]: 100 / 4,
            [this.PATTERN.BLOCK44]: 100 / 4,
            [this.PATTERN.BLOCK4]: 32 / 4,
            [this.PATTERN.FLEX3]: 27 / 3,
            [this.PATTERN.BLOCK3]: 18 / 3,
            [this.PATTERN.FLEX2]: 10 / 2,
            [this.PATTERN.BLOCK2]: 4 / 2,
            [this.PATTERN.NONE]: 0,
        };

        this.weightsOp = {
            [this.PATTERN.WIN]: 500 / 5,
            [this.PATTERN.FLEX4]: 52 / 4,
            [this.PATTERN.BLOCK44]: 52 / 4,
            [this.PATTERN.BLOCK4]: 20 / 4,
            [this.PATTERN.FLEX3]: 18 / 3,
            [this.PATTERN.BLOCK3]: 15 / 3,
            [this.PATTERN.FLEX2]: 6 / 2,
            [this.PATTERN.BLOCK2]: 2 / 2,
            [this.PATTERN.NONE]: 0,
        };
        this.board = Array(BOARD_SIZE).fill().map(() =>
            Array(BOARD_SIZE).fill(NULL)
        );
        this.pattern = Array(4).fill().map(() =>
            Array(BOARD_SIZE).fill().map(() => (Array(BOARD_SIZE).fill(this.PATTERN.NONE))));
        this.patternw = Array(4).fill().map(() =>
            Array(BOARD_SIZE).fill().map(() => (Array(BOARD_SIZE).fill(this.PATTERN.NONE))));
        this.near = Array(4).fill().map(() =>
            Array(BOARD_SIZE).fill().map(() => (Array(BOARD_SIZE).fill(false))));
        this.historyPattern = [JSON.stringify(this.pattern)];
        this.historyPatternw = [JSON.stringify(this.patternw)];
        this.highlights = {
            calculating: new Set(),
            best: new Set(),
            losing: new Set(),
            calculated: new Set()
        };
    }
    // Add new methods for visualization
    addHighlight(x, y, type) {
        let cell = document.querySelector(`[data-row="${x}"][data-col="${y}"]`);
        if (!cell) return;

        // Remove any existing highlights of this type
        this.removeHighlight(x, y, type);

        // Add new highlight
        let highlight = document.createElement('div');
        highlight.className = `highlight ${type}`;
        cell.appendChild(highlight);
        this.highlights[type].add(`${x},${y}`);
    }

    removeHighlight(x, y, type) {
        let cell = document.querySelector(`[data-row="${x}"][data-col="${y}"]`);
        if (!cell) return;

        let highlight = cell.querySelector(`.highlight.${type}`);
        if (highlight) {
            highlight.remove();
            this.highlights[type].delete(`${x},${y}`);
        }
    }

    clearHighlights() {
        ['calculating', 'best', 'losing', 'calculated'].forEach(type => {
            Array.from(this.highlights[type]).forEach(coord => {
                let [x, y] = coord.split(',');
                this.removeHighlight(parseInt(x), parseInt(y), type);
            });
            this.highlights[type].clear();
        });
    }
    clearBest() {
        ['best'].forEach(type => {
            Array.from(this.highlights[type]).forEach(coord => {
                let [x, y] = coord.split(',');
                this.removeHighlight(parseInt(x), parseInt(y), type);
                this.addHighlight(parseInt(x), parseInt(y), 'calculated');
            });
            this.highlights[type].clear();
        });
    }
    inBoard(x, y) {
        return 0 <= x && x < BOARD_SIZE && 0 <= y && y < BOARD_SIZE;
    }

    isNull(x, y) {
        return this.inBoard(x, y) && this.board[x][y] == NULL;
    }

    isBlack(x, y) {
        return this.inBoard(x, y) && this.board[x][y] == BLACK;
    }
    isWhite(x, y) {
        return this.inBoard(x, y) && this.board[x][y] == WHITE;
    }
    makeMove(x, y, playerColor) {
        this.board[x][y] = playerColor;
        this.updateNear(x, y);
        if (playerColor == NULL) {
            this.historyPattern.pop();
            this.historyPatternw.pop();
            this.pattern = JSON.parse(this.historyPattern[this.historyPattern.length - 1]);
            this.patternw = JSON.parse(this.historyPatternw[this.historyPatternw.length - 1]);
        } else {
            this.map = Array(4).fill().map(() =>
                Array(BOARD_SIZE).fill().map(() => (Array(BOARD_SIZE).fill(false))));
            this.updatePatterns(x, y);
            this.historyPattern.push(JSON.stringify(this.pattern));
            this.historyPatternw.push(JSON.stringify(this.patternw));
        }
    }
    // Update patterns after a move
    updateNear(x, y) {
        // Update horizontal pattern
        for (let i = Math.max(0, y - 3); i <= Math.min(BOARD_SIZE - 1, y + 3); i++) {
            this.near[0][x][i] = this.hasNearbyPieces(x, i, 0);
        }
        // Update vertical pattern
        for (let i = Math.max(0, x - 3); i <= Math.min(BOARD_SIZE - 1, x + 3); i++) {
            this.near[1][i][y] = this.hasNearbyPieces(i, y, 1);
        }

        // Update diagonal patterns
        for (let i = -3; i <= 3; i++) {
            let dx = x + i;
            let dy = y + i;
            if (this.inBoard(dx, dy)) {
                this.near[2][dx][dy] = this.hasNearbyPieces(dx, dy, 2);
            }

            let dy2 = y - i;
            if (this.inBoard(dx, dy2)) {
                this.near[3][dx][dy2] = this.hasNearbyPieces(dx, dy2, 3);
            }
        }
    }
    hasChange(x, y, X, Y) {
        var o = this.board[x][y];
        var o1 = this.checkForbiddenMove(X, Y);
        this.board[x][y] = NULL;
        var o2 = this.checkForbiddenMove(X, Y);
        this.board[x][y] = o;
        if (o1 == o2) return false;
        return true;
    }
    updatePatterns(x, y, depth = 0) {
        // Update horizontal pattern
        for (let i = Math.max(0, y - 5); i <= Math.min(BOARD_SIZE - 1, y + 5); i++) {
            if (!this.map[0][x][i]) {
                this.map[0][x][i] = true;
                if (this.board[x][i] == BLACK && depth <= 1) this.pattern[0][x][i] = this.countPatterns(x, i, 0);
                else if (this.board[x][i] == WHITE && depth == 0) this.patternw[0][x][i] = this.countPatternsw(x, i, 0);
                else if (this.board[x][i] == NULL && this.hasChange(x, y, x, i) && depth == 0) {
                    this.updatePatterns(x, i, depth + 1);
                }
            }
        }
        // Update vertical pattern
        for (let i = Math.max(0, x - 5); i <= Math.min(BOARD_SIZE - 1, x + 5); i++) {
            if (!this.map[1][i][y]) {
                this.map[1][i][y] = true;
                if (this.board[i][y] == BLACK && depth <= 1) this.pattern[1][i][y] = this.countPatterns(i, y, 1);
                else if (this.board[i][y] == WHITE && depth == 0) this.patternw[1][i][y] = this.countPatternsw(i, y, 1);
                else if (this.board[i][y] == NULL && this.hasChange(x, y, i, y) && depth == 0) {
                    this.updatePatterns(i, y, depth + 1);
                }
            }
        }

        // Update diagonal patterns
        for (let i = -5; i <= 5; i++) {
            let dx = x + i;
            let dy = y + i;
            if (this.inBoard(dx, dy)) {
                if (!this.map[2][dx][dy]) {
                    this.map[2][dx][dy] = true;
                    if (this.board[dx][dy] == BLACK && depth <= 1) this.pattern[2][dx][dy] = this.countPatterns(dx, dy, 2);
                    else if (this.board[dx][dy] == WHITE && depth == 0) this.patternw[2][dx][dy] = this.countPatternsw(dx, dy, 2);
                    else if (this.board[dx][dy] == NULL && this.hasChange(x, y, dx, dy) && depth == 0) {
                        this.updatePatterns(dx, dy, depth + 1);
                    }
                }
            }

            let dy2 = y - i;
            if (this.inBoard(dx, dy2)) {
                if (!this.map[3][dx][dy2]) {
                    this.map[3][dx][dy2] = true;
                    if (this.board[dx][dy2] == BLACK && depth <= 1) this.pattern[3][dx][dy2] = this.countPatterns(dx, dy2, 3);
                    else if (this.board[dx][dy2] == WHITE && depth == 0) this.patternw[3][dx][dy2] = this.countPatternsw(dx, dy2, 3);
                    else if (this.board[dx][dy2] == NULL && this.hasChange(x, y, dx, dy2) && depth == 0) {
                        this.updatePatterns(dx, dy2, depth + 1);
                    }
                }
            }
        }
    }
    findNullPosition(x, y, dx, dy) {
        while (this.board[x][y] != NULL) {
            x += dx;
            y += dy;
            if (!this.inBoard(x, y) || this.board[x][y] == WHITE) {
                return [-1, -1];
            }
        }
        return [x, y];
    }
    findNullPositionw(x, y, dx, dy) {
        while (this.board[x][y] != NULL) {
            x += dx;
            y += dy;
            if (!this.inBoard(x, y) || this.board[x][y] == BLACK) {
                return [-1, -1];
            }
        }
        return [x, y];
    }
    findDirectionLength(x, y, dx, dy) {
        var count = 0;
        while (this.isBlack(x, y)) {
            x += dx;
            y += dy;
            count += 1;
        }
        return count;
    }

    findDirectionLengthw(x, y, dx, dy) {
        var count = 0;
        while (this.isWhite(x, y)) {
            x += dx;
            y += dy;
            count += 1;
        }
        return count;
    }

    findLength(x, y, dx, dy) {
        var left = this.findDirectionLength(x, y, dx, dy);
        var right = this.findDirectionLength(x, y, -dx, -dy);
        return left + right - 1;
    }
    findLengthw(x, y, dx, dy) {
        var left = this.findDirectionLengthw(x, y, dx, dy);
        var right = this.findDirectionLengthw(x, y, -dx, -dy);
        return left + right - 1;
    }
    isFive(x, y, dx, dy) {
        return this.findLength(x, y, dx, dy) == 5;
    }
    isFivew(x, y, dx, dy) {
        return this.findLengthw(x, y, dx, dy) == 5;
    }
    hasFive(x, y) {
        for (var i = 0; i < 4; i++) {
            if (this.isFive(x, y, dx[i], dy[i])) {
                return true;
            }
        }
        return false;
    }
    hasFivew(x, y) {
        for (var i = 0; i < 4; i++) {
            if (this.isFivew(x, y, dx[i], dy[i])) {
                return true;
            }
        }
        return false;
    }
    hasLiveFour(x, y) {
        for (var i = 0; i < 4; i++) {
            if (this.isLiveFour(x, y, dx[i], dy[i])) {
                return true;
            }
        }
        return false;
    }
    hasLiveFourw(x, y) {
        for (var i = 0; i < 4; i++) {
            if (this.isLiveFourw(x, y, dx[i], dy[i])) {
                return true;
            }
        }
        return false;
    }
    isLong(x, y, dx, dy) {
        return this.findLength(x, y, dx, dy) > 5;
    }

    hasLong(x, y) {
        for (var i = 0; i < 4; i++) {
            if (this.isLong(x, y, dx[i], dy[i])) {
                return true;
            }
        }
        return false;
    }

    isLiveFour(x, y, dx, dy) {
        if (this.findLength(x, y, dx, dy) != 4) {
            return false;
        }
        var [lx, ly] = this.findNullPosition(x, y, dx, dy);
        if (!this.isNull(lx, ly) || this.isBlack(lx + dx, ly + dy)) {
            return false;
        }
        var [rx, ry] = this.findNullPosition(x, y, -dx, -dy);
        if (!this.isNull(rx, ry) || this.isBlack(rx - dx, ry - dy)) {
            return false;
        }
        return true;
    }
    isLiveFourw(x, y, dx, dy) {
        if (this.findLengthw(x, y, dx, dy) != 4) {
            return false;
        }
        var [lx, ly] = this.findNullPositionw(x, y, dx, dy);
        if (!this.isNull(lx, ly)) {
            return false;
        }
        var [rx, ry] = this.findNullPositionw(x, y, -dx, -dy);
        if (!this.isNull(rx, ry)) {
            return false;
        }
        return true;
    }
    isDeadFour(x, y, dx, dy) {
        [x, y] = this.findNullPosition(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = BLACK;
        var result = this.isFive(x, y, dx, dy);
        this.board[x][y] = NULL;

        return result;
    }

    isDeadFourw(x, y, dx, dy) {
        [x, y] = this.findNullPositionw(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = WHITE;
        var result = this.isFivew(x, y, dx, dy);
        this.board[x][y] = NULL;

        return result;
    }

    isLiveThree(x, y, dx, dy) {
        [x, y] = this.findNullPosition(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = BLACK;
        var result = false;

        if (this.isLiveFour(x, y, dx, dy)) {
            if (!this.hasFive(x, y)) {
                var forbidden = this.checkForbiddenMove(x, y);
                if (!forbidden) {
                    result = true;
                }
            }
        }

        this.board[x][y] = NULL;
        return result;
    }

    isLiveThreew(x, y, dx, dy) {
        [x, y] = this.findNullPositionw(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = WHITE;
        var result = false;

        if (this.isLiveFourw(x, y, dx, dy)) {
            if (!this.hasFivew(x, y)) {
                result = true;
            }
        }

        this.board[x][y] = NULL;
        return result;
    }
    isDeadThree(x, y, dx, dy) {
        [x, y] = this.findNullPosition(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = BLACK;
        var result = this.isDeadFour(x, y, dx, dy);
        this.board[x][y] = NULL;

        return result;
    }
    isDeadThreew(x, y, dx, dy) {
        [x, y] = this.findNullPositionw(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = BLACK;
        var result = this.isDeadFourw(x, y, dx, dy);
        this.board[x][y] = NULL;

        return result;
    }
    isLiveTwo(x, y, dx, dy) {
        [x, y] = this.findNullPosition(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = BLACK;
        var result = false;

        if (this.isLiveThree(x, y, dx, dy)) {
            if (!this.hasFive(x, y)) {
                var forbidden = this.checkForbiddenMove(x, y);
                if (!forbidden) {
                    result = true;
                }
            }
        }

        this.board[x][y] = NULL;
        return result;
    }

    isLiveTwow(x, y, dx, dy) {
        [x, y] = this.findNullPositionw(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = WHITE;
        var result = false;

        if (this.isLiveThreew(x, y, dx, dy)) {
            if (!this.hasFivew(x, y)) {
                result = true;
            }
        }

        this.board[x][y] = NULL;
        return result;
    }
    isDeadTwo(x, y, dx, dy) {
        [x, y] = this.findNullPosition(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = BLACK;
        var result = this.isDeadThree(x, y, dx, dy);
        this.board[x][y] = NULL;

        return result;
    }
    isDeadTwow(x, y, dx, dy) {
        [x, y] = this.findNullPositionw(x, y, dx, dy);
        if (!this.inBoard(x, y)) {
            return false;
        }

        this.board[x][y] = BLACK;
        var result = this.isDeadThreew(x, y, dx, dy);
        this.board[x][y] = NULL;

        return result;
    }
    checkForbiddenMove(x, y) {
        this.board[x][y] = BLACK;

        var isForbidden = false;
        if (!this.hasFive(x, y)) {
            if (this.hasLong(x, y) ||
                this.fourCount(x, y) >= 2 ||
                this.liveThreeCount(x, y) >= 2) {
                isForbidden = true;
            }
        }

        this.board[x][y] = NULL;
        return isForbidden;
    }
    fourCount(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isLiveFour(x, y, dx[i], dy[i])) {
                count += 1;
            } else {
                if (this.isDeadFour(x, y, dx[i], dy[i])) {
                    count += 1;
                }
                if (this.isDeadFour(x, y, -dx[i], -dy[i])) {
                    count += 1;
                }
            }
        }
        return count;
    }

    fourCountw(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isLiveFourw(x, y, dx[i], dy[i])) {
                count += 1;
            } else {
                if (this.isDeadFourw(x, y, dx[i], dy[i])) {
                    count += 1;
                }
                if (this.isDeadFourw(x, y, -dx[i], -dy[i])) {
                    count += 1;
                }
            }
        }
        return count;
    }
    liveThreeCount(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isLiveThree(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isLiveThree(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }

    liveThreeCountw(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isLiveThreew(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isLiveThreew(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }
    deadThreeCount(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isDeadThree(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isDeadThree(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }
    deadThreeCountw(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isDeadThreew(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isDeadThreew(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }
    liveTwoCount(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isLiveTwo(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isLiveTwo(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }

    liveTwoCountw(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isLiveTwow(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isLiveTwow(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }
    deadTwoCount(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isDeadTwo(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isDeadTwo(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }
    deadTwoCountw(x, y) {
        var count = 0;
        for (var i = 0; i < 4; i++) {
            if (this.isDeadTwow(x, y, dx[i], dy[i])) {
                count += 1;
            } else if (this.isDeadTwow(x, y, -dx[i], -dy[i])) {
                count += 1;
            }
        }
        return count;
    }
    countPatterns(x, y, i) {
        var dxDirection = dx[i];
        var dyDirection = dy[i];
        if (this.isFive(x, y, dxDirection, dyDirection)) {
            return this.PATTERN.WIN;
        }
        if (this.isLiveFour(x, y, dxDirection, dyDirection) || this.isLiveFour(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.FLEX4;
        }
        let a = this.isDeadFour(x, y, dxDirection, dyDirection);
        let b = this.isDeadFour(x, y, -dxDirection, -dyDirection);
        if (a && b) {
            return this.PATTERN.BLOCK44;
        }
        if (a || b) {
            return this.PATTERN.BLOCK4;
        }
        if (this.isLiveThree(x, y, dxDirection, dyDirection) || this.isLiveThree(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.FLEX3;
        }
        if (this.isDeadThree(x, y, dxDirection, dyDirection) || this.isDeadThree(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.BLOCK3;
        }
        if (this.isLiveTwo(x, y, dxDirection, dyDirection) || this.isLiveTwo(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.FLEX2;
        }
        if (this.isDeadTwo(x, y, dxDirection, dyDirection) || this.isDeadTwo(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.BLOCK2;
        }

        return this.PATTERN.NONE;
    }
    countPatternsw(x, y, i) {
        var dxDirection = dx[i];
        var dyDirection = dy[i];
        if (this.isFivew(x, y, dxDirection, dyDirection)) {
            return this.PATTERN.WIN;
        }
        if (this.isLiveFourw(x, y, dxDirection, dyDirection) || this.isLiveFourw(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.FLEX4;
        }
        let a = this.isDeadFourw(x, y, dxDirection, dyDirection);
        let b = this.isDeadFourw(x, y, -dxDirection, -dyDirection);
        if (a && b) {
            return this.PATTERN.BLOCK44;
        }
        if (a || b) {
            return this.PATTERN.BLOCK4;
        }
        if (this.isLiveThreew(x, y, dxDirection, dyDirection) || this.isLiveThreew(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.FLEX3;
        }
        if (this.isDeadThreew(x, y, dxDirection, dyDirection) || this.isDeadThreew(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.BLOCK3;
        }
        if (this.isLiveTwow(x, y, dxDirection, dyDirection) || this.isLiveTwow(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.FLEX2;
        }
        if (this.isDeadTwow(x, y, dxDirection, dyDirection) || this.isDeadTwow(x, y, -dxDirection, -dyDirection)) {
            return this.PATTERN.BLOCK2;
        }

        return this.PATTERN.NONE;
    }
    evaluateBoard(playerColor, p) {
        var score = 0;
        var m4 = 0;
        var opf4 = 0;
        var opb4 = 0;
        var mf3 = 0;
        var op43 = 0;
        var mb3 = 0;
        for (var x = 0; x < BOARD_SIZE; x++) {
            for (var y = 0; y < BOARD_SIZE; y++) {
                if (this.board[x][y] == BLACK) {
                    let cnt = 0;
                    for (let i = 0; i < 4; i++) {
                        var pattern = this.pattern[i][x][y];
                        score += playerColor == BLACK ? this.weightsMy[pattern] : -this.weightsOp[pattern];
                        if (playerColor == BLACK) {
                            if (pattern == this.PATTERN.FLEX4) m4 = 1;
                            if (pattern == this.PATTERN.BLOCK4) m4 = 1;
                            if (pattern == this.PATTERN.FLEX3) mf3 = 1;
                            if (pattern == this.PATTERN.BLOCK3) mb3 = 1;
                        } else {
                            if (pattern === this.PATTERN.WIN) return -1000 + p;
                            if (pattern == this.PATTERN.FLEX4) opf4 = 1;
                            if (pattern == this.PATTERN.BLOCK44) opf4 = 1;
                            if (pattern == this.PATTERN.BLOCK4) { cnt++; opb4 = 1; }
                            if (pattern == this.PATTERN.FLEX3) cnt++;
                        }
                    }
                    if (playerColor == WHITE && cnt >= 2) op43 = 1;
                }
                if (this.board[x][y] == WHITE) {
                    let cnt = 0;
                    for (let i = 0; i < 4; i++) {
                        var pattern = this.patternw[i][x][y];
                        score += playerColor == WHITE ? this.weightsMy[pattern] : -this.weightsOp[pattern];
                        if (playerColor == WHITE) {
                            if (pattern == this.PATTERN.FLEX4) m4 = 1;
                            if (pattern == this.PATTERN.BLOCK4) { cnt++; m4 = 1; }
                            if (pattern == this.PATTERN.FLEX3) { cnt++; mf3 = 1; }
                            if (pattern == this.PATTERN.BLOCK3) mb3 = 1;
                        } else {
                            if (pattern === this.PATTERN.WIN) return -1000 + p;
                            if (pattern == this.PATTERN.FLEX4) opf4 = 1;
                            if (pattern == this.PATTERN.BLOCK44) opf4 = 1;
                            if (pattern == this.PATTERN.BLOCK4) { cnt++; opb4 = 1; }
                            if (pattern == this.PATTERN.FLEX3) cnt++;
                        }
                    }
                    if (playerColor == WHITE && cnt >= 2) op43 = 1;
                }
            }
        }
        if (m4 == 1) return 999 - p;
        if (opf4 == 1) return -998 + p;
        if (mf3 == 1 && opb4 == 0) return 997 - p;
        if (op43 == 1 && mf3 == 0 && mb3 == 0) return -996 + p;
        return score;
    }
    hasNearbyPieces(x, y, i) {
        // Check all 8 directions
        for (var step = -3; step <= 3; step++) {
            var newX = x + dx[i] * step;
            var newY = y + dy[i] * step;

            if (this.inBoard(newX, newY) && this.board[newX][newY] != NULL) {
                return true;
            }
        }
        return false;
    }

    getMoves(player) {
        var moves = [];

        // Check all empty positions
        for (var x = 0; x < BOARD_SIZE; x++) {
            for (var y = 0; y < BOARD_SIZE; y++) {
                if (this.board[x][y] == NULL && (this.near[0][x][y] || this.near[1][x][y] || this.near[2][x][y] || this.near[3][x][y])) {
                    if (player == BLACK && this.checkForbiddenMove(x, y)) continue;
                    moves.push([[x, y], this.history[x][y]]);
                }
            }
        }

        // If no candidates (empty board), add center position
        if (moves.length == 0) {
            var center = Math.floor(BOARD_SIZE / 2);
            return [[[center, center], 0]];
        }

        // Convert back to array of positions
        return moves.sort((a, b) => b[1] - a[1]);
    }

    async negamax(depth, alpha, beta, color, nullMove = false, path = []) {
        var score = this.evaluateBoard(color, path.length);
        this.node++;
        if (new Date() - this.t > this.maxTime) this.out = true;
        if (this.out) return this.result;
        if (this.node % 1000 == 0) await this.updateAnalysis(this.depth - 1, this.score, this.path, this.node, new Date() - this.t);
        if (this.node % 1000 == 0) await new Promise(resolve => setTimeout(resolve, 0));
        if (depth <= 0 || (path.length > 0 && (score - path.length <= -996 || score + path.length >= 997))) {
            return [score, path];
        }
        let result = await this.negamax(depth - 3, -beta, -beta + 1, 3 - color, true, path);
        let nullScore = -result[0];
        if (nullScore >= beta) {
            return [beta, path];
        }
        var moves = this.getMoves(color);
        if (moves.length == 0) {
            return [0, path];
        }

        var bestScore = -1000;
        var bestPath = path;
        for (var [[x, y], score] of moves) {
            // Make move
            this.makeMove(x, y, color);
            if (path.length == 0 && !nullMove) {
                this.addHighlight(x, y, 'calculating');
            }
            if (score > -1000) {
                var [score, newPath] = await this.negamax(
                    depth - 1,
                    -alpha - 1,
                    -alpha,
                    color == BLACK ? WHITE : BLACK,
                    false,
                    [...path, [x, y]]
                );
                if (-score > alpha && -score < beta) {
                    var [score, newPath] = await this.negamax(
                        depth - 1,
                        -beta,
                        -alpha,
                        color == BLACK ? WHITE : BLACK,
                        false,
                        [...path, [x, y]]
                    );
                }
            } else {
                var [score, newPath] = await this.negamax(
                    depth - 1,
                    -beta,
                    -alpha,
                    color == BLACK ? WHITE : BLACK,
                    false,
                    [...path, [x, y]]
                );
            }
            // Undo move
            this.makeMove(x, y, NULL);
            // Update best score
            var currentScore = -score;
            if (path.length == 0 && !nullMove) {
                if (currentScore <= -775) {
                    this.removeHighlight(x, y, 'calculating');
                    this.addHighlight(x, y, 'losing');
                }
                else {
                    this.removeHighlight(x, y, 'calculating');
                    this.addHighlight(x, y, 'calculated');
                }
            }

            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestPath = newPath;
                if (path.length == 0 && !nullMove) {
                    this.clearBest();
                    if (currentScore >= -775) this.addHighlight(x, y, 'best');
                }
            }

            alpha = Math.max(alpha, currentScore);
            if (alpha >= beta) {
                break;
            }
        }
        if (bestScore > -1000) {
            let [bx, by] = bestPath[bestPath.length - 1];
            this.history[bx][by] += depth ** 2;
        }

        return [bestScore, bestPath];
    }
    async updateAnalysis(depth, score, path, node, timeSpent) {
        return new Promise((resolve) => {
            if (!analysisBody.firstChild) {
                let row = document.createElement('tr');
                analysisBody.appendChild(row);
            }
            analysisBody.firstChild.innerHTML = `
                <td>${depth} 层</td>
                <td>${score >= 0 ? `黑优 ${score} 分` : `白优 ${-score} 分`}</td>
                <td>${formatPath(path)}</td>
                <td>${node} 个</td>
                <td>${(1000 * node / timeSpent).toFixed(0)} 个每秒</td>
                <td>${timeSpent} 毫秒</td>
            `;
            setTimeout(resolve, 0);
        });
    };
    async getBestMove(player, time) {
        this.out = false;
        this.t = new Date();
        this.maxTime = time;
        let analysisBody = document.getElementById('analysisBody');
        analysisBody.innerHTML = '';
        let iterativeDeepening = async () => {
            this.node = 0;
            // History table for move ordering
            this.history = Array(BOARD_SIZE).fill().map(() => (Array(BOARD_SIZE).fill(0)));
            for (this.depth = 1; new Date() - this.t <= this.maxTime; this.depth++) {
                // Clear all previous highlights
                this.clearHighlights();
                this.result = await this.negamax(this.depth, -1000, 1000, player);

                if (!this.out) {
                    this.timeSpent = new Date() - this.t;
                    this.score = this.result[0] * (player == BLACK ? 1 : -1);
                    this.path = this.result[1];
                    await this.updateAnalysis(this.depth, this.score, this.path, this.node, this.timeSpent);
                }
            }
            // Clear all previous highlights
            this.clearHighlights();
            return this.result;
        };
        return iterativeDeepening().then(() => ({
            move: this.path[0],
            score: this.score,
            path: this.path
        }));
    }
}