var hands = []; // 4x4 array
var trump = 4;
var turn = 0;
var trick_suit = -1;
var best_player = -1;
var best_suit = -1;
var best_rank = -1;
var trick_count = 0;
var tt = new Map();
var nodes = 0;

function parseHands(handStrs) {
  var res = [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]];
  var suitMap = {'S':0, 'H':1, 'D':2, 'C':3};
  var rankMap = {'2':0, '3':1, '4':2, '5':3, '6':4, '7':5, '8':6, '9':7, 'T':8, 'J':9, 'Q':10, 'K':11, 'A':12};
  
  for (var p = 0; p < 4; p++) {
    var str = handStrs[p].toUpperCase();
    var parts = str.split(' ');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.indexOf(':') === 1) {
        var sChar = part.charAt(0);
        var s = suitMap[sChar];
        if (s !== undefined) {
          for (var j = 2; j < part.length; j++) {
            var rChar = part.charAt(j);
            var r = rankMap[rChar];
            if (r !== undefined) {
              res[p][s] |= (1 << r);
            }
          }
        }
      }
    }
  }
  return res;
}

function get_player_mask(p) {
  var m0 = hands[p][0], m1 = hands[p][1], m2 = hands[p][2], m3 = hands[p][3];
  return m0 + m1 * 8192 + m2 * 67108864 + m3 * 549755813888;
}

function hash_state() {
  return get_player_mask(0) + "-" + get_player_mask(1) + "-" + get_player_mask(2) + "-" + turn;
}

function get_moves(p) {
  var moves = [];
  if (trick_count > 0) {
    var mask = hands[p][trick_suit];
    if (mask > 0) {
      var prev = false;
      for (var r = 12; r >= 0; r--) {
        if ((mask & (1 << r))) {
          if (!prev) moves.push({s: trick_suit, r: r});
          prev = true;
        } else prev = false;
      }
      return moves;
    }
  }
  for (var s = 0; s < 4; s++) {
    var mask = hands[p][s];
    var prev = false;
    for (var r = 12; r >= 0; r--) {
      if ((mask & (1 << r))) {
        if (!prev) moves.push({s: s, r: r});
        prev = true;
      } else prev = false;
    }
  }
  return moves;
}

function ab_search(alpha, beta, depth) {
  nodes++;
  if (depth === 0) return 0;
  
  var hash = "";
  if (trick_count === 0) {
    hash = hash_state();
    var tt_val = tt.get(hash);
    if (tt_val !== undefined) {
      if (tt_val.flag === 0) return tt_val.val;
      if (tt_val.flag === 1 && tt_val.val <= alpha) return tt_val.val;
      if (tt_val.flag === 2 && tt_val.val >= beta) return tt_val.val;
    }
  }

  var moves = get_moves(turn);
  if (moves.length === 0) return 0;
  
  var is_ns = (turn === 0 || turn === 2);
  var best_val = is_ns ? -1 : 99;
  var orig_alpha = alpha;
  var orig_beta = beta;

  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    hands[turn][m.s] &= ~(1 << m.r);
    var old_turn = turn, old_ts = trick_suit, old_bp = best_player, old_bs = best_suit, old_br = best_rank;
    
    var trick_won = false;
    var winner = -1;
    
    if (trick_count === 0) {
      trick_suit = m.s; best_player = turn; best_suit = m.s; best_rank = m.r;
    } else {
      var is_better = false;
      if (m.s === best_suit) {
        if (m.r > best_rank) is_better = true;
      } else if (m.s === trump) {
        is_better = true;
      }
      if (is_better) {
        best_player = turn; best_suit = m.s; best_rank = m.r;
      }
    }
    
    trick_count++;
    var val;
    if (trick_count === 4) {
      trick_won = true;
      winner = best_player;
      var ns_won = (winner === 0 || winner === 2) ? 1 : 0;
      turn = winner;
      trick_count = 0;
      val = ns_won + ab_search(alpha - ns_won, beta - ns_won, depth - 1);
    } else {
      turn = (turn + 1) % 4;
      val = ab_search(alpha, beta, depth);
    }
    
    hands[old_turn][m.s] |= (1 << m.r);
    turn = old_turn; trick_suit = old_ts; best_player = old_bp; best_suit = old_bs; best_rank = old_br;
    if (trick_won) trick_count = 3; else trick_count--;
    
    if (is_ns) {
      if (val > best_val) best_val = val;
      if (best_val > alpha) alpha = best_val;
      if (alpha >= beta) break;
    } else {
      if (val < best_val) best_val = val;
      if (best_val < beta) beta = best_val;
      if (alpha >= beta) break;
    }
  }
  
  if (trick_count === 0) {
    var flag = 0;
    if (best_val <= orig_alpha) flag = 1;
    else if (best_val >= orig_beta) flag = 2;
    tt.set(hash, { val: best_val, flag: flag });
  }
  
  return best_val;
}

function countCards() {
  var c = 0;
  for(var s=0; s<4; s++) {
    var mask = hands[0][s];
    for(var r=0; r<=12; r++) if(mask & (1<<r)) c++;
  }
  return c;
}

function solveDDS(parsedHands, t, l) {
  hands = parsedHands;
  trump = t;
  turn = l;
  trick_suit = -1;
  best_player = -1;
  best_suit = -1;
  best_rank = -1;
  trick_count = 0;
  tt.clear();
  nodes = 0;
  
  var depth = countCards();
  
  var ns_tricks = ab_search(0, depth, depth);
  return { ns: ns_tricks, ew: depth - ns_tricks };
}