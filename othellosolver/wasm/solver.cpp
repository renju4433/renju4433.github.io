#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include <math.h>
#include <vector>
#include <algorithm>
#include <random>

static const int BLACK = 1;
static const int WHITE = 2;
static const int EMPTY = 0;
static const int MAX_DEPTH_BUFFER = 64;

static std::vector<int8_t> GLOBAL_MOVES(MAX_DEPTH_BUFFER * 64);
static std::vector<double> GLOBAL_SORT_SCORES(MAX_DEPTH_BUFFER * 64);
static std::vector<int32_t> KILLER_MOVES(MAX_DEPTH_BUFFER * 2, -1);
static std::vector<int32_t> HISTORY_TABLE(2 * 64, 0);
static int8_t DIR_R[8] = {-1,-1,-1,0,0,1,1,1};
static int8_t DIR_C[8] = {-1,0,1,-1,1,-1,0,1};
static std::vector<int32_t> GLOBAL_FLIP_STACK(5000);
static std::vector<uint8_t> GLOBAL_STABLE_MAP(64);
static std::vector<int32_t> GLOBAL_REGION_STACK(64);
static std::vector<int32_t> GLOBAL_MOD_STACK(20);
static std::vector<int32_t> GLOBAL_MOD_VALS(20);

static int8_t WEIGHT_MAP[64] = {
    100, -20, 10,  5,  5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
     10,  -2,  1,  1,  1,  1,  -2,  10,
      5,  -2,  1,  2,  2,  1,  -2,   5,
      5,  -2,  1,  2,  2,  1,  -2,   5,
     10,  -2,  1,  1,  1,  1,  -2,  10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10,  5,  5, 10, -20, 100
};

static uint64_t ZOBRIST[128];
static const uint64_t ZOBRIST_SIDE = 0xABCDABCDABCDABCDULL;

static const int TT_SIZE = 0x800000;
static const uint64_t TT_MASK = (uint64_t)TT_SIZE - 1;
static std::vector<uint64_t> TT_KEY(TT_SIZE, 0);
static std::vector<double> TT_VAL(TT_SIZE, 0.0);
static std::vector<int8_t> TT_DEPTH(TT_SIZE, 0);
static std::vector<uint8_t> TT_FLAG(TT_SIZE, 0);
static std::vector<uint8_t> TT_MOVE(TT_SIZE, 255);

static const uint8_t FLAG_EMPTY = 0;
static const uint8_t FLAG_EXACT = 1;
static const uint8_t FLAG_LOWER = 2;
static const uint8_t FLAG_UPPER = 3;

struct Weights { int div; int mob; int stable; int flip; int parity; };
static Weights weights = {28,24,32,22,12};
static bool useHardConstraints = false;
static int currentReqId = -1;
static int rootPlayer = 0;
static volatile int shouldStop = 0;
static int currentSearchLevel = 0;
static int lastWasEndgame = 0;

static inline int opp(int p){ return p==BLACK?WHITE:BLACK; }

static void init_zobrist() {
  static bool inited = false;
  if (inited) return;
  std::mt19937_64 rng(0x12345678ULL);
  for (int i=0;i<128;i++) ZOBRIST[i] = rng();
  inited = true;
}

extern "C" {
EMSCRIPTEN_KEEPALIVE
void solver_set_weights(int div, int mob, int stable, int flip, int parity) {
  weights.div = div; weights.mob = mob; weights.stable = stable; weights.flip = flip; weights.parity = parity;
}

EMSCRIPTEN_KEEPALIVE
void solver_set_hard_constraints(int flag) {
  useHardConstraints = flag != 0;
}

EMSCRIPTEN_KEEPALIVE
void solver_reset(int reqId) {
  if (reqId != currentReqId) {
    currentReqId = reqId;
    std::fill(HISTORY_TABLE.begin(), HISTORY_TABLE.end(), 0);
    std::fill(KILLER_MOVES.begin(), KILLER_MOVES.end(), -1);
  }
  shouldStop = 0;
  lastWasEndgame = 0;
}

EMSCRIPTEN_KEEPALIVE
void solver_stop() {
  shouldStop = 1;
}
}

static int count_empty(const int8_t* board) {
  int c=0; for(int i=0;i<64;i++) if(board[i]==EMPTY) c++; return c;
}

static bool fast_is_valid_move(const int8_t* board, int idx, int player) {
  if (idx < 0 || idx >= 64) return false;
  if (board[idx]!=EMPTY) return false;
  int oppv = opp(player);
  int r = idx>>3, c = idx&7;
  for(int d=0; d<8; d++){
    int dr = DIR_R[d], dc = DIR_C[d];
    int nr = r+dr, nc = c+dc;
    bool hasOpp=false;
    while(nr>=0&&nr<8&&nc>=0&&nc<8){
      int nIdx = (nr<<3)|nc;
      int v = board[nIdx];
      if(v==oppv){ hasOpp=true; nr+=dr; nc+=dc; }
      else if(v==player){ if(hasOpp) return true; break; }
      else break;
    }
  }
  return false;
}

static bool can_move_at(const int8_t* board, int idx, int player) {
  if (idx<0||idx>=64) return false;
  if(board[idx]!=EMPTY) return false;
  int oppv = opp(player);
  int r = idx>>3, c = idx&7;
  for(int d=0; d<8; d++){
    int dr = DIR_R[d], dc = DIR_C[d];
    int nr = r+dr, nc = c+dc;
    bool hasOpp=false;
    while(nr>=0&&nr<8&&nc>=0&&nc<8){
      int nIdx = (nr<<3)|nc;
      int v = board[nIdx];
      if(v==oppv){ hasOpp=true; nr+=dr; nc+=dc; }
      else if(v==player){ if(hasOpp) return true; break; }
      else break;
    }
  }
  return false;
}

static int populate_valid_moves(const int8_t* board, int player, int bufferOffset) {
  int count=0;
  for(int i=0;i<64;i++){
    if (can_move_at(board,i,player)) { GLOBAL_MOVES[bufferOffset+count]=i; count++; }
  }
  return count;
}

static int get_move_count(const int8_t* board, int player) {
  int count=0;
  for(int i=0;i<64;i++){
    if (useHardConstraints) { if(i==9||i==14||i==49||i==54) continue; }
    if (fast_is_valid_move(board,i,player)) count++;
  }
  return count;
}

static int populate_pruned_moves(const int8_t* board, int player, int bufferOffset) {
  int count=0;
  for(int i=0;i<64;i++){
    if (useHardConstraints) { if(i==9||i==14||i==49||i==54) continue; }
    if (can_move_at(board,i,player)) { GLOBAL_MOVES[bufferOffset+count]=i; count++; }
  }
  return count;
}

struct ApplyRes { int count; uint64_t hash; };

static ApplyRes apply_move(int8_t* board, int idx, int player, int stackOffset, uint64_t currentHash) {
  int flipCount=0;
  board[idx]=player;
  int rStart=idx>>3, cStart=idx&7;
  uint64_t nextHash = currentHash ^ ZOBRIST[(player==BLACK?0:64)+idx];
  int oppv = opp(player);
  int oppOffset = (oppv==BLACK?0:64);
  int myOffset = (player==BLACK?0:64);
  for(int d=0; d<8; d++){
    int dr=DIR_R[d], dc=DIR_C[d];
    int nr=rStart+dr, nc=cStart+dc;
    int potential=0;
    while(nr>=0&&nr<8&&nc>=0&&nc<8 && board[(nr<<3)|nc]==oppv){ potential++; nr+=dr; nc+=dc; }
    if(nr>=0&&nr<8&&nc>=0&&nc<8 && board[(nr<<3)|nc]==player && potential>0){
      int rFlip=rStart+dr, cFlip=cStart+dc;
      for(int i=0;i<potential;i++){
        int pos=(rFlip<<3)|cFlip;
        board[pos]=player;
        GLOBAL_FLIP_STACK[stackOffset+flipCount]=pos;
        flipCount++;
        nextHash ^= ZOBRIST[oppOffset+pos];
        nextHash ^= ZOBRIST[myOffset+pos];
        rFlip+=dr; cFlip+=dc;
      }
    }
  }
  return {flipCount,nextHash};
}

static void undo_move(int8_t* board, int idx, int count, int stackOffset, int player) {
  board[idx]=EMPTY;
  int oppv=opp(player);
  for(int i=0;i<count;i++){
    int pos = GLOBAL_FLIP_STACK[stackOffset+i];
    board[pos]=oppv;
  }
}

static int calc_local_div(const int8_t* board, int idx){
  int r=idx>>3, c=idx&7, d=0;
  for(int k=0;k<8;k++){
    int nr=r+DIR_R[k], nc=c+DIR_C[k];
    if(nr>=0&&nr<8&&nc>=0&&nc<8){
      if(board[(nr<<3)|nc]==EMPTY) d++;
    }
  }
  return d;
}

static int calc_total_div(const int8_t* board, int player, int exclIdx){
  int t=0;
  for(int i=0;i<64;i++){
    if(board[i]==player){
      if(exclIdx!=-1 && i==exclIdx) continue;
      t += calc_local_div(board,i);
    }
  }
  return t;
}

static int calc_closed_parity(const int8_t* board){
  uint64_t visited = 0ULL;
  int score=0;
  for(int i=0;i<64;i++){
    if(board[i]==EMPTY){
      if(visited & (1ULL<<i)) continue;
      int count=0;
      int stackPtr=0;
      bool hasBlack=false, hasWhite=false;
      GLOBAL_REGION_STACK[stackPtr++]=i;
      visited |= (1ULL<<i);
      count++;
      while(stackPtr>0){
        int curr = GLOBAL_REGION_STACK[--stackPtr];
        int r=curr>>3, c=curr&7;
        if(r>0){
          int idx=((r-1)<<3)|c;
          int val=board[idx];
          if(val==EMPTY){ if(!(visited&(1ULL<<idx))){ visited|=(1ULL<<idx); GLOBAL_REGION_STACK[stackPtr++]=idx; count++; } }
          else if(val==BLACK) hasBlack=true;
          else if(val==WHITE) hasWhite=true;
        }
        if(r<7){
          int idx=((r+1)<<3)|c;
          int val=board[idx];
          if(val==EMPTY){ if(!(visited&(1ULL<<idx))){ visited|=(1ULL<<idx); GLOBAL_REGION_STACK[stackPtr++]=idx; count++; } }
          else if(val==BLACK) hasBlack=true;
          else if(val==WHITE) hasWhite=true;
        }
        if(c>0){
          int idx=(r<<3)|(c-1);
          int val=board[idx];
          if(val==EMPTY){ if(!(visited&(1ULL<<idx))){ visited|=(1ULL<<idx); GLOBAL_REGION_STACK[stackPtr++]=idx; count++; } }
          else if(val==BLACK) hasBlack=true;
          else if(val==WHITE) hasWhite=true;
        }
        if(c<7){
          int idx=(r<<3)|(c+1);
          int val=board[idx];
          if(val==EMPTY){ if(!(visited&(1ULL<<idx))){ visited|=(1ULL<<idx); GLOBAL_REGION_STACK[stackPtr++]=idx; count++; } }
          else if(val==BLACK) hasBlack=true;
          else if(val==WHITE) hasWhite=true;
        }
      }
      if(hasBlack && hasWhite){ score += (count & 1) ? 1 : -1; }
    }
  }
  return score;
}

static int get_stable_count(const int8_t* board, int player, const int* forcedCorners) {
  std::fill(GLOBAL_STABLE_MAP.begin(), GLOBAL_STABLE_MAP.end(), 0);
  int total=0;
  int corners[4]={0,7,56,63};
  int dirs[4][2]={{1,8},{-1,8},{1,-8},{-1,-8}};
  for(int i=0;i<4;i++){
    int cIdx=corners[i];
    int p=board[cIdx];
    if(forcedCorners){ if(forcedCorners[cIdx]!=-3){ p = forcedCorners[cIdx]; } }
    if(p!=player) continue;
    if(GLOBAL_STABLE_MAP[cIdx]==0){ GLOBAL_STABLE_MAP[cIdx]=1; total++; }
    int d1=dirs[i][0];
    int d2=dirs[i][1];
    int curr=cIdx+d1;
    for(int k=0;k<7;k++){
      if(board[curr]==player && GLOBAL_STABLE_MAP[curr]==0){ GLOBAL_STABLE_MAP[curr]=1; total++; } else break;
      curr+=d1;
    }
    curr=cIdx+d2;
    for(int k=0;k<7;k++){
      if(board[curr]==player && GLOBAL_STABLE_MAP[curr]==0){ GLOBAL_STABLE_MAP[curr]=1; total++; } else break;
      curr+=d2;
    }
  }
  return total;
}

static int eval_disc(const int8_t* board, int player){
  int m=0,o=0, oppv=opp(player);
  for(int i=0;i<64;i++){ int v=board[i]; if(v==player) m++; else if(v==oppv) o++; }
  return m-o;
}

static double solve_endgame(int8_t* board, int player, double alpha, double beta, int emptyCount, uint64_t hash){
  uint64_t ttKey = hash ^ (player==WHITE ? ZOBRIST_SIDE : 0ULL);
  size_t ttIndex = (size_t)(ttKey & TT_MASK);
  if(TT_KEY[ttIndex]==ttKey && TT_DEPTH[ttIndex]==emptyCount){
    if(TT_FLAG[ttIndex]==FLAG_EXACT) return TT_VAL[ttIndex];
    if(TT_FLAG[ttIndex]==FLAG_LOWER){ if(TT_VAL[ttIndex] > alpha) alpha = TT_VAL[ttIndex]; }
    else if(TT_FLAG[ttIndex]==FLAG_UPPER){ if(TT_VAL[ttIndex] < beta) beta = TT_VAL[ttIndex]; }
    if(alpha>=beta) return TT_VAL[ttIndex];
  }
  int bufferOffset = emptyCount * 64;
  int moveCount = populate_valid_moves(board, player, bufferOffset);
  if(moveCount==0){
    int oppv = opp(player);
    if(populate_valid_moves(board, oppv, 60*64)==0) return (double)eval_disc(board, player);
    return -solve_endgame(board, oppv, -beta, -alpha, emptyCount, hash);
  }
  int ttMove = (TT_MOVE[ttIndex]!=255) ? TT_MOVE[ttIndex] : -1;
  for(int i=0;i<moveCount;i++){
    int m = GLOBAL_MOVES[bufferOffset+i];
    double s = (double)WEIGHT_MAP[m];
    if(m==ttMove) s += 10000.0;
    GLOBAL_SORT_SCORES[bufferOffset+i]=s;
  }
  for(int i=0;i<moveCount-1;i++){
    for(int j=0;j<moveCount-i-1;j++){
      int idx1=bufferOffset+j, idx2=bufferOffset+j+1;
      if(GLOBAL_SORT_SCORES[idx1] < GLOBAL_SORT_SCORES[idx2]){
        double tS = GLOBAL_SORT_SCORES[idx1]; GLOBAL_SORT_SCORES[idx1]=GLOBAL_SORT_SCORES[idx2]; GLOBAL_SORT_SCORES[idx2]=tS;
        int8_t tM = GLOBAL_MOVES[idx1]; GLOBAL_MOVES[idx1]=GLOBAL_MOVES[idx2]; GLOBAL_MOVES[idx2]=tM;
      }
    }
  }
  double alphaOrig = alpha;
  double best = -INFINITY;
  int bestMove=-1;
  int stackOffset = emptyCount * 30;
  for(int i=0;i<moveCount;i++){
    int m = GLOBAL_MOVES[bufferOffset+i];
    ApplyRes res = apply_move(board,m,player,stackOffset,hash);
    double val = -solve_endgame(board, opp(player), -beta, -alpha, emptyCount-1, res.hash);
    undo_move(board,m,res.count,stackOffset,player);
    if(val>best){ best=val; bestMove=m; }
    if(val>alpha) alpha=val;
    if(alpha>=beta) break;
  }
  if(TT_KEY[ttIndex]!=ttKey || emptyCount >= TT_DEPTH[ttIndex]){
    TT_KEY[ttIndex]=ttKey;
    TT_VAL[ttIndex]=best;
    TT_DEPTH[ttIndex]=emptyCount;
    if(bestMove!=-1) TT_MOVE[ttIndex]=(uint8_t)bestMove;
    if(best<=alphaOrig) TT_FLAG[ttIndex]=FLAG_UPPER;
    else if(best>=beta) TT_FLAG[ttIndex]=FLAG_LOWER;
    else TT_FLAG[ttIndex]=FLAG_EXACT;
  }
  return best;
}

static double eval_hybrid(int8_t* board, int player, int lastMoveIdx, int lastCount){
  int oppv = opp(player);
  int forcedCornersArr[64]; for(int i=0;i<64;i++) forcedCornersArr[i] = -3;
  if(lastMoveIdx!=-1){
    if(lastMoveIdx==9) forcedCornersArr[0]=player;
    else if(lastMoveIdx==14) forcedCornersArr[7]=player;
    else if(lastMoveIdx==49) forcedCornersArr[56]=player;
    else if(lastMoveIdx==54) forcedCornersArr[63]=player;
  }
  int myDiv = calc_total_div(board, player, lastMoveIdx);
  int oppDiv = calc_total_div(board, oppv, lastMoveIdx);
  int scoreDiv = (oppDiv - myDiv);
  int myMob = get_move_count(board, player);
  int oppMob = get_move_count(board, oppv);
  int scoreMob = (myMob - oppMob);
  int modCount=0;
  if(lastMoveIdx!=-1){
    int cCorner=-1; int dr=0, dc=0;
    if(lastMoveIdx==1){ cCorner=0; dr=0; dc=1; }
    else if(lastMoveIdx==8){ cCorner=0; dr=1; dc=0; }
    else if(lastMoveIdx==6){ cCorner=7; dr=0; dc=-1; }
    else if(lastMoveIdx==15){ cCorner=7; dr=1; dc=0; }
    else if(lastMoveIdx==48){ cCorner=56; dr=-1; dc=0; }
    else if(lastMoveIdx==57){ cCorner=56; dr=0; dc=1; }
    else if(lastMoveIdx==55){ cCorner=63; dr=0; dc=-1; }
    else if(lastMoveIdx==62){ cCorner=63; dr=-1; dc=0; }
    if(cCorner!=-1 && board[cCorner]==EMPTY){
      int r=lastMoveIdx>>3, c=lastMoveIdx&7;
      int nr=r+dr, nc=c+dc;
      bool connected=false;
      while(nr>=0&&nr<8&&nc>=0&&nc<8){
        int idx=(nr<<3)|nc;
        if(board[idx]==EMPTY) break;
        if(board[idx]==oppv){ connected=true; break; }
        nr+=dr; nc+=dc;
      }
      if(connected){
        GLOBAL_MOD_STACK[modCount]=cCorner;
        GLOBAL_MOD_VALS[modCount]=board[cCorner];
        board[cCorner]=oppv;
        modCount++;
        nr=lastMoveIdx>>3; nc=lastMoveIdx&7;
        while(nr>=0&&nr<8&&nc>=0&&nc<8){
          int idx=(nr<<3)|nc;
          if(board[idx]==oppv) break;
          GLOBAL_MOD_STACK[modCount]=idx;
          GLOBAL_MOD_VALS[modCount]=board[idx];
          board[idx]=oppv;
          modCount++;
          nr+=dr; nc+=dc;
        }
      }
    }
  }
  int myStable = get_stable_count(board, player, forcedCornersArr);
  int oppStable = get_stable_count(board, oppv, forcedCornersArr);
  while(modCount>0){
    modCount--;
    board[GLOBAL_MOD_STACK[modCount]] = GLOBAL_MOD_VALS[modCount];
  }
  double scoreStable = (double)(myStable - oppStable) * 4.0;
  int scoreParity = calc_closed_parity(board);
  int forcedFlips = lastCount>0?lastCount:0;
  double res = (scoreDiv * (weights.div/100.0)) +
               (forcedFlips * (weights.flip/100.0)) +
               (scoreStable * (weights.stable/100.0)) +
               (scoreMob * (weights.mob/100.0)) +
               (scoreParity * (weights.parity/100.0) * 10.0);
  return res;
}

static double negamax_hybrid(int8_t* board, int player, int depth, double alpha, double beta, int lastMoveIdx, int lastCount, uint64_t hash){
  currentSearchLevel++;
  uint64_t ttKey = hash ^ (player==WHITE ? ZOBRIST_SIDE : 0ULL);
  size_t ttIndex = (size_t)(ttKey & TT_MASK);
  if(TT_KEY[ttIndex]==ttKey && TT_DEPTH[ttIndex]>=depth){
    if(TT_FLAG[ttIndex]==FLAG_EXACT) return TT_VAL[ttIndex];
    if(TT_FLAG[ttIndex]==FLAG_LOWER){ if(TT_VAL[ttIndex]>alpha) alpha = TT_VAL[ttIndex]; }
    else if(TT_FLAG[ttIndex]==FLAG_UPPER){ if(TT_VAL[ttIndex]<beta) beta = TT_VAL[ttIndex]; }
    if(alpha>=beta) return TT_VAL[ttIndex];
  }
  if(depth==0){
    double rv = eval_hybrid(board, player, lastMoveIdx, lastCount);
    currentSearchLevel--;
    return rv;
  }
  int ttMove = (TT_MOVE[ttIndex]!=255) ? TT_MOVE[ttIndex] : -1;
  if(ttMove==-1 && depth>=6){
    int iidDepth = depth - 4;
    (void)negamax_hybrid(board, player, iidDepth, -beta, -alpha, lastMoveIdx, lastCount, hash);
    ttMove = (TT_MOVE[ttIndex]!=255) ? TT_MOVE[ttIndex] : -1;
  }
  int bufferOffset = depth * 64;
  int moveCount = populate_pruned_moves(board, player, bufferOffset);
  if(moveCount==0){
    int oppv = opp(player);
    if(populate_pruned_moves(board, oppv, 62*64)==0){
      double rv = (double)eval_disc(board, player);
      currentSearchLevel--;
      return rv;
    }
    double rv = -negamax_hybrid(board, oppv, depth-1, -beta, -alpha, -1, 0, hash);
    currentSearchLevel--;
    return rv;
  }
  int k1 = KILLER_MOVES[depth*2];
  int k2 = KILLER_MOVES[depth*2+1];
  int pOffset = (player==BLACK?0:64);
  for(int i=0;i<moveCount;i++){
    int m = GLOBAL_MOVES[bufferOffset+i];
    double s = (double)WEIGHT_MAP[m];
    if(m==ttMove) s += 10000.0;
    else if(m==k1 || m==k2) s += 5000.0;
    else s += (double)HISTORY_TABLE[pOffset+m];
    GLOBAL_SORT_SCORES[bufferOffset+i]=s;
  }
  for(int i=0;i<moveCount-1;i++){
    for(int j=0;j<moveCount-i-1;j++){
      int idx1=bufferOffset+j, idx2=bufferOffset+j+1;
      if(GLOBAL_SORT_SCORES[idx1] < GLOBAL_SORT_SCORES[idx2]){
        double tS = GLOBAL_SORT_SCORES[idx1]; GLOBAL_SORT_SCORES[idx1]=GLOBAL_SORT_SCORES[idx2]; GLOBAL_SORT_SCORES[idx2]=tS;
        int8_t tM = GLOBAL_MOVES[idx1]; GLOBAL_MOVES[idx1]=GLOBAL_MOVES[idx2]; GLOBAL_MOVES[idx2]=tM;
      }
    }
  }
  double alphaOrig = alpha;
  double best = -INFINITY;
  int bestMove=-1;
  int stackOffset = depth * 64;
  for(int i=0;i<moveCount;i++){
    int m=GLOBAL_MOVES[bufferOffset+i];
    ApplyRes res = apply_move(board,m,player,stackOffset,hash);
    double val;
    bool needsFullSearch=true;
    if(depth>=3 && i>=6){
      int R=2;
      val = -negamax_hybrid(board, opp(player), depth-1-R, -alpha-1, -alpha, m, res.count, res.hash);
      if(val<=alpha) needsFullSearch=false;
    }
    if(needsFullSearch){
      if(i==0){
        val = -negamax_hybrid(board, opp(player), depth-1, -beta, -alpha, m, res.count, res.hash);
      } else {
        val = -negamax_hybrid(board, opp(player), depth-1, -alpha-1, -alpha, m, res.count, res.hash);
        if(val>alpha && val<beta){
          val = -negamax_hybrid(board, opp(player), depth-1, -beta, -alpha, m, res.count, res.hash);
        }
      }
    }
    undo_move(board,m,res.count,stackOffset,player);
    if(val>best){ best=val; bestMove=m; }
    if(val>alpha) alpha=val;
    if(alpha>=beta){
      int kIdx = depth*2;
      if(KILLER_MOVES[kIdx]!=m){
        KILLER_MOVES[kIdx+1]=KILLER_MOVES[kIdx];
        KILLER_MOVES[kIdx]=m;
      }
      HISTORY_TABLE[pOffset+m] += depth*depth;
      if(HISTORY_TABLE[pOffset+m] > 2000000){
        for(int k=0;k<128;k++) HISTORY_TABLE[k] >>= 1;
      }
      break;
    }
  }
  if(TT_KEY[ttIndex]!=ttKey || depth >= TT_DEPTH[ttIndex]){
    TT_KEY[ttIndex]=ttKey;
    TT_VAL[ttIndex]=best;
    TT_DEPTH[ttIndex]=depth;
    if(bestMove!=-1) TT_MOVE[ttIndex]=(uint8_t)bestMove;
    if(best<=alphaOrig) TT_FLAG[ttIndex]=FLAG_UPPER;
    else if(best>=beta) TT_FLAG[ttIndex]=FLAG_LOWER;
    else TT_FLAG[ttIndex]=FLAG_EXACT;
  }
  currentSearchLevel--;
  return best;
}

static double calc_score(int8_t* board, int player, int moveIdx, int depth, double alpha, double beta, uint64_t rootHash){
  currentSearchLevel = 0;
  lastWasEndgame = 0;
  int stackOffset = 4000;
  ApplyRes res = apply_move(board, moveIdx, player, stackOffset, rootHash);
  int eCountAfterMove = count_empty(board);
  if(eCountAfterMove<=15){
    int nextPlayer = opp(player);
    double valEnd = -solve_endgame(board, nextPlayer, -INFINITY, -alpha, eCountAfterMove, res.hash);
    undo_move(board, moveIdx, res.count, stackOffset, player);
    lastWasEndgame = 1;
    return valEnd;
  }
  int oppv = opp(player);
  double val = -negamax_hybrid(board, oppv, depth-1, -beta, -alpha, moveIdx, res.count, res.hash);
  if(useHardConstraints){
    int opCount = populate_valid_moves(board, oppv, 61*64);
    int opBufferOffset = 61*64;
    for(int i=0;i<opCount;i++){
      if(calc_local_div(board, GLOBAL_MOVES[opBufferOffset+i])==1){
        if(val>0) val *= 0.78; else if(val<0) val /= 0.78;
        break;
      }
    }
    bool hitStar=false;
    for(int i=0;i<res.count;i++){
      int pos = GLOBAL_FLIP_STACK[stackOffset+i];
      if(pos==9||pos==14||pos==49||pos==54){ hitStar=true; break; }
    }
    if(hitStar){
      if(val>0) val *= 0.75;
      else if(val<0) val /= 0.75;
      else val -= 200.0;
    }
  }
  undo_move(board, moveIdx, res.count, stackOffset, player);
  if(eCountAfterMove==0){ lastWasEndgame = 1; }
  if(useHardConstraints){
    int r=moveIdx>>3, c=moveIdx&7;
    if((r==1&&c==1)||(r==6&&c==1)||(r==1&&c==6)||(r==6&&c==6)){
      int eCount = count_empty(board);
      double factor = (eCount>18 && eCount<=26) ? 0.86 : 0.56;
      if(val>0) val *= factor;
      else if(val<0) val /= factor;
    }
  }
  return val;
}

static double search_root(int8_t* board, int player, int moveIdx, int maxDepth, uint64_t rootHash){
  double bestVal=-INFINITY;
  for(int d=1; d<=maxDepth; d++){
    if(d>=3 && fabs(bestVal) < 10000.0){
      double window = 25.0;
      double alpha = bestVal - window;
      double beta = bestVal + window;
      double val = calc_score(board, player, moveIdx, d, alpha, beta, rootHash);
      if(val<=alpha) val = calc_score(board, player, moveIdx, d, -INFINITY, alpha, rootHash);
      else if(val>=beta) val = calc_score(board, player, moveIdx, d, beta, INFINITY, rootHash);
      bestVal=val;
    } else {
      bestVal = calc_score(board, player, moveIdx, d, -INFINITY, INFINITY, rootHash);
    }
    EM_ASM({
      postMessage({ type: 'result_depth', x: $0, y: $1, val: $2, depth: $3, reqId: $4, is_endgame: $5 });
    }, (moveIdx>>3), (moveIdx&7), bestVal, d, currentReqId, lastWasEndgame);
    if (shouldStop) break;
  }
  return bestVal;
}

static uint64_t compute_root_hash(const int8_t* board){
  uint64_t h=0ULL;
  for(int i=0;i<64;i++){
    int p=board[i];
    if(p==BLACK) h ^= ZOBRIST[i];
    else if(p==WHITE) h ^= ZOBRIST[64+i];
  }
  return h;
}

extern "C" {
EMSCRIPTEN_KEEPALIVE
double solver_calc_score(int board_ptr, int player, int moveIdx, int depth, double alpha, double beta){
  init_zobrist();
  int8_t* board = (int8_t*)board_ptr;
  uint64_t rootHash = compute_root_hash(board);
  return calc_score(board, player, moveIdx, depth, alpha, beta, rootHash);
}

EMSCRIPTEN_KEEPALIVE
double solver_search_root(int board_ptr, int player, int moveIdx, int maxDepth){
  init_zobrist();
  int8_t* board = (int8_t*)board_ptr;
  uint64_t rootHash = compute_root_hash(board);
  return search_root(board, player, moveIdx, maxDepth, rootHash);
}

EMSCRIPTEN_KEEPALIVE
int solver_last_is_endgame(){
  return lastWasEndgame;
}

EMSCRIPTEN_KEEPALIVE
double solver_endgame_after_move(int board_ptr, int player, int moveIdx, double alpha){
  init_zobrist();
  int8_t* board = (int8_t*)board_ptr;
  uint64_t rootHash = compute_root_hash(board);
  int stackOffset = 4500;
  ApplyRes res = apply_move(board, moveIdx, player, stackOffset, rootHash);
  int eCount = count_empty(board);
  int nextPlayer = opp(player);
  double alphaParam = alpha;
  double val = -solve_endgame(board, nextPlayer, -INFINITY, -alphaParam, eCount, res.hash);
  undo_move(board, moveIdx, res.count, stackOffset, player);
  return val;
}
}
