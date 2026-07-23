import { getCombinations, compareCombos, getBestCombo } from './game.js';

self.onmessage = function(e) {
    const { p1, p2, comm, mode } = e.data;
    
    // 生成剩余牌堆
    const used = [...p1, ...p2, ...comm];
    const deck = [];
    for (let i = 2; i <= 53; i++) {
        if (!used.includes(i)) deck.push(i);
    }

    let p1Wins = 0, p2Wins = 0, ties = 0;
    let total = 0;
    const totalCommunityCards = mode === 'rule3' ? 3 : 5;
    const cardsToDraw = totalCommunityCards - comm.length;

    // 1. 计算胜率 (Equity)
    if (cardsToDraw === 0) {
        // 已经发完公共牌，直接比较
        const b1 = getBestCombo([...p1, ...comm], mode);
        const b2 = getBestCombo([...p2, ...comm], mode);
        const c = compareCombos(b1, b2, mode);
        if (c > 0) p1Wins++;
        else if (c < 0) p2Wins++;
        else ties++;
        total = 1;
    } else {
        // 采用完全穷举
        const boards = getCombinations(deck, cardsToDraw);
        total = boards.length;

        for (let i = 0; i < boards.length; i++) {
            const board = [...comm, ...boards[i]];
            const b1 = getBestCombo([...p1, ...board], mode);
            const b2 = getBestCombo([...p2, ...board], mode);
            const c = compareCombos(b1, b2, mode);
            if (c > 0) p1Wins++;
            else if (c < 0) p2Wins++;
            else ties++;

            if (i % 20000 === 0) {
                self.postMessage({ type: 'progress', progress: (i / total) * 100 });
            }
        }
    }

    // 2. 计算补牌 (Outs)
    // 仅在发牌未完成但已发部分公共牌时计算直接补牌（即下一张能让自己获胜的牌）
    let p1Outs = [];
    let p2Outs = [];
    if (comm.length > 0 && comm.length < totalCommunityCards) {
        for (let i = 0; i < deck.length; i++) {
            const card = deck[i];
            const board = [...comm, card]; // 假设下一张发这个
            const b1 = getBestCombo([...p1, ...board], mode);
            const b2 = getBestCombo([...p2, ...board], mode);
            const c = compareCombos(b1, b2, mode);
            if (c > 0) p1Outs.push(card);
            else if (c < 0) p2Outs.push(card);
        }
    }

    const p1Eq = (p1Wins + ties / 2) / total;
    const p2Eq = (p2Wins + ties / 2) / total;
    const tieEq = ties / total;

    self.postMessage({
        type: 'done',
        p1Eq, 
        p2Eq, 
        tieEq,
        p1Outs, 
        p2Outs, 
        total
    });
};