#include <emscripten/bind.h>
#include <vector>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <queue>
#include <algorithm>
#include <sstream>

using namespace emscripten;

struct Node {
  std::vector<int> left;
  std::vector<int> right;
  int index;
};

struct Dy {
  long long num;
  int exp;
};

struct MeanTemp {
  bool mean_ok;
  bool temp_ok;
  Dy mean;
  Dy temp;
};

struct RegionItem {
  int id;
  int idx;
  int empties;
  std::string value_str;
  std::string mean_str;
};

struct ComputeResult {
  int sum_idx;
  std::string sum_str;
  std::vector<RegionItem> items;
};

static std::vector<Node> G;
static std::unordered_map<int, std::unordered_map<int, int>> cmp_cache;
static std::unordered_map<int, Dy> dy_cache;
static std::unordered_set<int> dy_null;
static std::unordered_map<int, MeanTemp> mt_cache;
static int IDX_ZERO = -1;
static int IDX_ONE = -1;

static bool le_idx_idx(int gi, int hi);
static bool le_node_idx(const Node& g, int hi);
static bool le_idx_node(int gi, const Node& h);

static bool bare_le_idx_idx(int gi, int hi) {
  const Node& g = G[gi];
  const Node& h = G[hi];
  for (size_t i = 0; i < g.left.size(); i++) {
    if (le_idx_idx(hi, g.left[i])) return false;
  }
  for (size_t i = 0; i < h.right.size(); i++) {
    if (le_idx_idx(h.right[i], gi)) return false;
  }
  return true;
}

static bool le_idx_idx(int gi, int hi) {
  auto it = cmp_cache.find(gi);
  if (it != cmp_cache.end()) {
    auto it2 = it->second.find(hi);
    if (it2 != it->second.end()) return it2->second > 0;
  }
  bool d = bare_le_idx_idx(gi, hi);
  cmp_cache[gi][hi] = d ? 1 : 0;
  return d;
}

static bool bare_le_node_idx(const Node& g, int hi) {
  for (size_t i = 0; i < g.left.size(); i++) {
    if (le_idx_idx(hi, g.left[i])) return false;
  }
  const Node& h = G[hi];
  for (size_t i = 0; i < h.right.size(); i++) {
    if (le_idx_node(h.right[i], g)) return false;
  }
  return true;
}

static bool le_node_idx(const Node& g, int hi) {
  return bare_le_node_idx(g, hi);
}

static bool bare_le_idx_node(int gi, const Node& h) {
  const Node& g = G[gi];
  for (size_t i = 0; i < g.left.size(); i++) {
    if (le_node_idx(h, g.left[i])) return false;
  }
  for (size_t i = 0; i < h.right.size(); i++) {
    if (le_idx_idx(h.right[i], gi)) return false;
  }
  return true;
}

static bool le_idx_node(int gi, const Node& h) {
  return bare_le_idx_node(gi, h);
}

static bool eq_node_idx(const Node& g, int hi) {
  return le_node_idx(g, hi) && le_idx_node(hi, g);
}

static bool remove_reversibles_node(Node& g) {
  for (size_t i = 0; i < g.left.size(); i++) {
    int gl = g.left[i];
    const Node& gln = G[gl];
    for (size_t j = 0; j < gln.right.size(); j++) {
      int glr = gln.right[j];
      if (le_idx_node(glr, g)) {
        for (size_t k = i + 1; k < g.left.size(); k++) g.left[k - 1] = g.left[k];
        g.left.pop_back();
        const Node& glrn = G[glr];
        for (size_t k = 0; k < glrn.left.size(); k++) g.left.push_back(glrn.left[k]);
        return true;
      }
    }
  }
  for (size_t i = 0; i < g.right.size(); i++) {
    int gr = g.right[i];
    const Node& grn = G[gr];
    for (size_t j = 0; j < grn.left.size(); j++) {
      int grl = grn.left[j];
      if (le_node_idx(g, grl)) {
        for (size_t k = i + 1; k < g.right.size(); k++) g.right[k - 1] = g.right[k];
        g.right.pop_back();
        const Node& grln = G[grl];
        for (size_t k = 0; k < grln.right.size(); k++) g.right.push_back(grln.right[k]);
        return true;
      }
    }
  }
  return false;
}

static int get_game(const std::vector<int>& lefts, const std::vector<int>& rights) {
  Node g;
  g.left = lefts;
  g.right = rights;
  g.index = -1;
  for (size_t i = 0; i < G.size(); i++) {
    if (eq_node_idx(g, (int)i)) return (int)i;
  }
  while (remove_reversibles_node(g)) {}
  std::vector<int> retainedL(g.left.size(), 1);
  for (size_t i = 0; i < g.left.size(); i++) {
    if (!retainedL[i]) continue;
    for (size_t j = 0; j < g.left.size(); j++) {
      if (j == i || !retainedL[j]) continue;
      if (le_idx_idx(g.left[i], g.left[j])) retainedL[i] = 0;
    }
  }
  std::vector<int> newleft;
  for (size_t i = 0; i < g.left.size(); i++) if (retainedL[i]) newleft.push_back(g.left[i]);
  g.left = newleft;
  std::vector<int> retainedR(g.right.size(), 1);
  for (size_t i = 0; i < g.right.size(); i++) {
    if (!retainedR[i]) continue;
    for (size_t j = 0; j < g.right.size(); j++) {
      if (j == i || !retainedR[j]) continue;
      if (le_idx_idx(G[g.right[j]].index, G[g.right[i]].index)) retainedR[i] = 0;
    }
  }
  std::vector<int> newright;
  for (size_t i = 0; i < g.right.size(); i++) if (retainedR[i]) newright.push_back(g.right[i]);
  g.right = newright;
  g.index = (int)G.size();
  G.push_back(g);
  return g.index;
}

static int neg(int idx) {
  const Node& g = G[idx];
  std::vector<int> ell;
  std::vector<int> arr;
  for (size_t i = 0; i < g.left.size(); i++) arr.push_back(neg(g.left[i]));
  for (size_t i = 0; i < g.right.size(); i++) ell.push_back(neg(g.right[i]));
  return get_game(ell, arr);
}

static int plus_idx(int gi, int hi) {
  const Node& g = G[gi];
  const Node& h = G[hi];
  std::vector<int> ell;
  std::vector<int> arr;
  for (size_t i = 0; i < g.left.size(); i++) ell.push_back(plus_idx(g.left[i], hi));
  for (size_t i = 0; i < h.left.size(); i++) ell.push_back(plus_idx(gi, h.left[i]));
  for (size_t i = 0; i < g.right.size(); i++) arr.push_back(plus_idx(g.right[i], hi));
  for (size_t i = 0; i < h.right.size(); i++) arr.push_back(plus_idx(gi, h.right[i]));
  return get_game(ell, arr);
}

static Dy dy_norm(Dy a) {
  if (a.num == 0) return Dy{0, 0};
  long long n = a.num;
  int e = a.exp;
  while (e > 0 && (n % 2LL) == 0LL) {
    n /= 2LL;
    e -= 1;
  }
  return Dy{n, e};
}

static int dy_cmp(const Dy& a, const Dy& b) {
  int e = std::max(a.exp, b.exp);
  long long an = a.num << (e - a.exp);
  long long bn = b.num << (e - b.exp);
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

static Dy dy_add(const Dy& a, const Dy& b) {
  int e = std::max(a.exp, b.exp);
  long long an = a.num << (e - a.exp);
  long long bn = b.num << (e - b.exp);
  return dy_norm(Dy{an + bn, e});
}

static Dy dy_sub(const Dy& b, const Dy& a) {
  int e = std::max(a.exp, b.exp);
  long long an = a.num << (e - a.exp);
  long long bn = b.num << (e - b.exp);
  return dy_norm(Dy{bn - an, e});
}

static Dy dy_half(const Dy& a) {
  return dy_norm(Dy{a.num, a.exp + 1});
}

static bool to_dyadic(int idx, Dy& out) {
  auto it = dy_cache.find(idx);
  if (it != dy_cache.end()) {
    out = it->second;
    return true;
  }
  if (dy_null.find(idx) != dy_null.end()) return false;
  const Node& g = G[idx];
  std::vector<Dy> lefts;
  std::vector<Dy> rights;
  for (size_t i = 0; i < g.left.size(); i++) {
    Dy d;
    if (!to_dyadic(g.left[i], d)) {
      dy_null.insert(idx);
      return false;
    }
    lefts.push_back(d);
  }
  for (size_t j = 0; j < g.right.size(); j++) {
    Dy d2;
    if (!to_dyadic(g.right[j], d2)) {
      dy_null.insert(idx);
      return false;
    }
    rights.push_back(d2);
  }
  for (size_t a = 0; a < lefts.size(); a++) {
    for (size_t b = 0; b < rights.size(); b++) {
      if (!le_idx_idx(g.left[a], g.right[b])) {
        dy_null.insert(idx);
        return false;
      }
      if (le_idx_idx(g.right[b], g.left[a])) {
        dy_null.insert(idx);
        return false;
      }
    }
  }
  bool hasLower = !lefts.empty();
  bool hasUpper = !rights.empty();
  if (!hasLower && !hasUpper) {
    Dy z{0, 0};
    dy_cache[idx] = z;
    out = z;
    return true;
  }
  if (!hasUpper) {
    double s = lefts[0].num / (double)(1 << lefts[0].exp);
    for (size_t li = 1; li < lefts.size(); li++) {
      if (dy_cmp(lefts[li], lefts[0]) > 0) s = lefts[li].num / (double)(1 << lefts[li].exp);
    }
    long long n = (long long)std::floor(s) + 1LL;
    Dy r0{n, 0};
    dy_cache[idx] = r0;
    out = r0;
    return true;
  }
  if (!hasLower) {
    double s2 = rights[0].num / (double)(1 << rights[0].exp);
    for (size_t ri = 1; ri < rights.size(); ri++) {
      if (dy_cmp(rights[ri], rights[0]) < 0) s2 = rights[ri].num / (double)(1 << rights[ri].exp);
    }
    long long n2 = (long long)std::ceil(s2) - 1LL;
    Dy r1{n2, 0};
    dy_cache[idx] = r1;
    out = r1;
    return true;
  }
  Dy lower = lefts[0];
  for (size_t li = 1; li < lefts.size(); li++) if (dy_cmp(lefts[li], lower) > 0) lower = lefts[li];
  Dy upper = rights[0];
  for (size_t ri = 1; ri < rights.size(); ri++) if (dy_cmp(rights[ri], upper) < 0) upper = rights[ri];
  for (int k = 0; k < 60; k++) {
    long long L = (k - lower.exp >= 0) ? (lower.num << (k - lower.exp)) : ((long long)std::ceil((double)lower.num / (double)(1 << (lower.exp - k))));
    long long R = (k - upper.exp >= 0) ? (upper.num << (k - upper.exp)) : ((long long)std::floor((double)upper.num / (double)(1 << (upper.exp - k))));
    if (L + 1 < R) {
      Dy r{L + 1, k};
      dy_cache[idx] = r;
      out = r;
      return true;
    }
  }
  dy_null.insert(idx);
  return false;
}

static std::string dy_to_string(const Dy& a) {
  Dy n = dy_norm(a);
  if (n.num == 0) return std::string("0");
  if (n.exp == 0) return std::to_string(n.num);
  long long denom = 1LL << n.exp;
  return std::to_string(n.num) + std::string("/") + std::to_string(denom);
}

static std::string display_str(int idx) {
  Dy dy;
  if (to_dyadic(idx, dy)) {
    return dy_to_string(dy);
  }
  const Node& g = G[idx];
  std::string s = "{";
  if (!g.left.empty()) {
    for (size_t i = 0; i < g.left.size(); i++) {
      if (i > 0) s += ", ";
      s += display_str(g.left[i]);
    }
  }
  s += "|";
  if (!g.right.empty()) {
    for (size_t i = 0; i < g.right.size(); i++) {
      if (i > 0) s += ", ";
      s += display_str(g.right[i]);
    }
  }
  s += "}";
  return s;
}

static MeanTemp game_mean_temp(int idx) {
  auto it = mt_cache.find(idx);
  if (it != mt_cache.end()) return it->second;
  const Node& g = G[idx];
  std::vector<Dy> lefts;
  std::vector<Dy> rights;
  for (size_t i = 0; i < g.left.size(); i++) {
    int child = g.left[i];
    MeanTemp mtc = game_mean_temp(child);
    Dy m = mtc.mean_ok ? mtc.mean : Dy{0,0};
    bool ok = mtc.mean_ok;
    if (!ok) {
      Dy d;
      ok = to_dyadic(child, d);
      if (ok) m = d;
    }
    if (!ok) {
      MeanTemp r0;
      r0.mean_ok = false;
      r0.temp_ok = false;
      mt_cache[idx] = r0;
      return r0;
    }
    lefts.push_back(m);
  }
  for (size_t j = 0; j < g.right.size(); j++) {
    int child2 = g.right[j];
    MeanTemp mtc2 = game_mean_temp(child2);
    Dy m2 = mtc2.mean_ok ? mtc2.mean : Dy{0,0};
    bool ok2 = mtc2.mean_ok;
    if (!ok2) {
      Dy d2;
      ok2 = to_dyadic(child2, d2);
      if (ok2) m2 = d2;
    }
    if (!ok2) {
      MeanTemp r1;
      r1.mean_ok = false;
      r1.temp_ok = false;
      mt_cache[idx] = r1;
      return r1;
    }
    rights.push_back(m2);
  }
  if (lefts.empty() && rights.empty()) {
    MeanTemp r2;
    r2.mean_ok = true;
    r2.temp_ok = true;
    r2.mean = Dy{0,0};
    r2.temp = Dy{0,0};
    mt_cache[idx] = r2;
    return r2;
  }
  Dy val;
  bool hasVal = to_dyadic(idx, val);
  if (lefts.empty() || rights.empty()) {
    MeanTemp r3;
    r3.mean_ok = hasVal;
    r3.temp_ok = true;
    r3.mean = hasVal ? val : Dy{0,0};
    r3.temp = Dy{0,0};
    mt_cache[idx] = r3;
    return r3;
  }
  Dy lower = lefts[0];
  for (size_t li = 1; li < lefts.size(); li++) if (dy_cmp(lefts[li], lower) > 0) lower = lefts[li];
  Dy upper = rights[0];
  for (size_t ri = 1; ri < rights.size(); ri++) if (dy_cmp(rights[ri], upper) < 0) upper = rights[ri];
  if (hasVal && dy_cmp(val, lower) >= 0 && dy_cmp(val, upper) <= 0) {
    MeanTemp r4;
    r4.mean_ok = true;
    r4.temp_ok = true;
    r4.mean = val;
    r4.temp = Dy{0,0};
    mt_cache[idx] = r4;
    return r4;
  }
  Dy diff = dy_sub(upper, lower);
  if (diff.num <= 0) {
    MeanTemp r5;
    r5.mean_ok = true;
    r5.temp_ok = true;
    r5.mean = dy_half(dy_add(lower, upper));
    r5.temp = Dy{0,0};
    mt_cache[idx] = r5;
    return r5;
  }
  MeanTemp r6;
  r6.mean_ok = true;
  r6.temp_ok = true;
  r6.mean = dy_half(dy_add(lower, upper));
  r6.temp = dy_half(diff);
  mt_cache[idx] = r6;
  return r6;
}

static std::string key_of(const std::vector<std::vector<int>>& s) {
  std::ostringstream oss;
  for (size_t y = 0; y < s.size(); y++) {
    for (size_t x = 0; x < s[y].size(); x++) {
      if (x) oss << ",";
      oss << s[y][x];
    }
    if (y + 1 < s.size()) oss << "|";
  }
  return oss.str();
}

static std::vector<std::pair<int,int>> neigh(int x, int y, int n) {
  std::vector<std::pair<int,int>> arr;
  if (x > 0) arr.emplace_back(x - 1, y);
  if (x + 1 < n) arr.emplace_back(x + 1, y);
  if (y > 0) arr.emplace_back(x, y - 1);
  if (y + 1 < n) arr.emplace_back(x, y + 1);
  return arr;
}

static void group_and_libs(const std::vector<std::vector<int>>& s, int x, int y, std::vector<std::pair<int,int>>& group, std::unordered_set<long long>& libs) {
  int n = (int)s.size();
  int color = s[y][x];
  std::queue<std::pair<int,int>> q;
  std::unordered_set<long long> seen;
  q.emplace(x, y);
  seen.insert(((long long)x<<32) | (unsigned long long)y);
  while (!q.empty()) {
    auto [cx, cy] = q.front(); q.pop();
    group.emplace_back(cx, cy);
    for (auto [nx, ny] : neigh(cx, cy, n)) {
      long long key = ((long long)nx<<32) | (unsigned long long)ny;
      int v = s[ny][nx];
      if (v == 0) libs.insert(key);
      else if (v == color && seen.find(key) == seen.end()) { seen.insert(key); q.emplace(nx, ny); }
    }
  }
}

static void remove_group(std::vector<std::vector<int>>& s, const std::vector<std::pair<int,int>>& g) {
  for (auto [x,y] : g) s[y][x] = 0;
}

static bool play_move(const std::vector<std::vector<int>>& s, int player, int x, int y, std::vector<std::vector<int>>& out) {
  int n = (int)s.size();
  if (s[y][x] != 0) return false;
  out = s;
  out[y][x] = player;
  int opp = -player;
  std::vector<std::vector<std::pair<int,int>>> captured;
  for (auto [nx, ny] : neigh(x, y, n)) {
    if (out[ny][nx] == opp) {
      std::vector<std::pair<int,int>> group;
      std::unordered_set<long long> libs;
      group_and_libs(out, nx, ny, group, libs);
      if (libs.empty()) captured.push_back(group);
    }
  }
  for (auto& g : captured) remove_group(out, g);
  std::vector<std::pair<int,int>> selfGroup;
  std::unordered_set<long long> selfLibs;
  group_and_libs(out, x, y, selfGroup, selfLibs);
  if (selfLibs.empty()) return false;
  return true;
}

static int territory_score(const std::vector<std::vector<int>>& s) {
  int n = (int)s.size();
  int b = 0, w = 0;
  for (int y = 0; y < n; y++) for (int x = 0; x < n; x++) { if (s[y][x] == 1) b++; else if (s[y][x] == -1) w++; }
  std::unordered_set<long long> seen;
  for (int y = 0; y < n; y++) {
    for (int x = 0; x < n; x++) {
      if (s[y][x] != 0) continue;
      long long key0 = ((long long)x<<32) | (unsigned long long)y;
      if (seen.find(key0) != seen.end()) continue;
      std::queue<std::pair<int,int>> q;
      q.emplace(x, y);
      std::vector<std::pair<int,int>> empties;
      std::unordered_set<int> adj;
      seen.insert(key0);
      while (!q.empty()) {
        auto [cx, cy] = q.front(); q.pop();
        empties.emplace_back(cx, cy);
        for (auto [nx, ny] : neigh(cx, cy, n)) {
          int v = s[ny][nx];
          long long key = ((long long)nx<<32) | (unsigned long long)ny;
          if (v == 0 && seen.find(key) == seen.end()) { seen.insert(key); q.emplace(nx, ny); }
          else if (v == 1) adj.insert(1);
          else if (v == -1) adj.insert(-1);
        }
      }
      if (adj.size() == 1) {
        if (adj.count(1)) b += (int)empties.size();
        else w += (int)empties.size();
      }
    }
  }
  return b - w;
}

struct Region {
  int id;
  std::vector<std::pair<int,int>> cells;
  std::unordered_set<long long> set;
};

static std::vector<Region> build_regions(const std::vector<std::vector<int>>& s) {
  int n = (int)s.size();
  std::vector<std::vector<int>> comp(n, std::vector<int>(n, -1));
  std::vector<Region> regions;
  for (int y = 0; y < n; y++) {
    for (int x = 0; x < n; x++) {
      if (s[y][x] != 0 || comp[y][x] != -1) continue;
      int id = (int)regions.size();
      std::vector<std::pair<int,int>> cells;
      std::queue<std::pair<int,int>> q;
      q.emplace(x,y);
      comp[y][x] = id;
      while (!q.empty()) {
        auto [cx, cy] = q.front(); q.pop();
        cells.emplace_back(cx, cy);
        for (auto [nx, ny] : neigh(cx, cy, n)) {
          if (s[ny][nx] == 0 && comp[ny][nx] == -1) { comp[ny][nx] = id; q.emplace(nx, ny); }
        }
      }
      std::unordered_set<long long> set;
      for (auto [ex, ey] : cells) set.insert(((long long)ex<<32) | (unsigned long long)ey);
      Region r;
      r.id = id;
      r.cells = cells;
      r.set = std::move(set);
      regions.push_back(std::move(r));
    }
  }
  return regions;
}

static int int_value(int n) {
  if (n == 0) return IDX_ZERO;
  if (n > 0) {
    int acc = IDX_ONE;
    for (int i = 1; i < n; i++) acc = plus_idx(acc, IDX_ONE);
    return acc;
  }
  int pos = int_value(-n);
  return neg(pos);
}

static int position_to_region_game(const std::vector<std::vector<int>>& s, const Region& region, std::unordered_set<std::string>& visited);

static std::vector<int> options_for_player_restricted(const std::vector<std::vector<int>>& s, int player, const Region& region, std::unordered_set<std::string>& visited) {
  std::vector<int> opts;
  int n = (int)s.size();
  for (auto [x,y] : region.cells) {
    if (s[y][x] != 0) continue;
    std::vector<std::vector<int>> next;
    if (!play_move(s, player, x, y, next)) continue;
    std::string childKey = key_of(next) + std::string("|R:") + std::to_string(region.id);
    if (visited.find(childKey) != visited.end()) continue;
    visited.insert(childKey);
    int gi = position_to_region_game(next, region, visited);
    opts.push_back(gi);
    visited.erase(childKey);
  }
  return opts;
}

static int position_to_region_game(const std::vector<std::vector<int>>& s, const Region& region, std::unordered_set<std::string>& visited) {
  std::vector<int> lefts = options_for_player_restricted(s, 1, region, visited);
  std::vector<int> rights = options_for_player_restricted(s, -1, region, visited);
  return get_game(lefts, rights);
}

static std::vector<int> options_for_player(const std::vector<std::vector<int>>& s, int player, bool justPassed, std::unordered_set<std::string>& visited) {
  std::vector<int> opts;
  std::string baseKey = key_of(s) + std::string("|P:") + std::string(justPassed ? "1" : "0");
  if (justPassed) {
    int sc = territory_score(s);
    opts.push_back(int_value(sc));
  }
  int n = (int)s.size();
  for (int y = 0; y < n; y++) {
    for (int x = 0; x < n; x++) {
      if (s[y][x] != 0) continue;
      std::vector<std::vector<int>> next;
      if (!play_move(s, player, x, y, next)) continue;
      std::string childKey = key_of(next) + std::string("|P:0");
      if (visited.find(childKey) != visited.end()) continue;
      visited.insert(childKey);
      int gi = get_game(options_for_player(next, 1, false, visited), options_for_player(next, -1, false, visited));
      opts.push_back(gi);
      visited.erase(childKey);
    }
  }
  if (!justPassed) {
    std::string passKey = key_of(s) + std::string("|P:1");
    if (visited.find(passKey) == visited.end()) {
      visited.insert(passKey);
      int gi = get_game(options_for_player(s, 1, true, visited), options_for_player(s, -1, true, visited));
      opts.push_back(gi);
      visited.erase(passKey);
    }
  }
  return opts;
}

static int position_to_game(const std::vector<std::vector<int>>& s, bool justPassed, std::unordered_set<std::string>& visited) {
  std::vector<int> lefts = options_for_player(s, 1, justPassed, visited);
  std::vector<int> rights = options_for_player(s, -1, justPassed, visited);
  return get_game(lefts, rights);
}

static ComputeResult compute_go_value(const std::vector<int>& board_flat, int size) {
  std::vector<std::vector<int>> s(size, std::vector<int>(size, 0));
  for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) s[y][x] = board_flat[y*size + x];
  std::vector<Region> regions = build_regions(s);
  int sum = IDX_ZERO;
  std::vector<RegionItem> items;
  for (const auto& r : regions) {
    std::unordered_set<std::string> visited;
    visited.insert(key_of(s) + std::string("|R:") + std::to_string(r.id));
    int gi = position_to_region_game(s, r, visited);
    sum = plus_idx(sum, gi);
    MeanTemp mt = game_mean_temp(gi);
    std::string meanStr = mt.mean_ok ? dy_to_string(mt.mean) : std::string("");
    RegionItem it;
    it.id = r.id;
    it.idx = gi;
    it.empties = (int)r.cells.size();
    it.value_str = display_str(gi);
    it.mean_str = meanStr;
    items.push_back(it);
  }
  ComputeResult res;
  res.sum_idx = sum;
  res.sum_str = display_str(sum);
  res.items = items;
  return res;
}

static ComputeResult compute_go_value_subset(const std::vector<int>& board_flat, int size, const std::vector<int>& selected_ids) {
  std::vector<std::vector<int>> s(size, std::vector<int>(size, 0));
  for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) s[y][x] = board_flat[y*size + x];
  std::vector<Region> regions = build_regions(s);
  std::unordered_set<int> sel;
  for (size_t i = 0; i < selected_ids.size(); i++) sel.insert(selected_ids[i]);
  if (sel.empty()) {
    return compute_go_value(board_flat, size);
  }
  int sum = IDX_ZERO;
  std::vector<RegionItem> items;
  for (const auto& r : regions) {
    if (sel.find(r.id) == sel.end()) continue;
    std::unordered_set<std::string> visited;
    visited.insert(key_of(s) + std::string("|R:") + std::to_string(r.id));
    int gi = position_to_region_game(s, r, visited);
    sum = plus_idx(sum, gi);
    MeanTemp mt = game_mean_temp(gi);
    std::string meanStr = mt.mean_ok ? dy_to_string(mt.mean) : std::string("");
    RegionItem it;
    it.id = r.id;
    it.idx = gi;
    it.empties = (int)r.cells.size();
    it.value_str = display_str(gi);
    it.mean_str = meanStr;
    items.push_back(it);
  }
  ComputeResult res;
  res.sum_idx = sum;
  res.sum_str = display_str(sum);
  res.items = items;
  return res;
}

static void init_standard() {
  if (IDX_ZERO != -1) return;
  std::vector<int> empty;
  IDX_ZERO = get_game(empty, empty);
  std::vector<int> left1{IDX_ZERO};
  std::vector<int> right1;
  IDX_ONE = get_game(left1, right1);
}

static bool ready() {
  return true;
}

EMSCRIPTEN_BINDINGS(cgt_module) {
  register_vector<int>("VectorInt");
  register_vector<RegionItem>("VectorRegionItem");
  value_object<Dy>("Dy")
    .field("num", &Dy::num)
    .field("exp", &Dy::exp);
  value_object<MeanTemp>("MeanTemp")
    .field("mean_ok", &MeanTemp::mean_ok)
    .field("temp_ok", &MeanTemp::temp_ok)
    .field("mean", &MeanTemp::mean)
    .field("temp", &MeanTemp::temp);
  value_object<RegionItem>("RegionItem")
    .field("id", &RegionItem::id)
    .field("idx", &RegionItem::idx)
    .field("empties", &RegionItem::empties)
    .field("value_str", &RegionItem::value_str)
    .field("mean_str", &RegionItem::mean_str);
  value_object<ComputeResult>("ComputeResult")
    .field("sum_idx", &ComputeResult::sum_idx)
    .field("sum_str", &ComputeResult::sum_str)
    .field("items", &ComputeResult::items);
  function("init_standard", &init_standard);
  function("ready", &ready);
  function("compute_go_value", &compute_go_value);
  function("compute_go_value_subset", &compute_go_value_subset);
  function("display_str", &display_str);
  function("game_mean_temp", &game_mean_temp);
}
