"use strict";

// 希尔排序
var SHELL_STEP = [0, 1, 4, 13, 40, 121, 364, 1093];
function shellSort(mvs, vls) {
  var stepLevel = 1;
  while (SHELL_STEP[stepLevel] < mvs.length) {
    stepLevel++;
  }
  stepLevel--;
  while (stepLevel > 0) {
    var step = SHELL_STEP[stepLevel];
    for (var i = step; i < mvs.length; i++) {
      var mvBest = mvs[i];
      var vlBest = vls[i];
      var j = i - step;
      while (j >= 0 && vlBest > vls[j]) {
        mvs[j + step] = mvs[j];
        vls[j + step] = vls[j];
        j -= step;
      }
      mvs[j + step] = mvBest;
      vls[j + step] = vlBest;
    }
    stepLevel--;
  }
}


// 节点类型
var HASH_ALPHA = 1;
var HASH_BETA = 2;
var HASH_PV = 3;
// 走法排序阶段
var PHASE_HASH = 0;
var PHASE_GEN_MOVES = 3;
var PHASE_REST = 4;
// 对走法排序
function MoveSort(mvHash, pos, historyTable) {
  this.mvs = [];                                    // 走法数组
  this.vls = [];                                    // 走法分值
  this.pos = pos;
  this.historyTable = historyTable;
  this.phase = PHASE_HASH;                          // 当前阶段
  this.index = 0;                                   // 当前是第几个走法
  // 处于被将军状态，直接生成所有走法
  this.phase = PHASE_REST;
  var mvsAll = pos.generateMoves();
  for (var i = 0; i < mvsAll.length; i++) {
    var mv = mvsAll[i].mv;
    this.mvs.push(mv);
    this.vls.push(mv == mvHash[0] ? 0x7fffffff : historyTable[mv] * 100 + mvsAll[i].vl);
  }
  shellSort(this.mvs, this.vls);
}

// 获得一步排序后的走法
MoveSort.prototype.next = function () {
  switch (this.phase) {
    case PHASE_HASH:
      if (this.mvHash > 0) {
        return this.mvHash;
      }

    case PHASE_GEN_MOVES:
      this.phase = PHASE_REST;
      var mvsAll = this.pos.generateMoves();
      for (var i = 0; i < mvsAll.length; i++) {
        var mv = mvsAll[i].mv;
        this.mvs.push(mv);
        this.vls.push(this.historyTable[mv] * 100 + mvsAll[i].vl);
      }
      shellSort(this.mvs, this.vls);
      this.index = 0;

    default:
      while (this.index < this.mvs.length) {
        var mv = this.mvs[this.index];
        this.index++;
        return mv;
      }
  }
  return 0;
}

function Search(pos, hashLevel) {
  this.hashMask = (1 << hashLevel) - 1;  // 置换表的大小减去1
  this.pos = pos;
}

// 获取当前局面的置换表表项
Search.prototype.getHashItem = function () {
  return this.hashTable[this.pos.zobristKey & this.hashMask];
}

// 查询置换表
Search.prototype.probeHash = function (vlAlpha, vlBeta, depth) {
  var hash = this.getHashItem();
  if (hash.zobristLock != this.pos.zobristLock) {
    return -MATE_VALUE;
  }
  var mate = false;

  if (hash.vl > WIN_VALUE) {
    hash.vl += this.pos.distance;
    mate = true;
  } else if (hash.vl < -WIN_VALUE) {
    hash.vl -= this.pos.distance;
    mate = true;
  }

  if (hash.depth < depth && !mate) {
    return -MATE_VALUE;
  }

  if (hash.flag == HASH_BETA) {
    return (hash.vl >= vlBeta ? hash.vl : -MATE_VALUE);
  }

  if (hash.flag == HASH_ALPHA) {
    return (hash.vl <= vlAlpha ? hash.vl : -MATE_VALUE);
  }
  return { vl: hash.vl, path: hash.path };
}

// 记录置换表
Search.prototype.recordHash = function (flag, vl, depth, path) {
  var hash = this.getHashItem();
  if (hash.depth > depth) {
    return;
  }

  hash.flag = flag;
  hash.depth = depth;

  if (vl > WIN_VALUE) {
    hash.vl = vl - this.pos.distance;
  } else if (vl < -WIN_VALUE) {
    hash.vl = vl + this.pos.distance;
  } else {
    hash.vl = vl;
  }

  hash.path = path;
  hash.zobristLock = this.pos.zobristLock;
}

// 更新历史表和杀手走法表
Search.prototype.setBestMove = function (mv, depth) {
  this.historyTable[mv] += depth * depth;
}

// 修改后的searchMain方法
Search.prototype.searchMain = async function (depth, millis) {
  // 初始化置换表
  this.hashTable = [];
  for (var i = 0; i <= this.hashMask; i++) {
    this.hashTable.push({ depth: 0, flag: 0, vl: 0, path: [], zobristLock: 0 });
  }


  // 初始化历史表
  this.historyTable = new Array(4096).fill(0);

  this.pos.distance = 0;
  this.nodes = 0;
  this.out = false;
  this.maxTime = millis;
  this.allMillis = Date.now();

  this.result = null;
  for (let i = 1; i <= depth; i++) {
    this.result = await this.searchFull(-MATE_VALUE, MATE_VALUE, i);
    if (!this.out) {
      await updateInfoPanel(`${i}-${this.result.path.length}`, this.result.vl, this.nodes / (Date.now() - this.allMillis) * 1000, this.nodes, Date.now() - this.allMillis, this.result.path);
    }
    if (Date.now() - this.allMillis > this.maxTime) {
      break;
    }
  }

  return this.result;
}

// 修改后的searchFull方法
Search.prototype.searchFull = async function (vlAlpha_, vlBeta, depth, noNull = false) {
  this.nodes++;
  if (Date.now() - this.allMillis > this.maxTime) this.out = true;
  if (this.out) return this.result;
  var vlAlpha = vlAlpha_;

  if (this.pos.count[2 - this.pos.sdPlayer][PATTERN.WIN] >= 5) return { vl: -MATE_VALUE + this.pos.distance, path: [] };
  if (this.pos.distance > 0) {
    if (this.pos.count[this.pos.sdPlayer - 1][PATTERN.FLEX4] >= 4 || this.pos.count[this.pos.sdPlayer - 1][PATTERN.BLOCK4] >= 4)
      return { vl: MATE_VALUE - this.pos.distance - 1, path: [] };
    if (this.pos.count[2 - this.pos.sdPlayer][PATTERN.FLEX4] >= 4 || this.pos.count[2 - this.pos.sdPlayer][PATTERN.BLOCK44] >= 1)
      return { vl: -MATE_VALUE + this.pos.distance + 2, path: [] };
    if (this.pos.count[this.pos.sdPlayer - 1][PATTERN.FLEX3] >= 3 && this.pos.count[2 - this.pos.sdPlayer][PATTERN.BLOCK4] == 0)
      return { vl: MATE_VALUE - this.pos.distance - 3, path: [] };
    if (this.pos.count[2 - this.pos.sdPlayer][PATTERN.BLOCK43] >= 1 && this.pos.count[this.pos.sdPlayer - 1][PATTERN.FLEX3] == 0 &&
      this.pos.count[this.pos.sdPlayer - 1][PATTERN.BLOCK3] == 0)
      return { vl: -MATE_VALUE + this.pos.distance + 4, path: [] };
  }

  if (depth <= 0) {
    return { vl: this.pos.evaluate(), path: [] };
  }

  // 查询置换表
  var hash = this.probeHash(vlAlpha, vlBeta, depth);
  if (hash.vl > -MATE_VALUE) {
    return hash;
  }

  if (!noNull && !(this.pos.count[2 - this.pos.sdPlayer][PATTERN.BLOCK4] >= 4 ||
    this.pos.count[2 - this.pos.sdPlayer][PATTERN.FLEX3] >= 3)) {
    this.pos.nullMove();
    var nullRes = await this.searchFull(-vlBeta, 1 - vlBeta, depth - 3, true);
    this.pos.undoNullMove();
    if (nullRes.vl >= vlBeta) {
      return { vl: nullRes.vl, path: [] };
    }
  }

  var vlBest = -MATE_VALUE;
  var mvBest = 0;
  var bestPath = [];
  var hashFlag = HASH_ALPHA;
  var newDepth = this.pos.count[2 - this.pos.sdPlayer][PATTERN.BLOCK4] >= 4 ||
    this.pos.count[2 - this.pos.sdPlayer][PATTERN.FLEX3] >= 3 ? depth : depth - 1;

  // 使用新的走法排序
  var sort = new MoveSort(hash.vl > -MATE_VALUE ? hash.path : [0], this.pos, this.historyTable);
  var mv = 0;

  while ((mv = sort.next()) > 0) {
    this.pos.makeMove(mv);
    var res = await this.searchFull(-vlBeta, -vlAlpha, newDepth, false);
    var vl = -res.vl;
    this.pos.undoMakeMove();

    if (vl > vlBest) {
      vlBest = vl;
      bestPath = [mv].concat(res.path);
      if (vl >= vlBeta) {
        hashFlag = HASH_BETA;
        mvBest = mv;
        break;
      }
      if (vl > vlAlpha) {
        vlAlpha = vl;
        hashFlag = HASH_PV;
        mvBest = mv;
      }
    }
  }

  if (vlBest > -MATE_VALUE) {
    this.recordHash(hashFlag, vlBest, depth, bestPath);
    if (mvBest > 0) {
      this.setBestMove(mvBest, depth);
    }
  }

  return { vl: vlBest, path: bestPath };
}