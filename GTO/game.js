// 扑克牌游戏核心逻辑

// 1. 生成一副牌 (2-53)
export function createDeck() {
    const deck = [];
    for (let i = 2; i <= 53; i++) {
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

// 5. 评估 5 张牌的牌型
export function evaluate5CardHand(combo) {
    let max_D = 1;
    let max_L = 0;
    for (let d = 1; d <= 17; d++) {
        let count = 0;
        for (let i = 0; i < 5; i++) {
            if (combo[i] % d === 0) count++;
        }
        if (count >= 3) {
            if (d > max_D || (d === max_D && count > max_L)) {
                max_D = d;
                max_L = count;
            }
        }
    }

    let gcdCards = [];
    let kickerCards = [];

    for (let i = 0; i < 5; i++) {
        if (combo[i] % max_D === 0) {
            gcdCards.push(combo[i]);
        } else {
            kickerCards.push(combo[i]);
        }
    }

    gcdCards.sort((a, b) => b - a);
    kickerCards.sort((a, b) => b - a);
    
    return {
        cards: combo,
        G: max_D,
        L: max_L,
        gcdCards: gcdCards,
        kickerCards: kickerCards,
        sortedCards: [...combo].sort((a, b) => b - a) // 所有牌统一按从大到小排列
    };
}

// 6. 比较两个 5 张牌的组合 (接收 evaluate5CardHand 返回的对象)
export function compareCombos(a, b) {
    if (a.G !== b.G) return a.G - b.G;
    if (a.L !== b.L) return a.L - b.L;

    for (let i = 0; i < 5; i++) {
        if (a.sortedCards[i] !== b.sortedCards[i]) {
            // A比B大，说明A更好，返回正数表示A大于B
            return a.sortedCards[i] - b.sortedCards[i];
        }
    }
    return 0;
}

// 7. 获取玩家的最优 5 张牌组合 (从 7 张中选 5 张)
export function getBestCombo(cards) {
    const combos = getCombinations(cards, 5);
    let best = evaluate5CardHand(combos[0]);
    for (let i = 1; i < combos.length; i++) {
        const current = evaluate5CardHand(combos[i]);
        if (compareCombos(current, best) > 0) {
            best = current;
        }
    }
    return best;
}
