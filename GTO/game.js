// 扑克牌游戏核心逻辑

// 1. 生成一副牌 (1-52)
export function createDeck() {
    const deck = [];
    for (let i = 1; i <= 52; i++) {
        deck.push(i);
    }
    return deck;
}

// 2. 洗牌 (Fisher-Yates 算法)
export function shuffle(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// 3. 求最大公约数 (GCD)
export function gcd(a, b) {
    while (b !== 0) {
        let temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// 求三个数的最大公约数
export function gcd3(a, b, c) {
    return gcd(gcd(a, b), c);
}

// 4. 获取组合 (从数组中获取长度为 k 的所有组合)
export function getCombinations(arr, k) {
    const results = [];
    function backtrack(start, current) {
        if (current.length === k) {
            results.push([...current]);
            return;
        }
        for (let i = start; i < arr.length; i++) {
            current.push(arr[i]);
            backtrack(i + 1, current);
            current.pop();
        }
    }
    backtrack(0, []);
    return results;
}

// 5. 比较两个 3 张牌的组合
// 返回 > 0 表示 comboA 大于 comboB
// 返回 < 0 表示 comboA 小于 comboB
// 返回 0 表示完全相等
export function compareCombos(comboA, comboB) {
    const gcdA = gcd3(comboA[0], comboA[1], comboA[2]);
    const gcdB = gcd3(comboB[0], comboB[1], comboB[2]);
    
    // 1) 先比最大公约数
    if (gcdA !== gcdB) {
        return gcdA - gcdB;
    }
    
    // 2) 若公约数相同，依次比较从小到大这3张牌中的数字
    const sortedA = [...comboA].sort((a, b) => a - b);
    const sortedB = [...comboB].sort((a, b) => a - b);
    
    for (let i = 0; i < 3; i++) {
        if (sortedA[i] !== sortedB[i]) {
            return sortedA[i] - sortedB[i];
        }
    }
    return 0;
}

// 6. 获取玩家的最优 3 张牌组合
export function getBestCombo(cards) {
    const combos = getCombinations(cards, 3);
    let best = combos[0];
    for (let i = 1; i < combos.length; i++) {
        if (compareCombos(combos[i], best) > 0) {
            best = combos[i];
        }
    }
    return {
        cards: best,
        gcd: gcd3(best[0], best[1], best[2]),
        sortedCards: [...best].sort((a, b) => a - b)
    };
}
