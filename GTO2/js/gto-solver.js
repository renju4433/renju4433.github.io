class GTOSolver {
    constructor(root, reach1, reach2) {
        this.root = root;
        this.initialReach1 = new Float64Array(reach1);
        this.initialReach2 = new Float64Array(reach2);
    }

    solve(iterations, onProgress) {
        let cur = 0;
        
        const runChunk = () => {
            let startTime = performance.now();
            // 每次最大执行 30 毫秒，避免阻塞 UI 线程
            while (cur < iterations && (performance.now() - startTime < 30)) {
                this.cfr(this.root, this.initialReach1, this.initialReach2);
                cur++;
            }
            if (onProgress) onProgress(cur, iterations, false);
            
            if (cur < iterations) {
                setTimeout(runChunk, 0);
            } else {
                if (onProgress) onProgress(iterations, iterations, true);
            }
        };
        
        setTimeout(runChunk, 0);
    }

    cfr(node, reach1, reach2) {
        if (node.type === 'TERMINAL') {
            let val1 = new Float64Array(13);
            let val2 = new Float64Array(13);
            let m1 = node.matrix1;
            let m2 = node.matrix2;
            
            for (let x = 0; x < 13; x++) {
                let p1 = reach1[x];
                if (p1 === 0) continue;
                for (let y = 0; y < 13; y++) {
                    let p2 = reach2[y];
                    if (p2 === 0) continue;
                    
                    let idx = x * 13 + y;
                    val1[x] += p2 * m1[idx];
                    val2[y] += p1 * m2[idx];
                }
            }
            return [val1, val2];
        }
        
        if (node.type === 'CHANCE') {
            let val1 = new Float64Array(13);
            let val2 = new Float64Array(13);
            let counts = getCounts(node.board);
            
            let totalWeight = 0;
            for (let c = 0; c < 13; c++) {
                if (counts[c] <= 0) continue; // 如果该牌已经发完，跳过
                let weight = counts[c];
                totalWeight += weight;
                
                let [cVal1, cVal2] = this.cfr(node.children[RANKS[c]], reach1, reach2);
                for (let i = 0; i < 13; i++) {
                    val1[i] += cVal1[i] * weight;
                    val2[i] += cVal2[i] * weight;
                }
            }
            
            if (totalWeight > 0) {
                for (let i = 0; i < 13; i++) {
                    val1[i] /= totalWeight;
                    val2[i] /= totalWeight;
                }
            }
            
            return [val1, val2];
        }
        
        if (node.type === 'ACTION') {
            let player = node.player;
            let myReach = player === 0 ? reach1 : reach2;
            let numActions = Object.keys(node.children).length;
            let actionNames = Object.keys(node.children);
            
            if (!node.regretSum) {
                node.regretSum = Array.from({length: 13}, () => new Float64Array(numActions));
                node.strategySum = Array.from({length: 13}, () => new Float64Array(numActions));
                node.ev1 = new Float64Array(13);
                node.ev2 = new Float64Array(13);
                node.numIterations = 0;
            }
            
            let strategy = Array.from({length: 13}, () => new Float64Array(numActions));
            
            for (let i = 0; i < 13; i++) {
                let sumPosRegret = 0;
                for (let a = 0; a < numActions; a++) {
                    let reg = node.regretSum[i][a];
                    if (reg > 0) sumPosRegret += reg;
                }
                for (let a = 0; a < numActions; a++) {
                    if (sumPosRegret > 0) {
                        strategy[i][a] = Math.max(0, node.regretSum[i][a]) / sumPosRegret;
                    } else {
                        strategy[i][a] = 1.0 / numActions;
                    }
                    node.strategySum[i][a] += myReach[i] * strategy[i][a];
                }
            }
            
            let actionVals1 = [];
            let actionVals2 = [];
            
            for (let a = 0; a < numActions; a++) {
                let nextReach1 = new Float64Array(reach1);
                let nextReach2 = new Float64Array(reach2);
                if (player === 0) {
                    for (let i = 0; i < 13; i++) nextReach1[i] *= strategy[i][a];
                } else {
                    for (let i = 0; i < 13; i++) nextReach2[i] *= strategy[i][a];
                }
                
                let [v1, v2] = this.cfr(node.children[actionNames[a]], nextReach1, nextReach2);
                actionVals1.push(v1);
                actionVals2.push(v2);
            }
            
            let val1 = new Float64Array(13);
            let val2 = new Float64Array(13);
            
            for (let i = 0; i < 13; i++) {
                for (let a = 0; a < numActions; a++) {
                    if (player === 0) {
                        val1[i] += strategy[i][a] * actionVals1[a][i];
                        val2[i] += actionVals2[a][i];
                    } else {
                        val2[i] += strategy[i][a] * actionVals2[a][i];
                        val1[i] += actionVals1[a][i];
                    }
                }
            }
            
            for (let i = 0; i < 13; i++) {
                for (let a = 0; a < numActions; a++) {
                    if (player === 0) {
                        node.regretSum[i][a] += actionVals1[a][i] - val1[i];
                    } else {
                        node.regretSum[i][a] += actionVals2[a][i] - val2[i];
                    }
                }
                node.ev1[i] += val1[i];
                node.ev2[i] += val2[i];
            }
            node.numIterations++;
            
            return [val1, val2];
        }
    }
}