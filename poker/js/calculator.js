/**
 * 德州扑克核心算法与胜率计算 (高性能版)
 */

(function() {
// 牌型中文名映射
const HAND_RANK_NAMES = {
  9: "同花顺",
  8: "四条",
  7: "葫芦",
  6: "同花",
  5: "顺子",
  4: "三条",
  3: "两对",
  2: "一对",
  1: "高牌"
};

function cardToInt(cStr) {
  const ranks = { '2':0, '3':1, '4':2, '5':3, '6':4, '7':5, '8':6, '9':7, 'T':8, 'J':9, 'Q':10, 'K':11, 'A':12 };
  const suits = { 's':0, 'h':1, 'd':2, 'c':3 };
  return (suits[cStr[1]] << 4) | ranks[cStr[0]];
}

function intToCard(cInt) {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits = ['s', 'h', 'd', 'c'];
  return ranks[cInt & 0xF] + suits[cInt >> 4];
}

const rc = new Int32Array(13);
const sc = new Int32Array(4);
const sr = new Int32Array(4);

function getStraightHigh(mask) {
    for (let r = 8; r >= 0; r--) {
        let stMask = 0x1F << r;
        if ((mask & stMask) === stMask) {
            return r + 4;
        }
    }
    // A-5 (Wheel)
    if ((mask & 0x100F) === 0x100F) {
        return 3;
    }
    return -1;
}

function fastEval7Arr(cards, len) {
    rc[0]=0; rc[1]=0; rc[2]=0; rc[3]=0; rc[4]=0; rc[5]=0; rc[6]=0; rc[7]=0; rc[8]=0; rc[9]=0; rc[10]=0; rc[11]=0; rc[12]=0;
    sc[0]=0; sc[1]=0; sc[2]=0; sc[3]=0;
    sr[0]=0; sr[1]=0; sr[2]=0; sr[3]=0;
    let ranksMask = 0;

    for (let i = 0; i < len; i++) {
        let c = cards[i];
        let s = c >> 4;
        let r = c & 0xF;
        rc[r]++;
        sc[s]++;
        sr[s] |= (1 << r);
        ranksMask |= (1 << r);
    }

    let flushSuit = -1;
    if (sc[0] >= 5) flushSuit = 0;
    else if (sc[1] >= 5) flushSuit = 1;
    else if (sc[2] >= 5) flushSuit = 2;
    else if (sc[3] >= 5) flushSuit = 3;

    if (flushSuit !== -1) {
        let sfHigh = getStraightHigh(sr[flushSuit]);
        if (sfHigh >= 0) return (9 << 20) | (sfHigh << 16);
    }

    let quad = -1;
    let trip1 = -1, trip2 = -1;
    let pair1 = -1, pair2 = -1, pair3 = -1;

    for (let r = 12; r >= 0; r--) {
        let count = rc[r];
        if (count === 4) {
            quad = r;
        } else if (count === 3) {
            if (trip1 === -1) trip1 = r;
            else trip2 = r;
        } else if (count === 2) {
            if (pair1 === -1) pair1 = r;
            else if (pair2 === -1) pair2 = r;
            else pair3 = r;
        }
    }

    if (quad !== -1) {
        let kicker = -1;
        for (let r = 12; r >= 0; r--) {
            if (rc[r] > 0 && r !== quad) { kicker = r; break; }
        }
        return (8 << 20) | (quad << 16) | (kicker << 12);
    }

    if (trip1 !== -1 && trip2 !== -1) return (7 << 20) | (trip1 << 16) | (trip2 << 12);
    if (trip1 !== -1 && pair1 !== -1) return (7 << 20) | (trip1 << 16) | (pair1 << 12);

    if (flushSuit !== -1) {
        let mask = sr[flushSuit];
        let v = 0, n = 0;
        for (let r = 12; r >= 0; r--) {
            if ((mask & (1 << r)) !== 0) {
                v |= (r << (16 - n * 4));
                if (++n === 5) break;
            }
        }
        return (6 << 20) | v;
    }

    let stHigh = getStraightHigh(ranksMask);
    if (stHigh >= 0) return (5 << 20) | (stHigh << 16);

    if (trip1 !== -1) {
        let v = (4 << 20) | (trip1 << 16), n = 0;
        for (let r = 12; r >= 0; r--) {
            if (rc[r] > 0 && r !== trip1) {
                v |= (r << (12 - n * 4));
                if (++n === 2) break;
            }
        }
        return v;
    }

    if (pair1 !== -1 && pair2 !== -1) {
        let v = (3 << 20) | (pair1 << 16) | (pair2 << 12);
        for (let r = 12; r >= 0; r--) {
            if (rc[r] > 0 && r !== pair1 && r !== pair2) {
                v |= (r << 8); break;
            }
        }
        return v;
    }

    if (pair1 !== -1) {
        let v = (2 << 20) | (pair1 << 16), n = 0;
        for (let r = 12; r >= 0; r--) {
            if (rc[r] > 0 && r !== pair1) {
                v |= (r << (12 - n * 4));
                if (++n === 3) break;
            }
        }
        return v;
    }

    {
        let v = (1 << 20), n = 0;
        for (let r = 12; r >= 0; r--) {
            if (rc[r] > 0) {
                v |= (r << (16 - n * 4));
                if (++n === 5) break;
            }
        }
        return v;
    }
}

// 精确计算胜率 (穷举法，支持1个对手和具体 Outs 计算)
function calculateWinRate(heroCards, villainHand, boardCards, deck) {
  if (heroCards.length !== 2 || villainHand.length !== 2) return { winRate: 0, tieRate: 0, loseRate: 0, outs: [], isBehind: false };
  
  const heroInt = heroCards.map(cardToInt);
  const villainInt = villainHand.map(cardToInt);
  const boardInt = boardCards.map(cardToInt);
  
  const usedCards = new Set([...heroCards, ...villainHand, ...boardCards]);
  const remainingDeck = deck.filter(c => !usedCards.has(c)).map(cardToInt);

  let specificOuts = [];
  const needCards = 5 - boardInt.length;
  
  const evalArr = new Int32Array(7);
  evalArr[0] = heroInt[0];
  evalArr[1] = heroInt[1];
  for(let i=0; i<boardInt.length; i++) evalArr[2+i] = boardInt[i];

  const evalArrV = new Int32Array(7);
  evalArrV[0] = villainInt[0];
  evalArrV[1] = villainInt[1];
  for(let i=0; i<boardInt.length; i++) evalArrV[2+i] = boardInt[i];

  // 判断当前是否落后
  let isBehind = false;
  let currHero = fastEval7Arr(evalArr, 2 + boardInt.length);
  let currVillain = fastEval7Arr(evalArrV, 2 + boardInt.length);
  if (currHero < currVillain) {
    isBehind = true;
  }

  // 单张补牌 (Outs) 计算：仅当落后，且只需看下一张牌是否能反超
  let simpleOuts = [];
  if (isBehind && boardInt.length >= 3 && boardInt.length <= 4) {
    let nextPos = 2 + boardInt.length;
    for (let i = 0; i < remainingDeck.length; i++) {
      let card = remainingDeck[i];
      evalArr[nextPos] = card;
      evalArrV[nextPos] = card;
      let h = fastEval7Arr(evalArr, nextPos + 1);
      let v = fastEval7Arr(evalArrV, nextPos + 1);
      if (h > v) {
        simpleOuts.push({
          cardStr: intToCard(card),
          rankName: HAND_RANK_NAMES[h >> 20]
        });
      }
    }
  }

  let wins = 0;
  let ties = 0;
  let loses = 0;
  let total = 0;

  function evaluateCombinations(startIndex, addedCount) {
    if (addedCount === needCards) {
      let hScore = fastEval7Arr(evalArr, 2 + boardInt.length + addedCount);
      let vScore = fastEval7Arr(evalArrV, 2 + boardInt.length + addedCount);
      
      if (hScore > vScore) {
        wins++;
      } else if (hScore === vScore) {
        ties++;
      } else {
        loses++;
      }
      total++;
      return;
    }
    
    let needed = needCards - addedCount;
    for (let i = startIndex; i <= remainingDeck.length - needed; i++) {
      let card = remainingDeck[i];
      let pos = 2 + boardInt.length + addedCount;
      evalArr[pos] = card;
      evalArrV[pos] = card;
      
      evaluateCombinations(i + 1, addedCount + 1);
    }
  }

  evaluateCombinations(0, 0);

  return {
    winRate: total > 0 ? (wins / total) * 100 : 0,
    tieRate: total > 0 ? (ties / total) * 100 : 0,
    loseRate: total > 0 ? (loses / total) * 100 : 0,
    outs: simpleOuts,
    isBehind: isBehind
  };
}

window.PokerCalculator = {
  calculateWinRate
};
})();
