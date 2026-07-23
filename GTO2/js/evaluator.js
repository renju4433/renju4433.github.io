const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const memo = new Map();

function evaluateHand(holeRank, boardRanks) {
    let key = holeRank + '|' + boardRanks.join('');
    if (memo.has(key)) return memo.get(key);
    
    let cards = [holeRank, ...boardRanks].map(r => RANK_VALUES[r]).sort((a, b) => b - a);
    
    let pairRank = 0;
    let kicker = 0;
    
    if (cards.length === 3) {
        if (cards[0] === cards[1]) {
            pairRank = cards[0];
            kicker = cards[2];
        } else if (cards[1] === cards[2]) {
            pairRank = cards[1];
            kicker = cards[0];
        }
    } else if (cards.length === 2) {
        if (cards[0] === cards[1]) {
            pairRank = cards[0];
        }
    }
    
    let score = 0;
    if (pairRank > 0) {
        score = 10000 + pairRank * 100 + kicker;
    } else {
        for (let i = 0; i < cards.length; i++) {
            score += cards[i] * Math.pow(100, 2 - i);
        }
    }
    
    memo.set(key, score);
    return score;
}

function compareHands(hole1, hole2, boardRanks) {
    const s1 = evaluateHand(hole1, boardRanks);
    const s2 = evaluateHand(hole2, boardRanks);
    if (s1 > s2) return 1;
    if (s1 < s2) return -1;
    return 0;
}

function getCounts(boardRanks) {
    let counts = new Array(13).fill(4);
    for (let c of boardRanks) {
        let idx = RANKS.indexOf(c);
        if (idx !== -1) counts[idx]--;
    }
    return counts;
}