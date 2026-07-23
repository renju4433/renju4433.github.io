# Tiny GTO

A CFR+ poker solver and trainer for **Kuhn poker**, **Leduc hold'em**, and
**Rhode Island hold'em**, running as a single static page — a miniature
GTO Wizard on games small enough to solve (essentially) exactly.

CFR+ is the algorithm that [essentially solved heads-up limit hold'em](https://webdocs.cs.ualberta.ca/~bowling/papers/15science.pdf)
(Cepheus, Bowling et al., *Science* 2015). Kuhn and Leduc are the standard
research benchmarks below it; Rhode Island hold'em is the game Gilpin &
Sandholm solved in 2005 — at the time the largest imperfect-information game
ever solved. This repo climbs that ladder as far as a static page can.

## The games

| Game | Infosets | Solved | How |
|---|---|---|---|
| Kuhn poker | 12 | live in browser, ~20 ms | vectorized CFR+ |
| Leduc hold'em | 288 | live in browser, ~200 ms | vectorized CFR+ |
| Rhode Island hold'em (rank deck) | ~871,000 | offline (~5 min), shipped precomputed | `build-rih.js` |

Rhode Island hold'em here is the rank-deck variant: one hole card, three
betting streets (bets 2/4/4, three-bet cap), a board card revealed before
streets two and three, and 3-card-poker hand ranks minus flushes
(trips > straight > pair > high card). Suits are ignored, which keeps the
game exactly solvable at ~871k information sets while preserving what makes
it feel like hold'em: board texture, draws, pairing, multi-street betting.

## What it does

- **Solver** (`vsolver.js`) — vectorized CFR+ over an enumerated public tree:
  strategies live in flat typed arrays indexed by (node, hole rank, action),
  traversals carry per-rank reach vectors, and card removal is exact via
  per-board joint deal-weight matrices. This is the same range-vector
  architecture real postflop solvers use.
- **Exploitability** — exact best-response computation, displayed live so you
  can see how close each strategy is to Nash (milli-antes per hand).
- **Strategy browser** — every information set with its GTO action mix.
- **Trainer** — play against the solved bot; after every decision you see the
  GTO mix and the exact EV your choice gave up, computed against the
  posterior over hidden cards. Session tracker totals EV loss per decision.
- **Drill mode** — costly mistakes are captured as replayable spots (same
  cards, same action sequence). Drill re-deals them, lowest-streak first;
  a spot retires once you answer it correctly twice in a row.
- **Review tab** — per-street EV-loss stats, your worst open leaks, and a
  hand history (last 100 hands) with full replay of every action and
  feedback line.
- Stats, history and the drill queue persist in `localStorage` per game;
  a reset link clears them.

## Files

- `vsolver.js` — vectorized CFR+ engine + game definitions (browser global /
  Node module).
- `solver.js` — the original scalar CFR+ solver, kept as a cross-validation
  reference.
- `build-rih.js` — offline solve + quantized strategy export
  (`node build-rih.js` regenerates `rih-strategy.js`).
- `rih-strategy.js` — precomputed Rhode Island hold'em strategy (~2 MB
  quantized to 8 bits per action; generated file).
- `index.html` — the app; serve statically (GitHub Pages works).

## Sanity checks

- Kuhn value converges to −1/18 ≈ −0.0556 antes with the known analytic
  equilibrium; Leduc to −0.0856, matching published results. The vectorized
  engine is cross-validated against the independent scalar solver.
- Rhode Island hold'em (rank deck) value ≈ −0.120 antes for player 1.

## The ladder from here

- **Full-suit Rhode Island hold'em** — needs suit-isomorphism bucketing;
  ~10× more infosets. Feasible offline with this architecture.
- **HU Limit Texas hold'em via bucketed abstraction** — E[HS] bucketing +
  CFR on the abstract game (Sparbot-class, circa-2003 SOTA). Feasible;
  approximate.
- **Cepheus-class HU Limit** — 3.19×10¹⁴ decision points, ~900 CPU-years,
  11 TB compressed strategy. Not a static-page project.
