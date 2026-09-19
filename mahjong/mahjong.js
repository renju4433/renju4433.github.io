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
  var normalMinS = 8;

  function dfs(d, melds, blocks, pair) {
    while(d < 34 && counts[d] === 0) d++;
    if (d >= 34) {
      var b = blocks;
      if (melds + b > targetMelds) b = targetMelds - melds;
      var s = (targetMelds * 2) - 2 * melds - b - pair;
      if (s < normalMinS) normalMinS = s;
      return;
    }
    
    var c = counts[d];
    if (c >= 3) { counts[d]-=3; dfs(d, melds+1, blocks, pair); counts[d]+=3; }
    if (c >= 2 && !pair) { counts[d]-=2; dfs(d, melds, blocks, 1); counts[d]+=2; }
    if (d < 27 && d % 9 < 7 && counts[d]>0 && counts[d+1]>0 && counts[d+2]>0) {
      counts[d]--; counts[d+1]--; counts[d+2]--; dfs(d, melds+1, blocks, pair); counts[d]++; counts[d+1]++; counts[d+2]++;
    }
    if (melds + blocks < targetMelds) {
      if (c >= 2) { counts[d]-=2; dfs(d, melds, blocks+1, pair); counts[d]+=2; }
      if (d < 27 && d % 9 < 8 && counts[d]>0 && counts[d+1]>0) {
        counts[d]--; counts[d+1]--; dfs(d, melds, blocks+1, pair); counts[d]++; counts[d+1]++;
      }
      if (d < 27 && d % 9 < 7 && counts[d]>0 && counts[d+2]>0) {
        counts[d]--; counts[d+2]--; dfs(d, melds, blocks+1, pair); counts[d]++; counts[d+2]++;
      }
    }
    dfs(d + 1, melds, blocks, pair);
  }
  
  dfs(0, 0, 0, 0);
  minS = Math.min(minS, normalMinS);
  return minS;
}