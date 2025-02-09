"use strict";

var MATE_VALUE = 1000;				// 最高分值
var WIN_VALUE = MATE_VALUE - 225;	// 赢棋分值（高于此分值都是赢棋）

// 棋盘范围
var RANK_TOP = 0;
var RANK_BOTTOM = 14;
var FILE_LEFT = 0;
var FILE_RIGHT = 14;

var ADD_PIECE = 0;
var DEL_PIECE = 1;

var PATTERN = {
  NONE: 0,
  BLOCK44: 9,
  BLOCK43: 8,
  WIN: 7,
  FLEX4: 6,
  BLOCK4: 5,
  FLEX3: 4,
  BLOCK3: 3,
  FLEX2: 2,
  BLOCK2: 1
};

var DX = [1, 15, 16, 17];
var vl = [0, 1, 3, 3, 7, 7, 15, 200];
// 辅助数组，用于判断棋子是否在棋盘上
var IN_BOARD_ = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];


// 判断某位置是否在棋盘
function IN_BOARD(sq) {
  return sq >= 0 && IN_BOARD_[sq] != 0;
}

// 根据一维矩阵，获取二维矩阵行数
function RANK_Y(sq) {
  return sq >> 4;
}

// 根据一维矩阵，获取二维矩阵列数
function FILE_X(sq) {
  return sq & 15;
}

// 将二维矩阵转换为一维矩阵
function COORD_XY(mv, y) {
  return mv + (y << 4);
}

function RC4(key) {
  this.x = this.y = 0;
  this.state = [];
  for (var i = 0; i < 256; i++) {
    this.state.push(i);
  }
  var j = 0;
  for (var i = 0; i < 256; i++) {
    j = (j + this.state[i] + key[i % key.length]) & 0xff;
    this.swap(i, j);
  }
}

RC4.prototype.swap = function (i, j) {
  var t = this.state[i];
  this.state[i] = this.state[j];
  this.state[j] = t;
}

RC4.prototype.nextByte = function () {
  this.x = (this.x + 1) & 0xff;
  this.y = (this.y + this.state[this.x]) & 0xff;
  this.swap(this.x, this.y);
  var t = (this.state[this.x] + this.state[this.y]) & 0xff;
  return this.state[t];
}

// 生成32位随机数
RC4.prototype.nextLong = function () {
  var n0 = this.nextByte();
  var n1 = this.nextByte();
  var n2 = this.nextByte();
  var n3 = this.nextByte();
  return n0 + (n1 << 8) + (n2 << 16) + ((n3 << 24) & 0xffffffff);
}

var PreGen_zobristKeyPlayer, PreGen_zobristLockPlayer;
var PreGen_zobristKeyTable = [], PreGen_zobristLockTable = [];

var rc4 = new RC4([0]);
PreGen_zobristKeyPlayer = rc4.nextLong();
rc4.nextLong();
PreGen_zobristLockPlayer = rc4.nextLong();
for (var i = 0; i < 2; i++) {
  var keys = [];
  var locks = [];
  for (var j = 0; j < 256; j++) {
    keys.push(rc4.nextLong());
    rc4.nextLong();
    locks.push(rc4.nextLong());
  }
  PreGen_zobristKeyTable.push(keys);
  PreGen_zobristLockTable.push(locks);
}

function Position() {
  this.clearBoard();
  this.setIrrev();
}

// 初始化棋局数组
Position.prototype.clearBoard = function () {
  this.sdPlayer = 1;	// 该谁走棋。1-黑方；2-白方
  this.squares = [];	// 这个就是一维棋局数组
  for (var sq = 0; sq < 256; sq++) {
    this.squares.push(0);
  }
  this.pattern = Array(2).fill().map(() =>
    Array(4).fill().map(() => new Array(256).fill(0))
  );
  this.count = Array(2).fill().map(() =>
    Array(10).fill(0)
  );
  this.zobristKey = this.zobristLock = 0;
  this.vlWhite = this.vlBlack = 0;
}

Position.prototype.setIrrev = function () {
  this.mvList = [];	// 存放每步走法的数组
  this.keyList = [0];
  this.distance = 0;	// 搜索的深度
}

// 生成棋局的所有走法
Position.prototype.generateMoves = function () {
  var mvs = [];									// 用于存储所有合法的走法
  var fmvs = [];
  var dang4 = [];
  var zuoFlex4 = [];
  var zuo44 = [];
  var dangFlex3_zuoBlock4 = [];
  var haveopFlex3 = false;
  for (var mv = 0; mv < 256; mv++) {
    // 遍历虚拟棋盘的256个点
    if (!IN_BOARD(mv) || this.squares[mv] != 0) {		// 这是对方棋子，或者该位置根本没有棋子
      continue;
    }
    fmvs.push({ mv, vl: 0 });
    var mvvl = 0;
    var ok = false;
    var block4 = 0;
    var d = false;
    for (var direction = 0; direction < 4; direction++) {
      if (this.pattern[this.sdPlayer - 1][direction][mv] >= PATTERN.BLOCK2 || this.pattern[2 - this.sdPlayer][direction][mv] >= PATTERN.FLEX2) {		// 这是对方棋子，或者该位置根本没有棋子
        ok = true;
      }
      if (this.pattern[this.sdPlayer - 1][direction][mv] == PATTERN.BLOCK4) block4++;
      if (this.pattern[this.sdPlayer - 1][direction][mv] == PATTERN.WIN) return [{ mv, vl: 0 }];
      if (this.pattern[2 - this.sdPlayer][direction][mv] == PATTERN.WIN) dang4.push({ mv, vl: 0 });
      if (this.pattern[this.sdPlayer - 1][direction][mv] == PATTERN.FLEX4) zuoFlex4.push({ mv, vl: 0 });
      if (this.pattern[2 - this.sdPlayer][direction][mv] == PATTERN.FLEX4) {
        haveopFlex3 = true;
        d = true;
      }
      if (this.pattern[this.sdPlayer - 1][direction][mv] == PATTERN.BLOCK4) {
        d = true;
      }
      if (this.pattern[2 - this.sdPlayer][direction][mv] == PATTERN.BLOCK4 && this.isDis3(mv, direction)) {
        d = true;
      }
      mvvl += vl[this.pattern[this.sdPlayer - 1][direction][mv]] * 2 + vl[this.pattern[2 - this.sdPlayer][direction][mv]];
    }
    if (block4 >= 2) zuo44.push({ mv, vl: 0 });
    if (d) dangFlex3_zuoBlock4.push({ mv, vl: mvvl });
    if (ok) mvs.push({ mv, vl: mvvl });
  }
  if (dang4.length > 0) return [dang4[0]];
  if (zuoFlex4.length > 0) return [zuoFlex4[0]];
  if (zuo44.length > 0) return [zuo44[0]];
  if (haveopFlex3) return dangFlex3_zuoBlock4
  if (mvs.length == 0) return fmvs;
  return mvs;
}
Position.prototype.isDis3 = function (mv, direction) {
  if (IN_BOARD(mv + DX[direction]) && this.pattern[2 - this.sdPlayer][direction][mv + DX[direction]] == PATTERN.FLEX3) return true;
  if (IN_BOARD(mv - DX[direction]) && this.pattern[2 - this.sdPlayer][direction][mv - DX[direction]] == PATTERN.FLEX3) return true;
  if (IN_BOARD(mv + DX[direction]) && IN_BOARD(mv + 2 * DX[direction]) && IN_BOARD(mv + 3 * DX[direction]) && IN_BOARD(mv + 4 * DX[direction]) && IN_BOARD(mv + 5 * DX[direction])
    && this.pattern[2 - this.sdPlayer][direction][mv + 2 * DX[direction]] == PATTERN.FLEX3 && (IN_BOARD(mv + 6 * DX[direction]) || this.squares[mv + 6 * DX[direction]] == this.sdPlayer)) return true;
  if (IN_BOARD(mv - DX[direction]) && IN_BOARD(mv - 2 * DX[direction]) && IN_BOARD(mv - 3 * DX[direction]) && IN_BOARD(mv - 4 * DX[direction]) && IN_BOARD(mv - 5 * DX[direction])
    && this.pattern[2 - this.sdPlayer][direction][mv - 2 * DX[direction]] == PATTERN.FLEX3 && (IN_BOARD(mv + 6 * DX[direction]) || this.squares[mv + 6 * DX[direction]] == this.sdPlayer)) return true;
  return false;
}
//　结合搜索深度的输棋分值
Position.prototype.mateValue = function () {
  return this.distance - MATE_VALUE;
}

// 切换走棋方
Position.prototype.changeSide = function () {
  this.sdPlayer = 3 - this.sdPlayer;
  this.zobristKey ^= PreGen_zobristKeyPlayer;
  this.zobristLock ^= PreGen_zobristLockPlayer;
}

// 走一步棋
Position.prototype.makeMove = function (mv) {
  for (var direction = 0; direction < 4; direction++) {
    // Using bitwise operations for efficient range checks
    for (var i = -4; i <= 4; i++) {
      var newX = mv + i * DX[direction];
      if (IN_BOARD(newX)) {
        if (this.squares[newX] == 1) {
          this.vlBlack -= vl[this.pattern[0][direction][newX]];
          this.count[0][this.pattern[0][direction][newX]]--;
        }
        else if (this.squares[newX] == 2) {
          this.vlWhite -= vl[this.pattern[1][direction][newX]];
          this.count[1][this.pattern[1][direction][newX]]--;
        }
      }
    }
  }
  this.movePiece(mv);	// 移动棋子
  var cnt1 = 0; var cnt2 = 0;
  for (var direction = 0; direction < 4; direction++) {
    // Using bitwise operations for efficient range checks
    for (var i = -4; i <= 4; i++) {
      var newX = mv + i * DX[direction];
      if (IN_BOARD(newX)) {
        // Update patterns for both colors
        this.pattern[0][direction][newX] = this.countPatterns(newX, 1, direction);
        this.pattern[1][direction][newX] = this.countPatterns(newX, 2, direction);
        if (this.squares[newX] == 1) {
          this.vlBlack += vl[this.pattern[0][direction][newX]];
          this.count[0][this.pattern[0][direction][newX]]++;
          if (i == 0 && this.pattern[0][direction][newX] == PATTERN.BLOCK4) cnt1++;
          if (i == 0 && this.pattern[0][direction][newX] == PATTERN.FLEX3) cnt2++;
        }
        else if (this.squares[newX] == 2) {
          this.vlWhite += vl[this.pattern[1][direction][newX]];
          this.count[1][this.pattern[1][direction][newX]]++;
          if (i == 0 && this.pattern[1][direction][newX] == PATTERN.BLOCK4) cnt1++;
          if (i == 0 && this.pattern[1][direction][newX] == PATTERN.FLEX3) cnt2++;
        }
      }
    }
  }
  if (cnt1 >= 2) this.count[this.sdPlayer - 1][PATTERN.BLOCK44]++;
  else if (cnt1 + cnt2 >= 2) this.count[this.sdPlayer - 1][PATTERN.BLOCK43]++;
  this.keyList.push(this.zobristKey);
  this.changeSide();	// 切换走棋方
  this.distance++;		// 搜索深度+1
}

// 取消上一步的走棋
Position.prototype.undoMakeMove = function () {
  var mv = this.mvList[this.mvList.length - 1];
  var cnt1 = 0; var cnt2 = 0;
  for (var direction = 0; direction < 4; direction++) {
    // Using bitwise operations for efficient range checks
    for (var i = -4; i <= 4; i++) {
      var newX = mv + i * DX[direction];
      if (IN_BOARD(newX)) {
        if (this.squares[newX] == 1) {
          this.vlBlack -= vl[this.pattern[0][direction][newX]];
          this.count[0][this.pattern[0][direction][newX]]--;
          if (i == 0 && this.pattern[0][direction][newX] == PATTERN.BLOCK4) cnt1++;
          if (i == 0 && this.pattern[0][direction][newX] == PATTERN.FLEX3) cnt2++;
        }
        else if (this.squares[newX] == 2) {
          this.vlWhite -= vl[this.pattern[1][direction][newX]];
          this.count[1][this.pattern[1][direction][newX]]--;
          if (i == 0 && this.pattern[1][direction][newX] == PATTERN.BLOCK4) cnt1++;
          if (i == 0 && this.pattern[1][direction][newX] == PATTERN.FLEX3) cnt2++;
        }
      }
    }
  }
  this.undoMovePiece();	// 移动棋子
  for (var direction = 0; direction < 4; direction++) {
    // Using bitwise operations for efficient range checks
    for (var i = -4; i <= 4; i++) {
      var newX = mv + i * DX[direction];
      if (IN_BOARD(newX)) {
        // Update patterns for both colors
        this.pattern[0][direction][newX] = this.countPatterns(newX, 1, direction);
        this.pattern[1][direction][newX] = this.countPatterns(newX, 2, direction);
        if (this.squares[newX] == 1) {
          this.vlBlack += vl[this.pattern[0][direction][newX]];
          this.count[0][this.pattern[0][direction][newX]]++;
        }
        else if (this.squares[newX] == 2) {
          this.vlWhite += vl[this.pattern[1][direction][newX]];
          this.count[1][this.pattern[1][direction][newX]]++;
        }
      }
    }
  }
  if (cnt1 >= 2) this.count[2 - this.sdPlayer][PATTERN.BLOCK44]--;
  else if (cnt1 + cnt2 >= 2) this.count[2 - this.sdPlayer][PATTERN.BLOCK43]--;
  this.keyList.pop()
  this.changeSide();	// 切换走棋方
  this.distance--;		// 搜索深度-1
}

// 空步搜索
Position.prototype.nullMove = function () {
  this.mvList.push(0);
  this.keyList.push(this.zobristKey);
  this.changeSide();
  this.distance++;
}

// 撤销上一步的空步搜索
Position.prototype.undoNullMove = function () {
  this.distance--;
  this.changeSide();
  this.keyList.pop();
  this.mvList.pop();
}

// 根据走法移动棋子，删除终点位置的棋子，将起点位置的棋子放置在终点的位置。
Position.prototype.movePiece = function (mv) {
  this.addPiece(mv, ADD_PIECE);	// 将原来起点的棋子添加到终点
  this.mvList.push(mv);
}

// 取消上一步对棋子的移动
Position.prototype.undoMovePiece = function () {
  var mv = this.mvList.pop();
  this.addPiece(mv, DEL_PIECE);	// 将原来起点的棋子添加到终点
}

// 如果bDel为false，则将棋子pc添加进棋局中的sp位置；如果bDel为true，则删除sp位置的棋子。
Position.prototype.addPiece = function (sq, bDel) {
  var o = this.squares[sq];
  // 添加或删除棋子
  this.squares[sq] = bDel ? 0 : this.sdPlayer;
  this.zobristKey ^= PreGen_zobristKeyTable[bDel ? 2 - o : 2 - this.sdPlayer][sq];
  this.zobristLock ^= PreGen_zobristLockTable[bDel ? 2 - o : 2 - this.sdPlayer][sq];
}

// 局面评估函数，返回当前走棋方的优势
Position.prototype.evaluate = function () {
  var vl = (this.sdPlayer == 1 ? this.vlBlack * 2 - this.vlWhite :
    this.vlWhite * 2 - this.vlBlack);
  return vl;
}

Position.prototype.getLine = function (mv, direction) {
  var line = new Array(9).fill(0);
  var dx = DX[direction];

  for (var i = -4; i <= 4; i++) {
    var newX = mv + dx * i;
    if (IN_BOARD(newX)) {
      line[i + 4] = this.squares[newX];
    } else {
      line[i + 4] = -1;
    }
  }
  return line;
};

Position.prototype.analyzeLine = function (line, who) {
  var kong = 0, block = 0;
  var len = 1, len2 = 1, count = 1;

  // Right side analysis
  for (var k = 5; k <= 8; k++) {
    if (line[k] == who) {
      if (kong + count > 4) break;
      count++;
      len++;
      len2 = kong + count;
    } else if (line[k] == 0) {
      len++;
      kong++;
    } else {
      if (line[k - 1] == who) block++;
      break;
    }
  }

  kong = len2 - count;

  // Left side analysis
  for (var k = 3; k >= 0; k--) {
    if (line[k] == who) {
      if (kong + count > 4) break;
      count++;
      len++;
      len2 = kong + count;
    } else if (line[k] == 0) {
      if (kong + count > 4) break;
      len++;
      kong++;
    } else {
      if (line[k + 1] == who) block++;
      break;
    }
  }

  return this.generatePattern(len, len2, count, block);
};

Position.prototype.generatePattern = function (len, len2, count, block) {
  if (len >= 5 && count > 0) {
    if (count == 5) return PATTERN.WIN;

    if (len > 5 && len2 < 5 && block == 0) {
      // Using bitwise operations for pattern return values
      return count == 1 ? PATTERN.NONE :
        count == 2 ? PATTERN.FLEX2 :
          count == 3 ? PATTERN.FLEX3 :
            count == 4 ? PATTERN.FLEX4 : PATTERN.NONE;
    } else {
      return count == 1 ? PATTERN.NONE :
        count == 2 ? PATTERN.BLOCK2 :
          count == 3 ? PATTERN.BLOCK3 :
            count == 4 ? PATTERN.BLOCK4 : PATTERN.NONE;
    }
  }
  return PATTERN.NONE;
};

Position.prototype.countPatterns = function (mv, who, direction) {
  var line1 = this.getLine(mv, direction);
  var line2 = this.getLine(mv, direction).reverse();
  return Math.max(this.analyzeLine(line1, who), this.analyzeLine(line2, who));
};

