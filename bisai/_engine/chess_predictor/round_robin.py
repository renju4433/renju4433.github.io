"""FIDE Single Round-Robin Berger pairing and tiebreak-aware championship simulator."""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np

from .chess_results import TIEBREAK_LABELS
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


def is_individual_round_robin(tour_format: Optional[str]) -> bool:
    """Return True for individual round-robin formats (single or double, excluding team)."""
    text = str(tour_format or "").lower()
    if "round-robin" not in text and "round robin" not in text:
        return False
    if "team" in text:
        return False
    return True


def is_double_round_robin(
    tour_format: Optional[str],
    n_players: int = 0,
    total_rounds: int = 0,
) -> bool:
    """Detect double round-robin from explicit format text or round count vs player count."""
    text = str(tour_format or "").lower()
    if "double" in text or "双循环" in text:
        return True
    if n_players >= 3 and total_rounds > 0:
        single_rounds = n_players if (n_players % 2 == 1) else (n_players - 1)
        if total_rounds >= 2 * single_rounds:
            return True
    return False


def normalize_round_robin_format(
    tour_format: Optional[str],
    n_players: int,
    total_rounds: int,
) -> str:
    """Return canonical round-robin format distinguishing single vs double round-robin."""
    text = str(tour_format or "")
    if "team" in text.lower():
        return text or f"{n_players}-team round-robin"
    expected_n = _extract_expected_player_count(text, n_players)
    if is_double_round_robin(text, n_players=expected_n, total_rounds=total_rounds):
        return f"{expected_n}-player double round-robin"
    return f"{expected_n}-player single round-robin"


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
    double_rr: bool = False,
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

    full_table = list(table)
    if double_rr:
        full_table.extend([[(b_i, w_i) for (w_i, b_i) in r_pairs] for r_pairs in table])

    if double_rr:
        played_directed: Set[Tuple[str, str]] = set()
        for rd in rounds_data:
            for g in rd.get("pairings") or []:
                w = normalize_player_name(g.get("white", ""))
                b = normalize_player_name(g.get("black", ""))
                if w and b:
                    played_directed.add((w, b))
        remaining: List[Tuple[str, int, str, str]] = []
        for r_idx, r_pairs in enumerate(full_table):
            r_name = f"Round {r_idx + 1}"
            for w_i, b_i in r_pairs:
                w_name = idx_to_player[w_i]
                b_name = idx_to_player[b_i]
                if (w_name, b_name) not in played_directed:
                    remaining.append((r_name, r_idx + 1, w_name, b_name))
        return remaining

    played_pairs: Set[frozenset] = set()
    for rd in rounds_data:
        for g in rd.get("pairings") or []:
            w = normalize_player_name(g.get("white", ""))
            b = normalize_player_name(g.get("black", ""))
            if w and b:
                played_pairs.add(frozenset((w, b)))

    remaining: List[Tuple[str, int, str, str]] = []
    for r_idx, r_pairs in enumerate(full_table):
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
    double_rr: bool = False,
) -> List[Dict[str, Any]]:
    """
    Build all remaining unplayed games in a single/double round-robin tournament using
    FIDE Berger pairing tables (or color-balanced round completion if Round 1 differs).
    """
    # Collect already known pairings & color counts
    white_counts: Dict[str, int] = {p: 0 for p in players}
    black_counts: Dict[str, int] = {p: 0 for p in players}
    seen_pairs: Set[frozenset] = set()
    seen_directed: Set[Tuple[str, str]] = set()

    for rd in rounds_data:
        for g in rd.get("pairings") or []:
            w = normalize_player_name(g.get("white", ""))
            b = normalize_player_name(g.get("black", ""))
            if w in white_counts and b in black_counts:
                white_counts[w] += 1
                black_counts[b] += 1
                seen_pairs.add(frozenset((w, b)))
                seen_directed.add((w, b))

    berger_rem = _infer_berger_mapping(players, rounds_data, double_rr=double_rr)
    if berger_rem is not None:
        return [
            {"round_name": rname, "round_num": rnum, "white": w, "black": b}
            for (rname, rnum, w, b) in berger_rem
        ]

    # Fallback: FIDE Berger round structure over players ordered by seed/rating, filtering already-played pairs
    n = len(players)
    table = fide_berger_table(n)
    full_table = list(table)
    if double_rr:
        full_table.extend([[(b_i, w_i) for (w_i, b_i) in r_pairs] for r_pairs in table])
    max_known_round = sum(1 for rd in rounds_data if rd.get("pairings"))
    next_round = max_known_round + 1

    # Gather unplayed pairs in canonical Berger order, assigning White cleanly
    unplayed_edges: List[Tuple[str, str]] = []
    for leg_idx, r_pairs in enumerate(full_table):
        for w_i, b_i in r_pairs:
            u, v = players[w_i], players[b_i]
            if double_rr:
                if (u, v) in seen_directed:
                    continue
                seen_directed.add((u, v))
                unplayed_edges.append((u, v))
            else:
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
    tiebreaks: Optional[List[str]] = None,
    schedule_source: str = "fide_berger",
    n_sims: int = 20000,
    seed: int = 42,
) -> Optional[Dict[str, Any]]:
    """
    Simulate remaining games in a Round-Robin tournament using either the official
    pre-drawn schedule (e.g. from chess-results.com) or FIDE Berger completion,
    and rank players by the tournament's official tiebreak order.
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

    # Detect double round-robin from format string, number of rounds, or rematch pairs
    seen_directed_all: Set[Tuple[str, str]] = set()
    has_rematch_pair = False
    for rd in rounds_data:
        for g in rd.get("pairings") or []:
            w_p = normalize_player_name(g.get("white", ""))
            b_p = normalize_player_name(g.get("black", ""))
            if w_p and b_p:
                if (b_p, w_p) in seen_directed_all:
                    has_rematch_pair = True
                seen_directed_all.add((w_p, b_p))

    expected_n = _extract_expected_player_count(str(tour.get("format") or ""), n)
    single_rounds = expected_n - (0 if expected_n % 2 == 1 else 1)
    is_double = has_rematch_pair or is_double_round_robin(
        str(tour.get("format") or ""), n_players=expected_n, total_rounds=len(rounds_data)
    )

    # If we do not have an official complete schedule, complete missing rounds via FIDE Berger
    has_official_complete = (
        schedule_source == "official_chess_results" and len(rounds_data) >= 3
    )
    if not has_official_complete:
        future_pairings = complete_remaining_rr_pairings(
            player_order, rounds_data, double_rr=is_double
        )
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

    # Vectorized Monte Carlo simulation across all n_sims trials
    rng = np.random.default_rng(seed)
    sim_scores = np.broadcast_to(base_scores, (n_sims, n, n)).copy()
    sim_wins = np.broadcast_to(base_wins, (n_sims, n)).copy()

    if unplayed_games:
        m = len(unplayed_games)
        u_arr = rng.random((n_sims, m))
        pw_vec = np.array([ug["p_w"] for ug in unplayed_games], dtype=np.float64)[None, :]
        pwd_vec = pw_vec + np.array([ug["p_d"] for ug in unplayed_games], dtype=np.float64)[None, :]
        outcomes = (u_arr >= pw_vec).astype(np.int8) + (u_arr >= pwd_vec).astype(np.int8)
        ws_mat = 1.0 - 0.5 * outcomes
        w_win_mat = (outcomes == 0).astype(np.float64)
        b_win_mat = (outcomes == 2).astype(np.float64)

        for idx_g, ug in enumerate(unplayed_games):
            wi, bi = ug["wi"], ug["bi"]
            ws = ws_mat[:, idx_g]
            sim_scores[:, wi, bi] += ws
            sim_scores[:, bi, wi] += (1.0 - ws)
            sim_wins[:, wi] += w_win_mat[:, idx_g]
            sim_wins[:, bi] += b_win_mat[:, idx_g]

    total_pts = sim_scores.sum(axis=2)  # (n_sims, n)
    sb = np.einsum("sij,sj->si", sim_scores, total_pts)

    tb_rules = tiebreaks or ["de", "sb", "wins", "black_games"]
    pts_int = np.rint(total_pts * 2.0).astype(np.int64)

    de = np.zeros((n_sims, n), dtype=np.float64)
    if "de" in tb_rules:
        tied_mask = pts_int[:, :, None] == pts_int[:, None, :]
        de = (sim_scores * tied_mask).sum(axis=2)

    koya = np.zeros((n_sims, n), dtype=np.float64)
    if "koya" in tb_rules:
        total_games_per_player = (games_played + games_rem).astype(np.float64)
        koya_threshold = 0.5 * total_games_per_player
        opp_50 = (total_pts >= (koya_threshold[None, :] - 1e-9)).astype(np.float64)
        koya = np.einsum("sij,sj->si", sim_scores, opp_50)

    # Vectorized lexicographical ranking (np.lexsort primary key MUST be last)
    lex_keys: List[np.ndarray] = []
    for code in reversed(tb_rules):
        if code == "de":
            lex_keys.append(-np.rint(de * 1000.0).astype(np.int64))
        elif code == "sb":
            lex_keys.append(-np.rint(sb * 10000.0).astype(np.int64))
        elif code == "wins":
            lex_keys.append(-np.rint(sim_wins * 2.0).astype(np.int64))
        elif code == "koya":
            lex_keys.append(-np.rint(koya * 1000.0).astype(np.int64))
        elif code == "black_games":
            lex_keys.append(
                -np.broadcast_to(np.rint(black_games).astype(np.int64)[None, :], (n_sims, n))
            )
    lex_keys.append(-pts_int)

    order = np.lexsort(tuple(lex_keys), axis=1)  # (n_sims, n), order[s, r_pos] = player_i
    rank_pos = np.empty_like(order)
    rank_pos[np.arange(n_sims)[:, None], order] = np.arange(n)[None, :]
    exp_ranks = rank_pos.mean(axis=0) + 1.0

    rank_counts = np.zeros((n, n), dtype=float)
    for r_pos in range(n):
        rank_counts[:, r_pos] = np.bincount(order[:, r_pos], minlength=n)

    rank_probs = rank_counts / float(n_sims)
    exp_pts = total_pts.mean(axis=0)
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
        single_rounds * (2 if is_double else 1),
    )
    fmt_normalized = normalize_round_robin_format(
        f"{expected_n}-player {'double ' if is_double else ''}round-robin"
        if is_double
        else str(tour.get("format") or ""),
        expected_n,
        total_rounds_expected,
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
        for ug in unplayed_games[:60]
    ]

    return {
        "tour_id": tour.get("tour_id"),
        "tour_name": tour.get("tour_name"),
        "tier": int(tour.get("tier") or 0),
        "format": fmt_normalized,
        "time_control": time_control,
        "schedule_source": schedule_source,
        "n_players": n,
        "rounds_played": played_rounds,
        "total_rounds": total_rounds_expected,
        "n_simulations": n_sims,
        "tiebreaks": ["积分"] + [TIEBREAK_LABELS.get(c, c) for c in tb_rules],
        "standings": standings,
        "upcoming_pairings": upcoming_preview,
    }
