"""FIDE Single Round-Robin Berger pairing and tiebreak-aware championship simulator."""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np

from .data_loader import normalize_player_name, normalize_result, parse_elo
from .predictor import ChessPreMatchPredictor


def is_single_round_robin(tour_format: Optional[str]) -> bool:
    """Return True for individual single round-robin formats (excluding double/team)."""
    text = str(tour_format or "").lower()
    if "round-robin" not in text and "round robin" not in text:
        return False
    if "double" in text or "team" in text:
        return False
    return True


def fide_berger_table(n_players: int) -> List[List[Tuple[int, int]]]:
    """
    Generate exact FIDE Handbook C.05 Berger pairing tables for n players.

    Returns a list of rounds, each containing 0-indexed (white_idx, black_idx) pairs.
    If n_players is odd, bye games involving index n_players are omitted.
    """
    if n_players < 2:
        return []
    is_odd = (n_players % 2) == 1
    m = n_players + 1 if is_odd else n_players
    half = m // 2
    rounds: List[List[Tuple[int, int]]] = []

    for r in range(1, m):
        x = ((r - 1) * half) % (m - 1) + 1  # 1-indexed partner of m
        pairs_1idx: List[Tuple[int, int]] = []
        if r % 2 == 1:
            pairs_1idx.append((x, m))
        else:
            pairs_1idx.append((m, x))

        for k in range(1, half):
            a = ((x - 1 + k) % (m - 1)) + 1
            b = ((x - 1 - k) % (m - 1)) + 1
            pairs_1idx.append((a, b))

        round_pairs = [
            (w - 1, b - 1)
            for (w, b) in pairs_1idx
            if w <= n_players and b <= n_players
        ]
        rounds.append(round_pairs)
    return rounds


def _infer_berger_mapping(
    players: List[str],
    rounds_data: List[Dict[str, Any]],
) -> Optional[List[Tuple[str, int, str, str]]]:
    """
    If Round 1..k matches a clean Berger table mapping, return remaining (round_name, round_idx, white, black).
    Otherwise return None to fall back to color-balanced FIDE remaining-pair completion.
    """
    n = len(players)
    if n < 3 or not rounds_data:
        return None
    r1_games = rounds_data[0].get("pairings") or []
    expected_r1_cnt = n // 2
    if len(r1_games) != expected_r1_cnt:
        return None

    # Check if Round 1 players form a disjoint matching of size n//2
    used: Set[str] = set()
    r1_pairs: List[Tuple[str, str]] = []
    for g in r1_games:
        w = normalize_player_name(g.get("white", ""))
        b = normalize_player_name(g.get("black", ""))
        if not w or not b or w == b or w in used or b in used:
            return None
        used.add(w)
        used.add(b)
        r1_pairs.append((w, b))

    # Map Round 1 pairs directly to FIDE Berger Round 1 slots: (1, m), (2, m-1), ...
    m = n + 1 if (n % 2 == 1) else n
    half = m // 2
    idx_to_player: Dict[int, str] = {}

    if n % 2 == 0 and len(r1_pairs) == half:
        # Pair 0 -> (1, m), Pair k -> (k+1, m-k)
        for k, (w, b) in enumerate(r1_pairs):
            if k == 0:
                idx_to_player[0] = w
                idx_to_player[m - 1] = b
            else:
                idx_to_player[k] = w
                idx_to_player[m - 1 - k] = b
    else:
        return None

    if len(idx_to_player) != n:
        return None

    table = fide_berger_table(n)
    # Verify Round 2 (if already published) matches this exact Berger mapping
    if len(rounds_data) >= 2 and (rounds_data[1].get("pairings") or []):
        r2_actual = {
            frozenset((normalize_player_name(g["white"]), normalize_player_name(g["black"])))
            for g in rounds_data[1]["pairings"]
        }
        r2_expected = {
            frozenset((idx_to_player[w_i], idx_to_player[b_i]))
            for (w_i, b_i) in table[1]
        }
        if r2_actual != r2_expected:
            return None

    played_pairs: Set[frozenset] = set()
    for rd in rounds_data:
        for g in rd.get("pairings") or []:
            w = normalize_player_name(g.get("white", ""))
            b = normalize_player_name(g.get("black", ""))
            if w and b:
                played_pairs.add(frozenset((w, b)))

    remaining: List[Tuple[str, int, str, str]] = []
    for r_idx, r_pairs in enumerate(table):
        r_name = f"Round {r_idx + 1}"
        for w_i, b_i in r_pairs:
            w_name = idx_to_player[w_i]
            b_name = idx_to_player[b_i]
            if frozenset((w_name, b_name)) not in played_pairs:
                remaining.append((r_name, r_idx + 1, w_name, b_name))
    return remaining


def complete_remaining_rr_pairings(
    players: List[str],
    rounds_data: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Build all remaining unplayed games in a single round-robin tournament using
    FIDE Berger pairing tables (or color-balanced round completion if Round 1 differs).
    """
    # Collect already known pairings & color counts
    white_counts: Dict[str, int] = {p: 0 for p in players}
    black_counts: Dict[str, int] = {p: 0 for p in players}
    seen_pairs: Set[frozenset] = set()

    for rd in rounds_data:
        for g in rd.get("pairings") or []:
            w = normalize_player_name(g.get("white", ""))
            b = normalize_player_name(g.get("black", ""))
            if w in white_counts and b in black_counts:
                white_counts[w] += 1
                black_counts[b] += 1
                seen_pairs.add(frozenset((w, b)))

    berger_rem = _infer_berger_mapping(players, rounds_data)
    if berger_rem is not None:
        return [
            {"round_name": rname, "round_num": rnum, "white": w, "black": b}
            for (rname, rnum, w, b) in berger_rem
        ]

    # Fallback: FIDE Berger round structure over players ordered by seed/rating, filtering already-played pairs
    n = len(players)
    table = fide_berger_table(n)
    rem_pairs: List[Tuple[int, str, str]] = []
    max_known_round = sum(1 for rd in rounds_data if rd.get("pairings"))
    next_round = max_known_round + 1

    # Gather unplayed pairs in canonical Berger order, assigning White to fewer-White player
    unplayed_edges: List[Tuple[str, str]] = []
    for r_pairs in table:
        for w_i, b_i in r_pairs:
            u, v = players[w_i], players[b_i]
            if frozenset((u, v)) in seen_pairs:
                continue
            seen_pairs.add(frozenset((u, v)))
            if white_counts[u] < white_counts[v]:
                w_p, b_p = u, v
            elif white_counts[v] < white_counts[u]:
                w_p, b_p = v, u
            else:
                w_p, b_p = u, v
            white_counts[w_p] += 1
            black_counts[b_p] += 1
            unplayed_edges.append((w_p, b_p))

    # Pack unplayed edges greedily into rounds without repeating a player in the same round
    scheduled: List[Dict[str, Any]] = []
    pool = list(unplayed_edges)
    r_num = next_round
    while pool:
        used_in_round: Set[str] = set()
        next_pool: List[Tuple[str, str]] = []
        for w_p, b_p in pool:
            if w_p not in used_in_round and b_p not in used_in_round:
                used_in_round.add(w_p)
                used_in_round.add(b_p)
                scheduled.append(
                    {
                        "round_name": f"Round {r_num}",
                        "round_num": r_num,
                        "white": w_p,
                        "black": b_p,
                    }
                )
            else:
                next_pool.append((w_p, b_p))
        pool = next_pool
        r_num += 1

    return scheduled


def _extract_expected_player_count(tour_format: str, fallback: int) -> int:
    m = re.search(r"(\d+)\s*[-\s]*player", str(tour_format or ""), re.IGNORECASE)
    if m:
        return int(m.group(1))
    return fallback


def simulate_fide_round_robin(
    tour: Dict[str, Any],
    rounds_data: List[Dict[str, Any]],
    predictor: ChessPreMatchPredictor,
    locked_predictions: Optional[Dict[Tuple[str, str, str], Dict[str, Any]]] = None,
    n_sims: int = 5000,
    seed: int = 42,
) -> Optional[Dict[str, Any]]:
    """
    Simulate remaining games in a FIDE Single Round-Robin tournament and compute
    championship, top-3, and full rank distribution probabilities under FIDE tiebreaks:
    1. Points
    2. Direct Encounter (among tied players)
    3. Sonneborn-Berger
    4. Number of Wins
    5. Number of Black Games
    """
    player_elos: Dict[str, float] = {}
    player_order: List[str] = []

    def ensure_player(name: str, elo_val: Any) -> str:
        clean = normalize_player_name(name)
        if not clean:
            return ""
        if clean not in player_elos:
            player_order.append(clean)
            e = parse_elo(elo_val)
            player_elos[clean] = float(e) if not math.isnan(e) else 2400.0
        else:
            e = parse_elo(elo_val)
            if not math.isnan(e):
                player_elos[clean] = float(e)
        return clean

    for rd in rounds_data:
        for g in rd.get("pairings") or []:
            ensure_player(g.get("white", ""), g.get("white_elo"))
            ensure_player(g.get("black", ""), g.get("black_elo"))

    n = len(player_order)
    if n < 3 or n > 24:
        return None

    p_idx = {name: i for i, name in enumerate(player_order)}
    time_control = str(tour.get("time_control") or "classical")
    locked_map = locked_predictions or {}

    base_scores = np.zeros((n, n), dtype=float)
    base_wins = np.zeros(n, dtype=float)
    black_games = np.zeros(n, dtype=float)
    games_played = np.zeros(n, dtype=int)

    unplayed_games: List[Dict[str, Any]] = []
    played_rounds = 0

    for rd in rounds_data:
        pairings = rd.get("pairings") or []
        rid = str(rd.get("round_id") or rd.get("round_name") or "")
        rname = str(rd.get("round_name") or "")
        if pairings and all(normalize_result(g.get("status")) is not None for g in pairings):
            played_rounds += 1

        for g in pairings:
            w = normalize_player_name(g.get("white", ""))
            b = normalize_player_name(g.get("black", ""))
            if w not in p_idx or b not in p_idx:
                continue
            wi, bi = p_idx[w], p_idx[b]
            black_games[bi] += 1.0
            lbl = normalize_result(g.get("status"))
            if lbl is not None:
                ws = {0: 1.0, 1: 0.5, 2: 0.0}[lbl]
                bs = 1.0 - ws
                base_scores[wi, bi] += ws
                base_scores[bi, wi] += bs
                if lbl == 0:
                    base_wins[wi] += 1.0
                elif lbl == 2:
                    base_wins[bi] += 1.0
                games_played[wi] += 1
                games_played[bi] += 1
            else:
                pr = locked_map.get((rid, w, b)) or predictor.predict(
                    white=w,
                    black=b,
                    white_elo=player_elos.get(w),
                    black_elo=player_elos.get(b),
                    time_control=time_control,
                ).to_dict()
                unplayed_games.append(
                    {
                        "round_name": rname,
                        "white": w,
                        "black": b,
                        "wi": wi,
                        "bi": bi,
                        "p_w": float(pr["p_white_win"]),
                        "p_d": float(pr["p_draw"]),
                        "p_b": float(pr["p_black_win"]),
                    }
                )

    # Complete remaining future rounds via FIDE Berger pairing rules
    future_pairings = complete_remaining_rr_pairings(player_order, rounds_data)
    for fg in future_pairings:
        w, b = fg["white"], fg["black"]
        wi, bi = p_idx[w], p_idx[b]
        black_games[bi] += 1.0
        pr = predictor.predict(
            white=w,
            black=b,
            white_elo=player_elos.get(w),
            black_elo=player_elos.get(b),
            time_control=time_control,
        ).to_dict()
        unplayed_games.append(
            {
                "round_name": fg["round_name"],
                "white": w,
                "black": b,
                "wi": wi,
                "bi": bi,
                "p_w": float(pr["p_white_win"]),
                "p_d": float(pr["p_draw"]),
                "p_b": float(pr["p_black_win"]),
            }
        )

    current_pts = base_scores.sum(axis=1)
    games_rem = np.zeros(n, dtype=int)
    for ug in unplayed_games:
        games_rem[ug["wi"]] += 1
        games_rem[ug["bi"]] += 1

    # Vectorized Monte Carlo simulation
    rng = np.random.default_rng(seed)
    sim_scores = np.broadcast_to(base_scores, (n_sims, n, n)).copy()
    sim_wins = np.broadcast_to(base_wins, (n_sims, n)).copy()

    if unplayed_games:
        u_arr = rng.random((n_sims, len(unplayed_games)))
        for idx_g, ug in enumerate(unplayed_games):
            wi, bi = ug["wi"], ug["bi"]
            pw, pd = ug["p_w"], ug["p_d"]
            u = u_arr[:, idx_g]
            w_mask = u < pw
            d_mask = (u >= pw) & (u < pw + pd)
            b_mask = ~(w_mask | d_mask)

            ws = np.where(w_mask, 1.0, np.where(d_mask, 0.5, 0.0))
            bs = 1.0 - ws
            sim_scores[:, wi, bi] += ws
            sim_scores[:, bi, wi] += bs
            sim_wins[:, wi] += w_mask.astype(float)
            sim_wins[:, bi] += b_mask.astype(float)

    total_pts = sim_scores.sum(axis=2)  # (n_sims, n)
    # Sonneborn-Berger: S_ij * P_j summed over j
    sb = np.einsum("sij,sj->si", sim_scores, total_pts)

    # Apply FIDE Tiebreaks per trial: Points -> Direct Encounter -> SB -> Wins -> Black Games
    rank_counts = np.zeros((n, n), dtype=float)
    exp_ranks = np.zeros(n, dtype=float)

    for s in range(n_sims):
        pts_s = total_pts[s]
        sb_s = sb[s]
        wins_s = sim_wins[s]
        # Direct encounter boost among players tied on total points
        de_s = np.zeros(n, dtype=float)
        unique_pts = np.unique(pts_s)
        if len(unique_pts) < n:
            mat_s = sim_scores[s]
            for val in unique_pts:
                tied = np.where(np.abs(pts_s - val) < 1e-9)[0]
                if len(tied) > 1:
                    de_s[tied] = mat_s[np.ix_(tied, tied)].sum(axis=1)

        # Sort descending by (pts, de, sb, wins, black_games)
        order = sorted(
            range(n),
            key=lambda i: (
                round(float(pts_s[i]), 6),
                round(float(de_s[i]), 6),
                round(float(sb_s[i]), 6),
                float(wins_s[i]),
                float(black_games[i]),
            ),
            reverse=True,
        )
        for r_pos, player_i in enumerate(order):
            rank_counts[player_i, r_pos] += 1.0
            exp_ranks[player_i] += (r_pos + 1)

    rank_probs = rank_counts / float(n_sims)
    exp_pts = total_pts.mean(axis=0)
    exp_ranks /= float(n_sims)
    current_sb = np.dot(base_scores, current_pts)

    standings = []
    for i, name in enumerate(player_order):
        standings.append(
            {
                "name": name,
                "elo": int(round(player_elos[name])),
                "current_points": round(float(current_pts[i]), 1),
                "current_sb": round(float(current_sb[i]), 2),
                "games_played": int(games_played[i]),
                "games_remaining": int(games_rem[i]),
                "p_champion": round(float(rank_probs[i, 0]), 4),
                "p_top3": round(float(rank_probs[i, : min(3, n)].sum()), 4),
                "expected_points": round(float(exp_pts[i]), 2),
                "expected_rank": round(float(exp_ranks[i]), 2),
                "rank_distribution": [round(float(v), 4) for v in rank_probs[i]],
            }
        )

    standings.sort(
        key=lambda r: (r["p_champion"], r["expected_points"], -r["expected_rank"]),
        reverse=True,
    )
    for pos, row in enumerate(standings, start=1):
        row["predicted_rank"] = pos

    total_rounds_expected = max(
        len(rounds_data),
        _extract_expected_player_count(str(tour.get("format") or ""), n) - (0 if n % 2 == 1 else 1),
    )

    upcoming_preview = [
        {
            "round_name": ug["round_name"],
            "white": ug["white"],
            "black": ug["black"],
            "p_white_win": round(ug["p_w"], 4),
            "p_draw": round(ug["p_d"], 4),
            "p_black_win": round(ug["p_b"], 4),
        }
        for ug in unplayed_games[:30]
    ]

    return {
        "tour_id": tour.get("tour_id"),
        "tour_name": tour.get("tour_name"),
        "tier": int(tour.get("tier") or 0),
        "format": tour.get("format") or f"{n}-player round-robin",
        "time_control": time_control,
        "n_players": n,
        "rounds_played": played_rounds,
        "total_rounds": total_rounds_expected,
        "n_simulations": n_sims,
        "tiebreaks": ["积分", "直胜(DE)", "索伯分(SB)", "胜局数", "执黑局数"],
        "standings": standings,
        "upcoming_pairings": upcoming_preview,
    }
