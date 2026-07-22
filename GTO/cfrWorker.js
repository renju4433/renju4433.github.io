import { getBestCombo } from './game.js';

function fastCompare(bestA, bestB) {
    if(bestA.G !== bestB.G) return bestA.G - bestB.G;
    if(bestA.L !== bestB.L) return bestA.L - bestB.L;
    for(let k=0; k<5; k++) {
        if(bestA.sortedCards[k] !== bestB.sortedCards[k]) {
            // 同级别下，数字越大越好（高牌胜）
            return bestA.sortedCards[k] - bestB.sortedCards[k];
        }
    }
    return 0;
}

function matVecMul(mat, vec, N, out) {
    for(let i=0; i<N; i++) {
        let sum = 0;
        let rowOffset = i * N;
        for(let j=0; j<N; j++) {
            sum += mat[rowOffset + j] * vec[j];
        }
        out[i] = sum;
    }
}

self.onmessage = function(e) {
    const { communityCards, iterations, pot, bet } = e.data;
    
    // 1. Generate valid hands
    let hands = [];
    for(let i=2; i<=53; i++) {
        if(communityCards.includes(i)) continue;
        for(let j=i+1; j<=53; j++) {
            if(communityCards.includes(j)) continue;
            hands.push([i, j]);
        }
    }
    const N = hands.length;
    
    // 2. Precompute best combos
    let bestCombos = hands.map(h => getBestCombo([...h, ...communityCards]));
    
    // 3. Build W and V_mask
    let W = new Float32Array(N * N);
    let V_mask = new Float32Array(N * N);
    for(let i=0; i<N; i++) {
        for(let j=0; j<N; j++) {
            let idx = i * N + j;
            if(hands[i][0] === hands[j][0] || hands[i][0] === hands[j][1] ||
               hands[i][1] === hands[j][0] || hands[i][1] === hands[j][1]) {
                V_mask[idx] = 0;
                W[idx] = 0;
            } else {
                V_mask[idx] = 1;
                let comp = fastCompare(bestCombos[i], bestCombos[j]);
                if(comp > 0) W[idx] = 1;
                else if(comp < 0) W[idx] = -1;
                else W[idx] = 0;
            }
        }
    }
    
    // 4. Initialize CFR variables
    let regret_p1_root_check = new Float32Array(N);
    let regret_p1_root_bet = new Float32Array(N);
    let strat_p1_root_check = new Float32Array(N).fill(0.5);
    let strat_p1_root_bet = new Float32Array(N).fill(0.5);
    let cum_strat_p1_root_check = new Float32Array(N);
    let cum_strat_p1_root_bet = new Float32Array(N);

    let regret_p2_bet_fold = new Float32Array(N);
    let regret_p2_bet_call = new Float32Array(N);
    let strat_p2_bet_fold = new Float32Array(N).fill(0.5);
    let strat_p2_bet_call = new Float32Array(N).fill(0.5);
    let cum_strat_p2_bet_fold = new Float32Array(N);
    let cum_strat_p2_bet_call = new Float32Array(N);

    let regret_p2_chk_check = new Float32Array(N);
    let regret_p2_chk_bet = new Float32Array(N);
    let strat_p2_chk_check = new Float32Array(N).fill(0.5);
    let strat_p2_chk_bet = new Float32Array(N).fill(0.5);
    let cum_strat_p2_chk_check = new Float32Array(N);
    let cum_strat_p2_chk_bet = new Float32Array(N);

    let regret_p1_chkbet_fold = new Float32Array(N);
    let regret_p1_chkbet_call = new Float32Array(N);
    let strat_p1_chkbet_fold = new Float32Array(N).fill(0.5);
    let strat_p1_chkbet_call = new Float32Array(N).fill(0.5);
    let cum_strat_p1_chkbet_fold = new Float32Array(N);
    let cum_strat_p1_chkbet_call = new Float32Array(N);

    let r1 = new Float32Array(N).fill(1);
    let r2 = new Float32Array(N).fill(1);
    
    let r2_chk_chk = new Float32Array(N);
    let r2_chk_bet = new Float32Array(N);
    let r2_bet_fold = new Float32Array(N);
    let r2_bet_call = new Float32Array(N);
    
    let r1_check = new Float32Array(N);
    let r1_bet = new Float32Array(N);
    let r1_chkbet_fold = new Float32Array(N);
    let r1_chkbet_call = new Float32Array(N);
    
    let val_p1_chkbet_fold = new Float32Array(N);
    let val_p1_chkbet_call = new Float32Array(N);
    let val_p2_chk_chk = new Float32Array(N);
    let val_p2_chk_bet_fold = new Float32Array(N);
    let val_p2_chk_bet_call = new Float32Array(N);
    let val_p2_bet_fold = new Float32Array(N);
    let val_p2_bet_call = new Float32Array(N);
    let val_p1_root_check_showdown = new Float32Array(N);
    let val_p1_root_bet_fold = new Float32Array(N);
    let val_p1_root_bet_call = new Float32Array(N);

    let minusW = new Float32Array(N * N);
    for(let i=0; i<W.length; i++) minusW[i] = -W[i];

    function updateStrategy(regA, regB, stratA, stratB) {
        for(let i=0; i<N; i++) {
            let rA = regA[i] > 0 ? regA[i] : 0;
            let rB = regB[i] > 0 ? regB[i] : 0;
            let sum = rA + rB;
            if(sum > 0) {
                stratA[i] = rA / sum;
                stratB[i] = rB / sum;
            } else {
                stratA[i] = 0.5;
                stratB[i] = 0.5;
            }
        }
    }

    for(let iter=0; iter<iterations; iter++) {
        // Forward pass
        for(let i=0; i<N; i++) {
            r1_check[i] = r1[i] * strat_p1_root_check[i];
            r1_bet[i] = r1[i] * strat_p1_root_bet[i];
            
            r2_bet_fold[i] = r2[i] * strat_p2_bet_fold[i];
            r2_bet_call[i] = r2[i] * strat_p2_bet_call[i];
            
            r2_chk_chk[i] = r2[i] * strat_p2_chk_check[i];
            r2_chk_bet[i] = r2[i] * strat_p2_chk_bet[i];
            
            r1_chkbet_fold[i] = r1_check[i] * strat_p1_chkbet_fold[i];
            r1_chkbet_call[i] = r1_check[i] * strat_p1_chkbet_call[i];
        }

        // Backward pass
        // 1. P1 facing Bet
        matVecMul(V_mask, r2_chk_bet, N, val_p1_chkbet_fold);
        matVecMul(W, r2_chk_bet, N, val_p1_chkbet_call);
        for(let i=0; i<N; i++) {
            val_p1_chkbet_fold[i] *= (-pot/2);
            val_p1_chkbet_call[i] *= (pot/2 + bet);
            let node_val = strat_p1_chkbet_fold[i] * val_p1_chkbet_fold[i] + strat_p1_chkbet_call[i] * val_p1_chkbet_call[i];
            regret_p1_chkbet_fold[i] += val_p1_chkbet_fold[i] - node_val;
            regret_p1_chkbet_call[i] += val_p1_chkbet_call[i] - node_val;
            cum_strat_p1_chkbet_fold[i] += r1_check[i] * strat_p1_chkbet_fold[i];
            cum_strat_p1_chkbet_call[i] += r1_check[i] * strat_p1_chkbet_call[i];
        }

        // 2. P2 facing Check
        matVecMul(minusW, r1_check, N, val_p2_chk_chk);
        matVecMul(V_mask, r1_chkbet_fold, N, val_p2_chk_bet_fold);
        matVecMul(minusW, r1_chkbet_call, N, val_p2_chk_bet_call);
        for(let i=0; i<N; i++) {
            val_p2_chk_chk[i] *= (pot/2);
            val_p2_chk_bet_fold[i] *= (pot/2);
            val_p2_chk_bet_call[i] *= (pot/2 + bet);
            let val_bet = val_p2_chk_bet_fold[i] + val_p2_chk_bet_call[i];
            let node_val = strat_p2_chk_check[i] * val_p2_chk_chk[i] + strat_p2_chk_bet[i] * val_bet;
            regret_p2_chk_check[i] += val_p2_chk_chk[i] - node_val;
            regret_p2_chk_bet[i] += val_bet - node_val;
            cum_strat_p2_chk_check[i] += r2[i] * strat_p2_chk_check[i];
            cum_strat_p2_chk_bet[i] += r2[i] * strat_p2_chk_bet[i];
        }

        // 3. P2 facing Bet
        matVecMul(V_mask, r1_bet, N, val_p2_bet_fold);
        matVecMul(minusW, r1_bet, N, val_p2_bet_call);
        for(let i=0; i<N; i++) {
            val_p2_bet_fold[i] *= (-pot/2);
            val_p2_bet_call[i] *= (pot/2 + bet);
            let node_val = strat_p2_bet_fold[i] * val_p2_bet_fold[i] + strat_p2_bet_call[i] * val_p2_bet_call[i];
            regret_p2_bet_fold[i] += val_p2_bet_fold[i] - node_val;
            regret_p2_bet_call[i] += val_p2_bet_call[i] - node_val;
            cum_strat_p2_bet_fold[i] += r2[i] * strat_p2_bet_fold[i];
            cum_strat_p2_bet_call[i] += r2[i] * strat_p2_bet_call[i];
        }

        // 4. P1 Root
        matVecMul(W, r2_chk_chk, N, val_p1_root_check_showdown);
        matVecMul(V_mask, r2_bet_fold, N, val_p1_root_bet_fold);
        matVecMul(W, r2_bet_call, N, val_p1_root_bet_call);
        for(let i=0; i<N; i++) {
            val_p1_root_check_showdown[i] *= (pot/2);
            let val_chkbet_fold_i = val_p1_chkbet_fold[i];
            let val_chkbet_call_i = val_p1_chkbet_call[i];
            let node_val_chkbet = strat_p1_chkbet_fold[i] * val_chkbet_fold_i + strat_p1_chkbet_call[i] * val_chkbet_call_i;
            let val_check = val_p1_root_check_showdown[i] + node_val_chkbet;
            
            val_p1_root_bet_fold[i] *= (pot/2);
            val_p1_root_bet_call[i] *= (pot/2 + bet);
            let val_bet = val_p1_root_bet_fold[i] + val_p1_root_bet_call[i];

            let node_val = strat_p1_root_check[i] * val_check + strat_p1_root_bet[i] * val_bet;
            regret_p1_root_check[i] += val_check - node_val;
            regret_p1_root_bet[i] += val_bet - node_val;
            cum_strat_p1_root_check[i] += r1[i] * strat_p1_root_check[i];
            cum_strat_p1_root_bet[i] += r1[i] * strat_p1_root_bet[i];
        }

        // Update strategies
        updateStrategy(regret_p1_root_check, regret_p1_root_bet, strat_p1_root_check, strat_p1_root_bet);
        updateStrategy(regret_p2_bet_fold, regret_p2_bet_call, strat_p2_bet_fold, strat_p2_bet_call);
        updateStrategy(regret_p2_chk_check, regret_p2_chk_bet, strat_p2_chk_check, strat_p2_chk_bet);
        updateStrategy(regret_p1_chkbet_fold, regret_p1_chkbet_call, strat_p1_chkbet_fold, strat_p1_chkbet_call);

        if(iter % 50 === 0) {
            self.postMessage({ type: 'progress', progress: (iter / iterations) * 100 });
        }
    }

    // Normalize cumulative strategies
    let results = [];
    for(let i=0; i<N; i++) {
        let sum_p1_root = cum_strat_p1_root_check[i] + cum_strat_p1_root_bet[i] || 1;
        let sum_p2_bet = cum_strat_p2_bet_fold[i] + cum_strat_p2_bet_call[i] || 1;
        let sum_p2_chk = cum_strat_p2_chk_check[i] + cum_strat_p2_chk_bet[i] || 1;
        let sum_p1_chkbet = cum_strat_p1_chkbet_fold[i] + cum_strat_p1_chkbet_call[i] || 1;

        results.push({
            hand: hands[i],
            bestCombo: bestCombos[i],
            p1_root_check: cum_strat_p1_root_check[i] / sum_p1_root,
            p1_root_bet: cum_strat_p1_root_bet[i] / sum_p1_root,
            p2_bet_fold: cum_strat_p2_bet_fold[i] / sum_p2_bet,
            p2_bet_call: cum_strat_p2_bet_call[i] / sum_p2_bet,
            p2_chk_check: cum_strat_p2_chk_check[i] / sum_p2_chk,
            p2_chk_bet: cum_strat_p2_chk_bet[i] / sum_p2_chk,
            p1_chkbet_fold: cum_strat_p1_chkbet_fold[i] / sum_p1_chkbet,
            p1_chkbet_call: cum_strat_p1_chkbet_call[i] / sum_p1_chkbet
        });
    }

    // Sort results by hand strength (fastCompare)
    results.sort((a, b) => fastCompare(b.bestCombo, a.bestCombo));

    self.postMessage({ type: 'done', results });
};