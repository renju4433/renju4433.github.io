const fs = require('fs');

let table = {};
let counts = new Int32Array(9);

function calc(d_start, d_end) {
    var dp = [ [-1,-1,-1,-1,-1], [-1,-1,-1,-1,-1] ];
    function dfs(d, melds, blocks, pair) {
        while (d < d_end && counts[d] === 0) d++;
        if (d >= d_end) {
            if (blocks > dp[pair][melds]) dp[pair][melds] = blocks;
            return;
        }
        var c = counts[d];
        if (c >= 3) { counts[d]-=3; dfs(d, melds+1, blocks, pair); counts[d]+=3; }
        if (c >= 2 && !pair) { counts[d]-=2; dfs(d, melds, blocks, 1); counts[d]+=2; }
        if (d < d_end - 2 && counts[d]>0 && counts[d+1]>0 && counts[d+2]>0) {
            counts[d]--; counts[d+1]--; counts[d+2]--; dfs(d, melds+1, blocks, pair); counts[d]++; counts[d+1]++; counts[d+2]++;
        }
        if (c >= 2) { counts[d]-=2; dfs(d, melds, blocks+1, pair); counts[d]+=2; }
        if (d < d_end - 1 && counts[d]>0 && counts[d+1]>0) {
            counts[d]--; counts[d+1]--; dfs(d, melds, blocks+1, pair); counts[d]++; counts[d+1]++;
        }
        if (d < d_end - 2 && counts[d]>0 && counts[d+2]>0) {
            counts[d]--; counts[d+2]--; dfs(d, melds, blocks+1, pair); counts[d]++; counts[d+2]++;
        }
        dfs(d + 1, melds, blocks, pair);
    }
    dfs(d_start, 0, 0, 0);

    let val = 0;
    for (let p = 1; p >= 0; p--) {
        for (let m = 4; m >= 0; m--) {
            val = val * 6 + (dp[p][m] + 1);
        }
    }
    return val;
}

function dfs_gen(d, sum, key) {
    if (d === 9) {
        table[key] = calc(0, 9);
        return;
    }
    for (let i = 0; i <= 4; i++) {
        if (sum + i > 14) break;
        counts[d] = i;
        dfs_gen(d + 1, sum + i, key * 5 + i);
    }
}

console.log("Generating table...");
dfs_gen(0, 0, 0);
fs.writeFileSync('table.json', JSON.stringify(table));
console.log("Table generated! File size:", fs.statSync('table.json').size / 1024 / 1024, "MB");
