function parseHand(str) {
  var counts = new Array(34);
  for(var i=0; i<34; i++) counts[i] = 0;
  var nums = [];
  var count = 0;
  var tiles = [];
  var akas = {};
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if (c >= '0' && c <= '9') {
      nums.push(c === '0' ? 4 : parseInt(c) - 1);
    } else {
      var offset = -1;
      if (c === 'm') offset = 0;
      else if (c === 'p') offset = 9;
      else if (c === 's') offset = 18;
      else if (c === 'z') offset = 27;
      
      if (offset !== -1) {
        for (var j = 0; j < nums.length; j++) {
          if (offset === 27 && nums[j] > 6) continue;
          var t = offset + nums[j];
          counts[t]++;
          count++;
          
          var isAka = false;
          if (offset !== 27 && nums[j] === 4 && str[i - nums.length + j] === '0') {
            isAka = true;
            akas[t] = (akas[t] || 0) + 1;
          }
          tiles.push({ t: t, isAka: isAka });
        }
        nums = [];
      }
    }
  }
  return { counts: counts, count: count, tiles: tiles, akas: akas };
}

var suitCache = new Map();
var honorCache = new Map();

function getShanten(counts, count) {
  var minS = 8;
  var kCount = 0, kPair = 0;
  var kTiles = [0,8,9,17,18,26,27,28,29,30,31,32,33];
  for (var i = 0; i < kTiles.length; i++) {
    if (counts[kTiles[i]] > 0) {
      kCount++;
      if (counts[kTiles[i]] > 1) kPair = 1;
    }
  }
  if (count >= 13) {
    minS = Math.min(minS, 13 - kCount - kPair);
  }
  
  var pairs = 0, kinds = 0;
  for (var i = 0; i < 34; i++) {
    if (counts[i] > 0) kinds++;
    if (counts[i] >= 2) pairs++;
  }
  if (count >= 13) {
    minS = Math.min(minS, 6 - pairs + Math.max(0, 7 - kinds));
  }

  var targetMelds = Math.floor(count / 3);

  function analyzeSuit(d_start, d_end, isHonor) {
    var key = 0;
    for (var i = d_start; i < d_end; i++) {
      key = key * 5 + counts[i];
    }
    var cache = isHonor ? honorCache : suitCache;
    if (cache.has(key)) return cache.get(key);

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
      if (!isHonor && d < d_end - 2 && counts[d]>0 && counts[d+1]>0 && counts[d+2]>0) {
        counts[d]--; counts[d+1]--; counts[d+2]--; dfs(d, melds+1, blocks, pair); counts[d]++; counts[d+1]++; counts[d+2]++;
      }
      if (c >= 2) { counts[d]-=2; dfs(d, melds, blocks+1, pair); counts[d]+=2; }
      if (!isHonor && d < d_end - 1 && counts[d]>0 && counts[d+1]>0) {
        counts[d]--; counts[d+1]--; dfs(d, melds, blocks+1, pair); counts[d]++; counts[d+1]++;
      }
      if (!isHonor && d < d_end - 2 && counts[d]>0 && counts[d+2]>0) {
        counts[d]--; counts[d+2]--; dfs(d, melds, blocks+1, pair); counts[d]++; counts[d+2]++;
      }
      dfs(d + 1, melds, blocks, pair);
    }
    
    dfs(d_start, 0, 0, 0);
    cache.set(key, dp);
    return dp;
  }
  
  var resMan = analyzeSuit(0, 9, false);
  var resPin = analyzeSuit(9, 18, false);
  var resSou = analyzeSuit(18, 27, false);
  var resHon = analyzeSuit(27, 34, true);

  var dp = [ [-1,-1,-1,-1,-1], [-1,-1,-1,-1,-1] ];
  dp[0][0] = 0;

  function merge(res) {
    var next_dp = [ [-1,-1,-1,-1,-1], [-1,-1,-1,-1,-1] ];
    for (var p1 = 0; p1 <= 1; p1++) {
      for (var m1 = 0; m1 <= 4; m1++) {
        if (dp[p1][m1] === -1) continue;
        for (var p2 = 0; p2 <= 1; p2++) {
          if (p1 + p2 > 1) continue;
          for (var m2 = 0; m2 <= 4; m2++) {
            if (res[p2][m2] === -1) continue;
            var nm = m1 + m2;
            if (nm > 4) continue;
            var nb = dp[p1][m1] + res[p2][m2];
            if (nb > next_dp[p1 + p2][nm]) {
              next_dp[p1 + p2][nm] = nb;
            }
          }
        }
      }
    }
    dp = next_dp;
  }

  merge(resMan);
  merge(resPin);
  merge(resSou);
  merge(resHon);

  var normalMinS = 8;
  for (var p = 0; p <= 1; p++) {
    for (var m = 0; m <= targetMelds; m++) {
      if (dp[p][m] === -1) continue;
      var b = dp[p][m];
      if (m + b > targetMelds) b = targetMelds - m;
      var s = (targetMelds * 2) - 2 * m - b - p;
      if (s < normalMinS) normalMinS = s;
    }
  }

  minS = Math.min(minS, normalMinS);
  return minS;
}