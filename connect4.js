class ConnectFourEngine {
  constructor() {
    this.BOARD_PADDING = 4;
    this.DIRECTIONS = [[0,1],[1,0],[1,1],[1,-1]];
    this.EVAL_SCORES = [0,1,1,9,9,27,27,81];
    this.size = { width: 11, height: 4 };
    this.board = [];
    this.zobristTable = [];
    this.patternTable = [];
    this.hashTable = new Map();
    this.PieceType = { Empty:0, Black:1, White:2, Outside:3 };
    this.currentPlayer = this.PieceType.Black;
    this.moveHistory = [];
    this.zobristKey = 0;
    this.searchNodes = 0;
    this.ply = 0;
    this.winner = this.PieceType.Empty;
    this.progressCallback = null;
    this.searchLayerInfo = [];
    this.globalTime = 0;
    this.neighbors = [];
    this.initBoard();
    this.initZobrist();
    this.initPatternTable();
    this.resetNeighbors();
  }
  initBoard(){
    const totalHeight = this.size.height + 2*this.BOARD_PADDING;
    const totalWidth = this.size.width + 2*this.BOARD_PADDING;
    this.board = new Array(totalHeight);
    for (let i=0;i<totalHeight;i++){
      this.board[i] = new Array(totalWidth);
      for (let j=0;j<totalWidth;j++){
        const isOutside = (i < this.BOARD_PADDING || i >= this.size.height + this.BOARD_PADDING || j < this.BOARD_PADDING || j >= this.size.width + this.BOARD_PADDING);
        this.board[i][j] = { piece: isOutside ? this.PieceType.Outside : this.PieceType.Empty, patterns: [[0,0,0,0],[0,0,0,0]], candidate: false };
      }
    }
  }
  initZobrist(){
    const totalHeight = this.size.height + 2*this.BOARD_PADDING;
    const totalWidth = this.size.width + 2*this.BOARD_PADDING;
    this.zobristTable = new Array(4);
    for (let piece=0; piece<4; piece++){
      this.zobristTable[piece] = new Array(totalHeight);
      for (let i=0;i<totalHeight;i++){
        this.zobristTable[piece][i] = new Array(totalWidth);
        for (let j=0;j<totalWidth;j++){
          this.zobristTable[piece][i][j] = Math.floor(Math.random()*0xFFFFFFFF);
        }
      }
    }
  }
  initPatternTable(){
    const maxKey = Math.pow(4,6) >>> 0;
    this.patternTable = new Array(maxKey);
    for (let key=0; key<maxKey; key++){
      const b = this.evaluatePattern(key, this.PieceType.Black);
      const w = this.evaluatePattern(key, this.PieceType.White);
      this.patternTable[key] = [b,w];
    }
  }
  evaluatePattern(key, player){
    const pattern = [];
    let tempKey = key >>> 0;
    for (let i=0;i<6;i++){ pattern.push(tempKey % 4); tempKey = Math.floor(tempKey/4); }
    const line = [pattern[0],pattern[1],pattern[2], player, pattern[3],pattern[4],pattern[5]];
    let empty = 0, block = 0;
    let len = 1, len2 = 1, count = 1;
    for (let i=4;i<=6;i++){
      if (line[i] === player){ count++; len++; len2 = empty + count; }
      else if (line[i] === this.PieceType.Empty){ len++; empty++; }
      else { if (line[i-1] === player) block++; break; }
    }
    empty = len2 - count;
    for (let i=2;i>=0;i--){
      if (line[i] === player){ if (empty + count > 3) break; count++; len++; len2 = empty + count; }
      else if (line[i] === this.PieceType.Empty){ if (empty + count > 3) break; len++; empty++; }
      else { if (line[i+1] === player) block++; break; }
    }
    if (len >= 4 && count >= 1){
      if (count === 4) return 7;
      if (len > 4 && len2 < 4 && block === 0){
        if (count === 1) return 2;
        if (count === 2) return 4;
        if (count === 3) return 6;
      } else {
        if (count === 1) return 1;
        if (count === 2) return 3;
        if (count === 3) return 5;
      }
    }
    return 0;
  }
  getPatternKey(x,y,dir,player){
    const dx = this.DIRECTIONS[dir][0], dy = this.DIRECTIONS[dir][1];
    let key = 0, mul = 1;
    const totalHeight = this.size.height + 2*this.BOARD_PADDING;
    const totalWidth = this.size.width + 2*this.BOARD_PADDING;
    for (let i=-3;i<=3;i++){
      if (i===0) continue;
      const nx = x + dx*i;
      const ny = y + dy*i;
      let piece = this.PieceType.Outside;
      if (nx>=0 && nx<totalHeight && ny>=0 && ny<totalWidth){ piece = this.board[nx][ny].piece; }
      key += piece * mul;
      mul *= 4;
    }
    return key >>> 0;
  }
  updatePatterns(x,y){
    for (let dx=-3; dx<=3; dx++){
      for (let dy=-3; dy<=3; dy++){
        const nx = x + dx, ny = y + dy;
        if (nx>=this.BOARD_PADDING && nx< this.size.height + this.BOARD_PADDING && ny>=this.BOARD_PADDING && ny< this.size.width + this.BOARD_PADDING){
          for (let dir=0; dir<4; dir++){
            const key0 = this.getPatternKey(nx,ny,dir,this.PieceType.Black);
            const key1 = this.getPatternKey(nx,ny,dir,this.PieceType.White);
            if (key0 < this.patternTable.length){ this.board[nx][ny].patterns[0][dir] = this.patternTable[key0][0]; }
            if (key1 < this.patternTable.length){ this.board[nx][ny].patterns[1][dir] = this.patternTable[key1][1]; }
          }
        }
      }
    }
  }
  getPval(patterns,my){
    const type = new Array(8).fill(0);
    for (let p of patterns){ if (p>=0 && p<8) type[p]++; }
    if (my && type[7]>0) return 5000;
    if (!my && type[7]>0) return 3000;
    if (my && type[6]>0) return 1200;
    const val = [0,2,5,5,12,12,27,27];
    let score = 0;
    for (let i=1;i<=7;i++){ score += val[i]*type[i]; }
    return score;
  }
  evaluatePosition(pos){
    const x = pos.x + this.BOARD_PADDING;
    const y = pos.y + this.BOARD_PADDING;
    const myPatterns = [], opPatterns = [];
    for (let dir=0; dir<4; dir++){
      myPatterns.push(this.board[x][y].patterns[this.currentPlayer-1][dir]);
      opPatterns.push(this.board[x][y].patterns[2 - this.currentPlayer][dir]);
    }
    const my = this.getPval(myPatterns,true);
    const op = this.getPval(opPatterns,false);
    if (my === 5000) return my;
    if (op === 3000) return op;
    if (my === 1200) return my;
    return my*2 + op;
  }
  makeMove(pos){
    const x = pos.x + this.BOARD_PADDING;
    const y = pos.y + this.BOARD_PADDING;
    if (this.board[x][y].piece !== this.PieceType.Empty) return false;
    this.zobristKey ^= this.zobristTable[this.currentPlayer][x][y];
    this.board[x][y].piece = this.currentPlayer;
    this.moveHistory.push({x:pos.x,y:pos.y});
    this.updatePatterns(x,y);
    this.updateNeighbors(pos.x, pos.y, +1);
    const idxPlaced = this.currentPlayer === this.PieceType.Black ? 0 : 1;
    for (let dir=0; dir<4; dir++){
      if (this.board[x][y].patterns[idxPlaced][dir] === 7){ this.winner = this.currentPlayer; break; }
    }
    this.currentPlayer = (this.currentPlayer === this.PieceType.Black) ? this.PieceType.White : this.PieceType.Black;
    return true;
  }
  undoMove(){
    if (this.moveHistory.length===0) return false;
    const last = this.moveHistory.pop();
    const x = last.x + this.BOARD_PADDING;
    const y = last.y + this.BOARD_PADDING;
    this.zobristKey ^= this.zobristTable[this.board[x][y].piece][x][y];
    this.board[x][y].piece = this.PieceType.Empty;
    this.updatePatterns(x,y);
    this.updateNeighbors(last.x, last.y, -1);
    this.currentPlayer = (this.currentPlayer === this.PieceType.Black) ? this.PieceType.White : this.PieceType.Black;
    this.winner = this.PieceType.Empty;
    return true;
  }
  evaluate(color){
    const blackTypes = new Array(8).fill(0);
    const whiteTypes = new Array(8).fill(0);
    for (let i=this.BOARD_PADDING; i<this.size.height + this.BOARD_PADDING; i++){
      for (let j=this.BOARD_PADDING; j<this.size.width + this.BOARD_PADDING; j++){
        if (this.board[i][j].piece === this.PieceType.Empty){
          for (let dir=0; dir<4; dir++){
            blackTypes[this.board[i][j].patterns[0][dir]]++;
            whiteTypes[this.board[i][j].patterns[1][dir]]++;
          }
        }
      }
    }
    if (color===1 && blackTypes[7]>0) return [9999,false];
    if (color===0 && whiteTypes[7]>0) return [9999,false];
    if (color===1 && whiteTypes[7]>1) return [-9998,false];
    if (color===0 && blackTypes[7]>1) return [-9998,false];
    if (color===1 && blackTypes[6]>0 && whiteTypes[7]===0) return [9997,false];
    if (color===0 && whiteTypes[6]>0 && blackTypes[7]===0) return [9997,false];
    let blackScore=0, whiteScore=0;
    for (let i=1;i<8;i++){ blackScore += blackTypes[i]*this.EVAL_SCORES[i]; whiteScore += whiteTypes[i]*this.EVAL_SCORES[i]; }
    const expand = (color===1) ? (whiteTypes[7]===1 || whiteTypes[6]>=1) : (blackTypes[7]===1 || blackTypes[6]>=1);
    const result = (color===1) ? blackScore - whiteScore + 54 : whiteScore - blackScore + 54;
    return [result, expand];
  }
  generateAllMoves(){
    const moves=[];
    for (let i=0;i<this.size.height;i++){
      for (let j=0;j<this.size.width;j++){
        if (this.board[i + this.BOARD_PADDING][j + this.BOARD_PADDING].piece === this.PieceType.Empty){ if (this.neighbors[i] && this.neighbors[i][j] > 0) { moves.push({x:i,y:j}); } }
      }
    }
    return moves;
  }
  getNextMove(moveList){
    switch(moveList.phase){
      case 0:
        moveList.phase = 1;
        if (this.hashTable.has(this.zobristKey)){
          const entry = this.hashTable.get(this.zobristKey);
          if (entry.key === this.zobristKey && entry.bestMove && entry.bestMove.x !== -1){
            moveList.hashMove = entry.bestMove;
            moveList.hasHashMove = true;
            return entry.bestMove;
          }
        }
        break;
      case 1:
        moveList.phase = 2;
        {
          const allMoves = this.generateAllMoves();
          moveList.moves = [];
          for (const pos of allMoves){ moveList.moves.push({ pos, score: this.evaluatePosition(pos) }); }
          moveList.moves.sort((a,b)=> b.score - a.score);
          if (moveList.moves.length===0) return {x:-1,y:-1};
          if (moveList.moves[0].score >= 1200){ moveList.moves = [moveList.moves[0]]; }
          moveList.n = moveList.moves.length; moveList.index = 0;
          if (!moveList.isFirst && moveList.hasHashMove){
            moveList.moves = moveList.moves.filter(m => !(m.pos.x===moveList.hashMove.x && m.pos.y===moveList.hashMove.y));
            moveList.n = moveList.moves.length;
          }
        }
        break;
      case 2:
        if (moveList.index < moveList.n){ const move = moveList.moves[moveList.index].pos; moveList.index++; return move; }
        moveList.phase = 3; break;
      case 3:
      default:
        return {x:-1,y:-1};
    }
    return this.getNextMove(moveList);
  }
  negamax(depth, alpha, beta, pv){
    this.searchNodes++;
    if (this.checkWin() !== this.PieceType.Empty){ return [-10000 + this.ply, []]; }
    if (this.hashTable.has(this.zobristKey)){
      const entry = this.hashTable.get(this.zobristKey);
      if (entry.key === this.zobristKey){
        let adjusted = entry.score;
        if (adjusted >= 9775) adjusted -= this.ply;
        if (adjusted <= -9775) adjusted += this.ply;
        if (entry.depth >= depth || adjusted >= 9775 || adjusted <= -9775){
          if (entry.flag === 0 && !(adjusted >= 9775 || adjusted <= -9775)) return [adjusted, entry.pv];
          else if (entry.flag === 1 && adjusted <= alpha) return [adjusted, entry.pv];
          else if (entry.flag === 2 && adjusted >= beta) return [adjusted, entry.pv];
        }
      }
    }
    const ev = this.evaluate(this.currentPlayer===this.PieceType.Black?1:0);
    let score = ev[0], expand = ev[1];
    if (score >= 9997) score -= this.ply;
    if (score <= -9997) score += this.ply;
    if (depth <= 0 || (this.ply > 0 && (score + this.ply >= 9997 || score - this.ply <= -9998))){ return [score, []]; }
    const moveList = { phase:0, hashMove:{x:-1,y:-1}, moves:[], index:0, n:0, isFirst:true, hasHashMove:false };
    let bestScore = -10000; let bestPV = []; let hashFlag = 1; let moveCount = 0;
    this.ply++;
    let move;
    while ((move = this.getNextMove(moveList)).x !== -1){
      this.makeMove(move);
      let currentScore, currentPV;
      if (moveCount === 0){
        const r = this.negamax(expand ? depth : depth - 1, -beta, -alpha, []);
        currentScore = -r[0]; currentPV = r[1];
      } else {
        const r = this.negamax(expand ? depth : depth - 1, -alpha-1, -alpha, []);
        currentScore = -r[0]; currentPV = r[1];
        if (currentScore > alpha && currentScore < beta){ const fr = this.negamax(expand ? depth : depth - 1, -beta, -alpha, []); currentScore = -fr[0]; currentPV = fr[1]; }
      }
      this.undoMove(); moveCount++;
      if (currentScore > bestScore){ bestScore = currentScore; bestPV = [move].concat(currentPV); }
      if (currentScore > alpha){ alpha = currentScore; hashFlag = 0; }
      if (alpha >= beta){ hashFlag = 2; break; }
      moveList.isFirst = false;
    }
    this.ply--;
    if (moveCount === 0) return [0, bestPV];
    let adjustedScore = bestScore;
    if (bestScore >= 9997) adjustedScore = bestScore + this.ply; else if (bestScore <= -9997) adjustedScore = bestScore - this.ply;
    const entry = { key: this.zobristKey, depth, score: adjustedScore, bestMove: bestPV.length?bestPV[0]:{x:-1,y:-1}, flag: hashFlag, pv: bestPV };
    this.hashTable.set(this.zobristKey, entry);
    return [bestScore, bestPV];
  }
  addLayerInfo(depth, score, nodes, time, bestMove, pv){
    const moveStr = (bestMove && bestMove.x>=0 && bestMove.y>=0) ? (String.fromCharCode(97 + bestMove.y) + (this.size.height - bestMove.x)) : 'none';
    const pvStr = pv.map(p => String.fromCharCode(97 + p.y) + (this.size.height - p.x)).join(' ');
    const line = 'Depth ' + depth + ': Move=' + moveStr + ', Score=' + score + ', Nodes=' + nodes + ', Time=' + time + 'ms, PV=' + pvStr;
    if (this.progressCallback){ try { this.progressCallback(depth, score, nodes, time, bestMove, pv.slice()); } catch(e){} }
    this.searchLayerInfo.push(line);
  }
  getBestMove(maxDepth){
    const start = Date.now();
    this.searchNodes = 0;
    this.hashTable.clear();
    this.ply = 0;
    this.searchLayerInfo = [];
    const bestResult = { bestMove:{x:-1,y:-1}, score:0, depth:0, pv:[], nodes:0, time:0, moveScores:[], layerInfo:[] };
    for (let depth=1; depth<=maxDepth; depth++){
      const layerStartNodes = this.searchNodes;
      const layerStartTime = Date.now();
      const r = this.negamax(depth, -10000, 10000, []);
      const now = Date.now();
      const elapsed = now - start;
      const layerTime = now - layerStartTime;
      bestResult.bestMove = r[1].length ? r[1][0] : {x:-1,y:-1};
      bestResult.score = r[0];
      bestResult.depth = depth;
      bestResult.pv = r[1];
      bestResult.nodes = this.searchNodes;
      bestResult.time = elapsed;
      this.addLayerInfo(depth, r[0], this.searchNodes - layerStartNodes, layerTime, bestResult.bestMove, bestResult.pv);
    }
    bestResult.layerInfo = this.searchLayerInfo.slice();
    return bestResult;
  }
  checkWin(){ return this.winner; }
  getMoveScores(){ const moves = this.generateAllMoves(); const arr=[]; for (const pos of moves){ arr.push({ pos, score: this.evaluatePosition(pos) }); } arr.sort((a,b)=> b.score - a.score); return arr; }
  getBoard(){ const result = new Array(this.size.height); for (let i=0;i<this.size.height;i++){ result[i] = new Array(this.size.width); for (let j=0;j<this.size.width;j++){ result[i][j] = this.board[i + this.BOARD_PADDING][j + this.BOARD_PADDING].piece; } } return result; }
  getCurrentPlayer(){ return this.currentPlayer; }
  getMoveHistory(){ return this.moveHistory.slice(); }
  reset(){ this.initBoard(); this.currentPlayer = this.PieceType.Black; this.moveHistory = []; this.zobristKey = 0; this.hashTable.clear(); this.searchNodes = 0; this.winner = this.PieceType.Empty; this.resetNeighbors(); }
  setProgressCallback(cb){ this.progressCallback = cb; }
  resetNeighbors(){ this.neighbors = new Array(this.size.height); for (let r=0;r<this.size.height;r++){ this.neighbors[r] = new Array(this.size.width); for (let c=0;c<this.size.width;c++){ this.neighbors[r][c] = 0; } } }
  updateNeighbors(r,c,delta){ const rays = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]; for (let t=0;t<rays.length;t++){ const dr=rays[t][0], dc=rays[t][1]; for (let k=1;k<=3;k++){ const nr=r+dr*k, nc=c+dc*k; if (nr>=0&&nr<this.size.height&&nc>=0&&nc<this.size.width) this.neighbors[nr][nc]+=delta; } } const knights = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]; for (let i=0;i<knights.length;i++){ const nr=r+knights[i][0], nc=c+knights[i][1]; if (nr>=0&&nr<this.size.height&&nc>=0&&nc<this.size.width) this.neighbors[nr][nc]+=delta; } }
  rebuildNeighborsFromBoard(){ this.resetNeighbors(); for (let r=0;r<this.size.height;r++){ for (let c=0;c<this.size.width;c++){ const piece = this.board[r + this.BOARD_PADDING][c + this.BOARD_PADDING].piece; if (piece !== this.PieceType.Empty && piece !== this.PieceType.Outside){ this.updateNeighbors(r,c, +1); } } } }
}
self.ConnectFourEngine = ConnectFourEngine;
