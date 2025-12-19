#include <cstdint>
#include <vector>
#include <string>
#include <algorithm>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <chrono>
#include <cmath>

using namespace emscripten;

const uint64_t BLACK = 1;
const uint64_t WHITE = 2;

// Weights adjusted to be smaller for auxiliary factors
// Corner ~ 4 discs
// X-square ~ -2 discs
const double WEIGHTS[8][8] = {
    { 4.0, -2.0,  2.0,  1.0,  1.0,  2.0, -2.0,  4.0},
    {-2.0, -3.0, -0.5, -0.5, -0.5, -0.5, -3.0, -2.0},
    { 2.0, -0.5,  1.0,  0.5,  0.5,  1.0, -0.5,  2.0},
    { 1.0, -0.5,  0.5,  0.0,  0.0,  0.5, -0.5,  1.0},
    { 1.0, -0.5,  0.5,  0.0,  0.0,  0.5, -0.5,  1.0},
    { 2.0, -0.5,  1.0,  0.5,  0.5,  1.0, -0.5,  2.0},
    {-2.0, -3.0, -0.5, -0.5, -0.5, -0.5, -3.0, -2.0},
    { 4.0, -2.0,  2.0,  1.0,  1.0,  2.0, -2.0,  4.0}
};

struct MoveEval {
    int row;
    int col;
    double score;
    int player; // 1=Black, 2=White
};

class BitBoard {
public:
    uint64_t black;
    uint64_t white;

    BitBoard(uint64_t b, uint64_t w) : black(b), white(w) {}

    uint64_t get(int row, int col) const {
        uint64_t mask = 1ULL << (row * 8 + col);
        if (black & mask) return BLACK;
        if (white & mask) return WHITE;
        return 0;
    }

    void set(int row, int col, uint64_t value) {
        uint64_t mask = 1ULL << (row * 8 + col);
        black &= ~mask;
        white &= ~mask;
        if (value == BLACK) black |= mask;
        else if (value == WHITE) white |= mask;
    }

    int count(uint64_t player) const {
        uint64_t bits = (player == BLACK) ? black : white;
        int count = 0;
        while (bits) {
            count++;
            bits &= bits - 1;
        }
        return count;
    }
};

bool isValid(const BitBoard& board, int row, int col, uint64_t player) {
    if (board.get(row, col) != 0) return false;
    uint64_t opponent = (player == BLACK) ? WHITE : BLACK;
    int dirs[8][2] = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};

    for (auto& dir : dirs) {
        int r = row + dir[0];
        int c = col + dir[1];
        int count = 0;
        while (r >= 0 && r < 8 && c >= 0 && c < 8 && board.get(r, c) == opponent) {
            r += dir[0];
            c += dir[1];
            count++;
        }
        if (count > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board.get(r, c) == player) {
            return true;
        }
    }
    return false;
}

std::vector<std::pair<int, int>> getValidMoves(const BitBoard& board, uint64_t player) {
    std::vector<std::pair<int, int>> moves;
    for (int i = 0; i < 8; i++) {
        for (int j = 0; j < 8; j++) {
            if (isValid(board, i, j, player)) {
                moves.push_back({i, j});
            }
        }
    }
    return moves;
}

BitBoard makeMove(BitBoard board, int row, int col, uint64_t player) {
    board.set(row, col, player);
    uint64_t opponent = (player == BLACK) ? WHITE : BLACK;
    int dirs[8][2] = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};

    for (auto& dir : dirs) {
        int r = row + dir[0];
        int c = col + dir[1];
        std::vector<std::pair<int, int>> toFlip;
        while (r >= 0 && r < 8 && c >= 0 && c < 8 && board.get(r, c) == opponent) {
            toFlip.push_back({r, c});
            r += dir[0];
            c += dir[1];
        }
        if (r >= 0 && r < 8 && c >= 0 && c < 8 && board.get(r, c) == player && !toFlip.empty()) {
            for (auto& p : toFlip) {
                board.set(p.first, p.second, player);
            }
        }
    }
    return board;
}

// Helper for stability check
bool isStableDirection(int r, int c, int dr, int dc, const bool stableMap[8][8], uint64_t player, const BitBoard& board) {
    int nr1 = r - dr;
    int nc1 = c - dc;
    int nr2 = r + dr;
    int nc2 = c + dc;
    
    // Condition 1: One side connects to boundary or own stable disc
    bool side1Stable = false;
    if (nr1 < 0 || nr1 >= 8 || nc1 < 0 || nc1 >= 8) {
        side1Stable = true;
    } else if (board.get(nr1, nc1) == player && stableMap[nr1][nc1]) {
        side1Stable = true;
    }
    
    bool side2Stable = false;
    if (nr2 < 0 || nr2 >= 8 || nc2 < 0 || nc2 >= 8) {
        side2Stable = true;
    } else if (board.get(nr2, nc2) == player && stableMap[nr2][nc2]) {
        side2Stable = true;
    }
    
    if (side1Stable || side2Stable) return true;
    
    // Condition 2: Both sides connect to opponent stable discs
    uint64_t opp = (player == BLACK) ? WHITE : BLACK;
    bool side1OppStable = (nr1 >= 0 && nr1 < 8 && nc1 >= 0 && nc1 < 8 && 
                           board.get(nr1, nc1) == opp && stableMap[nr1][nc1]);
    bool side2OppStable = (nr2 >= 0 && nr2 < 8 && nc2 >= 0 && nc2 < 8 && 
                           board.get(nr2, nc2) == opp && stableMap[nr2][nc2]);
                           
    if (side1OppStable && side2OppStable) return true;
    
    return false;
}

double evaluate(const BitBoard& board, uint64_t player) {
    int blackCount = board.count(BLACK);
    int whiteCount = board.count(WHITE);
    int empty = 64 - blackCount - whiteCount;

    // Terminal state: return exact disc difference
    if (empty == 0 || (getValidMoves(board, BLACK).empty() && getValidMoves(board, WHITE).empty())) {
        return (double)(blackCount - whiteCount) * (player == BLACK ? 1.0 : -1.0);
    }

    uint64_t opponent = (player == BLACK) ? WHITE : BLACK;
    
    // Calculate Stability
    bool stableMap[8][8] = {false};
    bool changed = true;
    while(changed) {
        changed = false;
        for(int r=0; r<8; r++) {
            for(int c=0; c<8; c++) {
                uint64_t p = board.get(r, c);
                if(p != 0 && !stableMap[r][c]) {
                    // Check 4 directions: Horizontal, Vertical, Diagonal 1, Diagonal 2
                    int dirs[4][2] = {{0,1}, {1,0}, {1,1}, {1,-1}};
                    bool allStable = true;
                    for(auto& d : dirs) {
                        if(!isStableDirection(r, c, d[0], d[1], stableMap, p, board)) {
                            allStable = false;
                            break;
                        }
                    }
                    if(allStable) {
                        stableMap[r][c] = true;
                        changed = true;
                    }
                }
            }
        }
    }
    
    int myStable = 0;
    int oppStable = 0;
    for(int r=0; r<8; r++) {
        for(int c=0; c<8; c++) {
            if(stableMap[r][c]) {
                if(board.get(r,c) == player) myStable++;
                else if(board.get(r,c) == opponent) oppStable++;
            }
        }
    }
    /*
    int playerMoves = getValidMoves(board, player).size();
    int oppMoves = getValidMoves(board, opponent).size();

    // Mobility value
    double mobility = (double)(playerMoves - oppMoves);

    // Positional weights
    double positional = 0.0;
    for (int i = 0; i < 8; i++) {
        for (int j = 0; j < 8; j++) {
            uint64_t piece = board.get(i, j);
            if (piece == player) positional += WEIGHTS[i][j];
            else if (piece == opponent) positional -= WEIGHTS[i][j];
        }
    }
    
    double myDiscDiff = (double)(board.count(player) - board.count(opponent));
    */
    double stableDiff = (double)(myStable - oppStable);
    double finalScore = stableDiff * 1.0;
    
    return finalScore;
}

double negamax(const BitBoard& board, int depth, double alpha, double beta, uint64_t player) {
    if (depth == 0) {
        return evaluate(board, player);
    }

    auto moves = getValidMoves(board, player);
    if (moves.empty()) {
        uint64_t opponent = (player == BLACK) ? WHITE : BLACK;
        auto opponentMoves = getValidMoves(board, opponent);
        if (opponentMoves.empty()) {
            // Game over
            int blackCount = board.count(BLACK);
            int whiteCount = board.count(WHITE);
            return (double)(blackCount - whiteCount) * (player == BLACK ? 1.0 : -1.0);
        }
        return -negamax(board, depth - 1, -beta, -alpha, opponent);
    }

    double maxScore = -1000000.0;
    for (auto& move : moves) {
        BitBoard newBoard = makeMove(board, move.first, move.second, player);
        uint64_t opponent = (player == BLACK) ? WHITE : BLACK;
        double score = -negamax(newBoard, depth - 1, -beta, -alpha, opponent);
        maxScore = std::max(maxScore, score);
        alpha = std::max(alpha, score);
        if (alpha >= beta) break;
    }
    return maxScore;
}

void analyze_with_callback(std::string blackStr, std::string whiteStr, int playerVal, int maxTimeMs, val callback, val stopFlag) {
    uint64_t black = std::stoull(blackStr);
    uint64_t white = std::stoull(whiteStr);
    
    // Analyze only the current player
    BitBoard board(black, white);
    uint64_t currentPlayer = (playerVal == 1) ? BLACK : WHITE;
    
    auto moves = getValidMoves(board, currentPlayer);
    
    // Combine tasks (only for current player)
    struct Task {
        int r;
        int c;
        uint64_t p;
        double lastScore;
    };
    std::vector<Task> tasks;
    for(auto& m : moves) tasks.push_back({m.first, m.second, currentPlayer, 0.0});


    auto startTime = std::chrono::high_resolution_clock::now();
    int depth = 1;
    
    while (true) {
        if (stopFlag[0].as<int>() != 0) break;

        auto currentTime = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(currentTime - startTime).count();
        if (duration >= maxTimeMs || depth > 64) break;

        bool timeout = false;
        std::vector<MoveEval> currentDepthResults;
        
        for (auto& task : tasks) {
            if (stopFlag[0].as<int>() != 0) {
                timeout = true;
                break;
            }

            currentTime = std::chrono::high_resolution_clock::now();
            duration = std::chrono::duration_cast<std::chrono::milliseconds>(currentTime - startTime).count();
            if (duration >= maxTimeMs) {
                timeout = true;
                break;
            }
            
            BitBoard newBoard = makeMove(board, task.r, task.c, task.p);
            uint64_t opponent = (task.p == BLACK) ? WHITE : BLACK;
            // Search returns score for 'task.p'
            double score = -negamax(newBoard, depth, -1000000.0, 1000000.0, opponent);
            
            // Store score for sorting
            task.lastScore = score;

            // Immediate callback for this move
            val jsArray = val::array();
            val item = val::object();
            item.set("row", task.r);
            item.set("col", task.c);
            item.set("score", score);
            item.set("player", (task.p == BLACK ? 1 : 2));
            jsArray.call<void>("push", item);
            callback(jsArray, depth);
            
            // currentDepthResults.push_back({task.r, task.c, score, (task.p == BLACK ? 1 : 2)});
        }

        if (!timeout) {
            // Sort tasks for next depth (descending score)
            std::sort(tasks.begin(), tasks.end(), [](const Task& a, const Task& b) {
                return a.lastScore > b.lastScore;
            });
            depth++;
        }
        else break;
    }
}

EMSCRIPTEN_BINDINGS(my_module) {
    register_vector<MoveEval>("VectorMoveEval");
    value_object<MoveEval>("MoveEval")
        .field("row", &MoveEval::row)
        .field("col", &MoveEval::col)
        .field("score", &MoveEval::score)
        .field("player", &MoveEval::player);
    function("analyze_with_callback", &analyze_with_callback);
}
