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
var current_trick_mask = [0, 0, 0, 0];

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

var zobrist_turn = new BigInt64Array(4);
var zobrist_mask = [
  [new BigInt64Array(8192), new BigInt64Array(8192), new BigInt64Array(8192), new BigInt64Array(8192)],
  [new BigInt64Array(8192), new BigInt64Array(8192), new BigInt64Array(8192), new BigInt64Array(8192)],
  [new BigInt64Array(8192), new BigInt64Array(8192), new BigInt64Array(8192), new BigInt64Array(8192)]
];

function init_zobrist() {
  for (var i = 0; i < 4; i++) {
    zobrist_turn[i] = BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) | (BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) << 32n);
  }
  var base_cards = [];
  for (var p = 0; p < 3; p++) {
    base_cards[p] = [];
    for (var s = 0; s < 4; s++) {
      base_cards[p][s] = new BigInt64Array(13);
      for (var r = 0; r < 13; r++) {
        base_cards[p][s][r] = BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) | (BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) << 32n);
      }
    }
  }
  for (var p = 0; p < 3; p++) {
    for (var s = 0; s < 4; s++) {
      for (var mask = 0; mask < 8192; mask++) {
        var h = 0n;
        for (var r = 0; r < 13; r++) {
          if (mask & (1 << r)) h ^= base_cards[p][s][r];
        }
        zobrist_mask[p][s][mask] = h;
      }
    }
  }
}
init_zobrist();

function hash_state() {
  return zobrist_turn[turn]
       ^ zobrist_mask[0][0][hands[0][0]] ^ zobrist_mask[0][1][hands[0][1]] ^ zobrist_mask[0][2][hands[0][2]] ^ zobrist_mask[0][3][hands[0][3]]
       ^ zobrist_mask[1][0][hands[1][0]] ^ zobrist_mask[1][1][hands[1][1]] ^ zobrist_mask[1][2][hands[1][2]] ^ zobrist_mask[1][3][hands[1][3]]
       ^ zobrist_mask[2][0][hands[2][0]] ^ zobrist_mask[2][1][hands[2][1]] ^ zobrist_mask[2][2][hands[2][2]] ^ zobrist_mask[2][3][hands[2][3]];
}

function get_moves(p) {
  var moves = [];
  if (trick_count > 0) {
    var mask = hands[p][trick_suit];
    if (mask > 0) {
      var unplayed = hands[0][trick_suit] | hands[1][trick_suit] | hands[2][trick_suit] | hands[3][trick_suit] | current_trick_mask[trick_suit];
      var prev_is_p = false;
      for (var r = 12; r >= 0; r--) {
        if ((unplayed & (1 << r))) {
          var is_p = (mask & (1 << r)) !== 0;
          if (is_p) {
            if (!prev_is_p) moves.push({s: trick_suit, r: r});
          }
          prev_is_p = is_p;
        }
      }
      return moves;
    }
  }
  for (var s = 0; s < 4; s++) {
    var mask = hands[p][s];
    if (mask === 0) continue;
    var unplayed = hands[0][s] | hands[1][s] | hands[2][s] | hands[3][s] | current_trick_mask[s];
    var prev_is_p = false;
    for (var r = 12; r >= 0; r--) {
      if ((unplayed & (1 << r))) {
        var is_p = (mask & (1 << r)) !== 0;
        if (is_p) {
          if (!prev_is_p) moves.push({s: s, r: r});
        }
        prev_is_p = is_p;
      }
    }
  }
  return moves;
}

function ab_search(alpha, beta, depth) {
  nodes++;
  if (depth === 0) return 0;
  
  var hash;
  if (trick_count === 0) {
    hash = hash_state();
    var tt_val = tt.get(hash);
    if (tt_val !== undefined) {
      if (tt_val.flag === 0) return tt_val.val;
      if (tt_val.flag === 1 && tt_val.val <= alpha) return tt_val.val;
      if (tt_val.flag === 2 && tt_val.val >= beta) return tt_val.val;
    }
    
    // 独立花色分析 (Partition Search / Suit Independence)
    if (depth > 1) {
      var is_part = true;
      if (trump !== 4 && (hands[0][trump] || hands[1][trump] || hands[2][trump] || hands[3][trump])) {
        is_part = false;
      }
      if (is_part) {
        var lengths = [0, 0, 0, 0];
        var suits_count = 0;
        for (var s = 0; s < 4; s++) {
          var l0 = 0, l1 = 0, l2 = 0, l3 = 0;
          var m0 = hands[0][s], m1 = hands[1][s], m2 = hands[2][s], m3 = hands[3][s];
          for (var r = 0; r <= 12; r++) {
            if (m0 & (1<<r)) l0++;
            if (m1 & (1<<r)) l1++;
            if (m2 & (1<<r)) l2++;
            if (m3 & (1<<r)) l3++;
          }
          if (l0 !== l1 || l1 !== l2 || l2 !== l3) { is_part = false; break; }
          lengths[s] = l0;
          if (l0 > 0) suits_count++;
        }
        if (is_part && suits_count > 1) {
          var total_ns = 0;
          var saved_hands = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
          for(var p=0; p<4; p++) for(var s=0; s<4; s++) saved_hands[p][s] = hands[p][s];
          var saved_turn = turn;
          
          for (var s = 0; s < 4; s++) {
            if (lengths[s] > 0) {
              for(var p=0; p<4; p++) {
                for(var xs=0; xs<4; xs++) hands[p][xs] = (xs === s) ? saved_hands[p][s] : 0;
              }
              turn = saved_turn;
              total_ns += ab_search(0, lengths[s], lengths[s]);
            }
          }
          
          for(var p=0; p<4; p++) for(var s=0; s<4; s++) hands[p][s] = saved_hands[p][s];
          turn = saved_turn;
          
          tt.set(hash, { val: total_ns, flag: 0 });
          return total_ns;
        }
      }
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
    
    current_trick_mask[m.s] |= (1 << m.r);
    
    trick_count++;
    var val;
    if (trick_count === 4) {
      trick_won = true;
      winner = best_player;
      var ns_won = (winner === 0 || winner === 2) ? 1 : 0;
      turn = winner;
      trick_count = 0;
      
      var saved_ctm0 = current_trick_mask[0], saved_ctm1 = current_trick_mask[1], saved_ctm2 = current_trick_mask[2], saved_ctm3 = current_trick_mask[3];
      current_trick_mask[0] = 0; current_trick_mask[1] = 0; current_trick_mask[2] = 0; current_trick_mask[3] = 0;
      
      val = ns_won + ab_search(alpha - ns_won, beta - ns_won, depth - 1);
      
      current_trick_mask[0] = saved_ctm0; current_trick_mask[1] = saved_ctm1; current_trick_mask[2] = saved_ctm2; current_trick_mask[3] = saved_ctm3;
    } else {
      turn = (turn + 1) % 4;
      val = ab_search(alpha, beta, depth);
    }
    
    current_trick_mask[m.s] &= ~(1 << m.r);
    
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
  var counts = [0, 0, 0, 0];
  for (var p = 0; p < 4; p++) {
    for(var s=0; s<4; s++) {
      var mask = hands[p][s];
      for(var r=0; r<=12; r++) if(mask & (1<<r)) counts[p]++;
    }
  }
  return counts;
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
  current_trick_mask = [0, 0, 0, 0];
  
  var counts = countCards();
  var depth = counts[0];
  for (var i = 1; i < 4; i++) {
    if (counts[i] !== depth) {
      throw new Error("四家牌张数不一致");
    }
  }
  var ns_tricks = ab_search(0, depth, depth);
  return { ns: ns_tricks, ew: depth - ns_tricks, nodes: nodes };
}