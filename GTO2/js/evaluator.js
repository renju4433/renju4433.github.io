const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function evaluateHand(holeRank, boardRanks) {
    let c1 = RANK_VALUES[holeRank];
    let len = boardRanks.length;
    
    if (len === 0) {
        return c1 << 8;
    }
    
    if (len === 1) {
        let c2 = RANK_VALUES[boardRanks[0]];
        if (c1 === c2) return (1 << 20) | (c1 << 8); // Pair
        
        if (c2 > c1) { let t = c1; c1 = c2; c2 = t; }
        
        // Straight
        if (c1 - c2 === 1) return (1 << 16) | (c1 << 8);
        if (c1 === 14 && c2 === 2) return (1 << 16) | (2 << 8); // A2 straight
        
        // High card
        return (c1 << 8) | (c2 << 4);
    }
    
    // len === 2
    let c2 = RANK_VALUES[boardRanks[0]];
    let c3 = RANK_VALUES[boardRanks[1]];
    
    let t;
    if (c2 > c1) { t = c1; c1 = c2; c2 = t; }
    if (c3 > c2) {
        t = c2; c2 = c3; c3 = t;
        if (c2 > c1) { t = c1; c1 = c2; c2 = t; }
    }
    
    if (c1 === c3) return (1 << 24) | (c1 << 8); // Three of a kind
    if (c1 === c2) return (1 << 20) | (c1 << 8) | (c3 << 4); // Pair
    if (c2 === c3) return (1 << 20) | (c2 << 8) | (c1 << 4); // Pair
    
    // Straight
    if (c1 - c2 === 1) return (1 << 16) | (c1 << 8) | (c3 << 4);
    if (c2 - c3 === 1) return (1 << 16) | (c2 << 8) | (c1 << 4);
    if (c1 === 14 && c3 === 2) return (1 << 16) | (2 << 8) | (c2 << 4); // A2 straight
    
    return (c1 << 8) | (c2 << 4) | c3; // High card
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
    for (let i = 0; i < boardRanks.length; i++) {
        let idx = RANKS.indexOf(boardRanks[i]);
        if (idx !== -1) counts[idx]--;
    }
    return counts;
}