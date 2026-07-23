# Pocket GTO — client-side Texas Hold'em solver

A range-vs-range **postflop GTO solver** that runs entirely in the browser.
No backend, no build step, no install. Open `index.html` and solve.

Built to work well on mobile: responsive layout, touch targets, and a solve
loop that runs in small async batches so the page never hard-freezes.

## Run it

**Live:** [pocket-gto.vercel.app](https://pocket-gto.vercel.app/)

Or open **`index.html`** locally in any modern browser (desktop or phone) — double-click
the file, or host the folder anywhere static.

> When served over http(s) (like the Vercel link) the solver runs in a **Web
> Worker**, so the page stays fully responsive during big solves. Opened from
> `file://` it falls back to the main thread in small async batches (Workers
> are blocked from `file://` in most browsers) — "just open the file" still
> works everywhere.

## What it does

Given two ranges, a board (flop / turn / river), pot, effective stack, and a
betting abstraction, it computes an approximate **Nash equilibrium** strategy for
the heads-up postflop subgame and shows:

- The **strategy** on a 13×13 grid, each cell coloured by its action mix
  (check / bet sizes / all-in). Tap a hand for exact frequencies. The grid starts
  on the OOP first decision; use the **"See IP's strategy after…"** buttons to walk
  into the in-position response (and deeper), with Back / Root to navigate the line.
- **EV per combo** for each player and **exploitability** (the convergence metric —
  how much an opponent could gain by best-responding, as % of pot). Lower = closer
  to GTO.

It also ships **preflop reference charts** (collapsible, at the bottom):

- **RFI opening ranges** — tap a seat to see its open-raise range (8-max, 100bb).
- **vs-RFI charts** — pick the opener's seat, then your seat, to see your **call** (blue)
  and **3-bet** (green) ranges. The SB is 3-bet-or-fold; the BB defends wide.

Every chart has **→ OOP / → IP** buttons to load the range straight into the solver.
These are model-based study baselines, not exact solver output.

### Range notation

| Form | Example |
|------|---------|
| Pairs | `AA`, `TT+`, `99-66` |
| Suited | `AKs`, `ATs+`, `A9s-A6s` |
| Offsuit | `AKo` |
| Both | `AK` |
| Exact combo | `AhKd` |
| Weighted | `AA:0.5` |

Separate entries with commas. Board: `Qs Jh 7d` (flop), add a 4th card for the
turn, 5th for the river.

## How it works (the engine)

`engine.js` is dependency-free and `require()`-able in Node, so it's unit-tested
headlessly.

- **7-card evaluator** — packs the best 5-card hand into a comparable integer.
- **Vectorized DCFR** — all combos at a public node are updated simultaneously
  (the modern range-vs-range approach). Full-enumeration solves use **discounted
  CFR** (α=1.5, β=0, γ=2), which typically reaches a given exploitability in a
  fraction of the iterations plain CFR+ needs; sampled mode uses vanilla MCCFR
  regrets with linear averaging (CFR+ flooring is unsound under sampling).
- **Auto-stop** — set a target exploitability (default 0.5% of pot) and the
  solve ends as soon as it's reached, instead of always burning max iterations.
- **Full chance enumeration** — turn solves enumerate every river; flop solves
  enumerate every turn+river runout.
- **Blocker-correct showdowns** — `O(n log n)` per showdown node via sorted
  prefix sums with per-card removal correction, instead of naive `O(n²)`.
- **Exact EV normalization** — EVs and exploitability are averaged over
  blocker-compatible matchups only (card-removal-exact, not the usual
  independence approximation).
- Utilities are tracked in net chips down the tree, so fold/showdown EVs are exact.

### Memory & speed optimizations (all lossless)

- **Flat typed-array pools** — every decision node stores an integer offset into
  two shared `Float32Array`s instead of owning its own arrays. Removes ~128 bytes
  of header overhead per node and turns millions of tiny allocations into two big
  ones. (Also: an over-budget build now aborts *before* allocating the float pools,
  so a rejected flop barely touches memory.)
- **Zero-allocation traversals** — all per-iteration scratch vectors come from a
  stack arena sized exactly at build time (worst root-to-leaf frame stack), so a
  solve allocates nothing per traversal: no GC pauses, much better cache locality.
- **Board-shared showdown caches** — hand scores and sort orders are cached per
  unique final board instead of per showdown node. Every betting line ending on
  the same river reuses one entry, collapsing ~10–20 duplicate caches per runout.
- **Size-adaptive strategy averaging** — small builds keep the exact average
  strategy (smooth convergence metrics, earlier auto-stop). On big builds
  (average pool >64 MB) DCFR reports its **last iterate** instead, halving the
  per-node float pools exactly where memory is the binding constraint; the
  exploitability readout then oscillates a little but is always honest — it
  measures the exact strategy being displayed. Sampled mode always keeps the
  average (its current strategy is too noisy); `exactAverage: true` forces it.
- **Reach pruning** — subtrees the opponent's strategy reaches with exactly zero
  probability are skipped (their values and regret deltas are provably zero).
  As dominated lines die off mid-solve, iterations get progressively cheaper.
- **Suit isomorphism** — runout cards that are strategically identical (related by
  a suit permutation that leaves both ranges and the board invariant) share one
  canonical sub-tree; hand indices are permuted between a card and its
  representative. Lossless — verified to reproduce the enumeration equilibrium.
  Typical flop savings: **monotone ≈3.5×, two-tone/paired ≈1.6×, rainbow none**
  (rainbow boards genuinely have no runout symmetry). Falls back to exact
  enumeration automatically when ranges have no suit symmetry (e.g. explicit combos).
- **MCCFR (public chance sampling)** — optional "Fast sampled" mode that samples one
  card at the first chance level per iteration and enumerates below it (an unbiased
  estimate of the full chance average). Iterations are ~45× cheaper on a flop; it
  needs many more of them and converges to the same equilibrium. Its real value is
  keeping each iteration short — useful in `file://` main-thread mode, where one
  full flop sweep would freeze the page for seconds. When the Worker is available,
  full enumeration usually reaches a target exploitability faster in wall-clock time.

### Performance / streets

| Street | Cost | Notes |
|--------|------|-------|
| **River** | instant | no chance nodes |
| **Turn** | fast | ~5k nodes for a typical spot; solves in seconds |
| **Flop** | heavy | enumerates ~2,000 runouts; keep ranges and bet-sizes small (the UI warns you) |

A high-fidelity full-flop solve with deep stacks and many bet sizes is a
desktop-grade workload; on a phone, prefer turn/river or trim the tree.

**Memory safety.** The build is capped by a memory budget (scaled to the device,
≤256 MB by default) and **aborts before it can exhaust RAM** — so an over-ambitious
flop spot returns a friendly "too large" message instead of freezing the machine.
The budget counts everything the solve will touch, including the lazily-built
showdown caches. **High memory (desktop)** raises the ceiling to ~768 MB for big
flop solves — the abort-guard still protects the machine either way. If you hit
the cap: solve the turn/river, trim ranges, use fewer bet/raise sizes, or lower
Max raises.

## Files

- `index.html` — UI markup + mobile-first CSS
- `app.js` — UI controller: worker/main-thread backend + solve loop
- `worker.js` — Web Worker wrapper around the engine (used when hosted)
- `engine.js` — solver (cards, ranges, tree, DCFR/CFR+, best-response)
- `test.js` — engine unit tests (`node test.js`)
- `smoke.js` — headless UI-wiring test (`node smoke.js`)

## Tests

```sh
node test.js      # evaluator + range parsing + CFR convergence
node smoke.js     # full app.js + engine.js wiring through a DOM stub
node iso-test.js  # suit isomorphism == enumeration equilibrium, + tree reduction
```

## Limitations

- Heads-up postflop only (no preflop tree, no multiway).
- Equal effective stacks; the starting pot is treated as split evenly.
- Bet/raise abstraction is whatever sizes you provide — equilibrium is for the
  *modelled* tree, like any solver.
- The minimum raise is modelled as 2× the call amount, a simplification of the
  exact rule (call + previous raise increment).
- No rake modelling.
- Educational tool. Converged output approximates GTO for the tree you specify.
