"""Chronological, leakage-free pre-match feature engineering for chess games."""

from __future__ import annotations

import datetime as dt
import math
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .data_loader import normalize_player_name
from .ratings import Glicko2Tracker, normalize_time_control

FEATURE_COLUMNS: List[str] = [
    "white_eff_elo",
    "black_eff_elo",
    "elo_diff",
    "abs_elo_diff",
    "avg_elo",
    "has_external_elo",
    "w_glicko",
    "b_glicko",
    "glicko_diff",
    "w_rd",
    "b_rd",
    "rd_sum",
    "w_elo_minus_glicko",
    "b_elo_minus_glicko",
    "momentum_diff",
    "w_form_10",
    "b_form_10",
    "form_diff_10",
    "w_perf_diff_10",
    "b_perf_diff_10",
    "w_draw_rate",
    "b_draw_rate",
    "avg_draw_propensity",
    "w_white_score",
    "b_black_score",
    "color_edge_diff",
    "w_streak",
    "b_streak",
    "streak_diff",
    "w_games_log",
    "b_games_log",
    "w_recent_14d",
    "b_recent_14d",
    "activity_diff_14d",
    "w_rest_days",
    "b_rest_days",
    "h2h_games",
    "h2h_white_score_smoothed",
    "h2h_draw_rate_smoothed",
    "tc_classical",
    "tc_rapid",
    "tc_blitz",
    "tc_bullet",
]


def _smoothed_mean(values: Deque[float], prior: float, prior_weight: float, limit: Optional[int] = None) -> float:
    items = list(values)[-limit:] if (limit is not None and len(values) > limit) else list(values)
    n = len(items)
    return float((sum(items) + prior * prior_weight) / (n + prior_weight))


@dataclass
class PlayerStats:
    """Rolling chronological stats for a single player."""

    recent_scores: Deque[float] = field(default_factory=lambda: deque(maxlen=25))
    recent_draws: Deque[float] = field(default_factory=lambda: deque(maxlen=25))
    recent_opp_elos: Deque[float] = field(default_factory=lambda: deque(maxlen=25))
    white_scores: Deque[float] = field(default_factory=lambda: deque(maxlen=20))
    black_scores: Deque[float] = field(default_factory=lambda: deque(maxlen=20))
    recent_days: Deque[int] = field(default_factory=lambda: deque(maxlen=60))
    last_known_elo: Optional[float] = None
    last_day: Optional[int] = None
    total_games: int = 0
    streak: int = 0

    def update(
        self,
        score: float,
        is_white: bool,
        opp_elo: float,
        own_ext_elo: Optional[float],
        day_ordinal: int,
    ) -> None:
        self.recent_scores.append(score)
        self.recent_draws.append(1.0 if abs(score - 0.5) < 1e-6 else 0.0)
        self.recent_opp_elos.append(opp_elo)
        if is_white:
            self.white_scores.append(score)
        else:
            self.black_scores.append(score)
        self.recent_days.append(day_ordinal)
        if own_ext_elo is not None and not math.isnan(own_ext_elo):
            self.last_known_elo = float(own_ext_elo)
        self.last_day = day_ordinal
        self.total_games += 1
        if score > 0.75:
            self.streak = self.streak + 1 if self.streak > 0 else 1
        elif score < 0.25:
            self.streak = self.streak - 1 if self.streak < 0 else -1
        else:
            self.streak = 0


@dataclass
class H2HRecord:
    """Head-to-head record keyed by lexicographically sorted (p1, p2)."""

    games: int = 0
    p1_score: float = 0.0
    draws: int = 0


class PlayerHistoryStore:
    """Chronological state container for ratings, rolling form, and H2H records."""

    def __init__(self, default_elo: float = 1800.0) -> None:
        self.default_elo = default_elo
        self.glicko = Glicko2Tracker(default_rating=default_elo)
        self.players: Dict[str, PlayerStats] = {}
        self.h2h: Dict[Tuple[str, str], H2HRecord] = {}
        self.latest_day: int = dt.date.today().toordinal()

    def known_players(self) -> List[str]:
        return sorted(self.players.keys())

    def resolve_player_name(self, query: str) -> str:
        """Resolve user-provided player name (e.g. 'Carlsen, Magnus', 'Carlsen') to canonical store name."""
        cleaned = normalize_player_name(query)
        if not cleaned:
            return str(query).strip()
        if cleaned in self.players:
            return cleaned

        lower_map = {k.lower(): k for k in self.players}
        if cleaned.lower() in lower_map:
            return lower_map[cleaned.lower()]

        # Try swapped token order (e.g. "Ding Liren" <-> "Liren Ding")
        tokens = cleaned.split()
        if len(tokens) == 2:
            swapped = f"{tokens[1]} {tokens[0]}".lower()
            if swapped in lower_map:
                return lower_map[swapped]

        # Unique substring / surname match (prefer exact word match with most games)
        q_low = cleaned.lower()
        word_matches = [
            k for k in self.players
            if q_low in k.lower().split()
        ]
        if len(word_matches) == 1:
            return word_matches[0]
        if len(word_matches) > 1:
            return max(word_matches, key=lambda k: self.players[k].total_games)

        sub_matches = [k for k in self.players if q_low in k.lower()]
        if len(sub_matches) == 1:
            return sub_matches[0]
        return cleaned

    def list_top_players(self, limit: int = 30, min_games: int = 5) -> List[Dict[str, object]]:
        """List top players sorted by latest known Elo / Glicko-2 rating."""
        rows = []
        for name, st in self.players.items():
            if st.total_games < min_games:
                continue
            s = self.get_player_summary(name)
            if s is not None:
                rows.append(s)
        rows.sort(
            key=lambda r: float(r["last_known_elo"] or r["glicko_rating"]),
            reverse=True,
        )
        return rows[:limit]

    def get_player_summary(self, name: str) -> Optional[Dict[str, object]]:
        resolved = self.resolve_player_name(name)
        if resolved not in self.players:
            return None
        st = self.players[resolved]
        gl = self.glicko.get(resolved, self.latest_day)
        return {
            "name": resolved,
            "games": st.total_games,
            "last_known_elo": st.last_known_elo,
            "glicko_rating": round(gl.rating, 1),
            "glicko_rd": round(gl.rd, 1),
            "form_10": round(_smoothed_mean(st.recent_scores, 0.5, 4.0, limit=10), 3),
            "draw_rate": round(_smoothed_mean(st.recent_draws, 0.3, 5.0), 3),
            "white_score": round(_smoothed_mean(st.white_scores, 0.54, 4.0), 3),
            "black_score": round(_smoothed_mean(st.black_scores, 0.46, 4.0), 3),
            "streak": st.streak,
        }

    def _get_stats(self, name: str) -> PlayerStats:
        if name not in self.players:
            self.players[name] = PlayerStats()
        return self.players[name]

    def _h2h_stats(self, white: str, black: str) -> Tuple[int, float, float]:
        key = (white, black) if white <= black else (black, white)
        rec = self.h2h.get(key)
        if rec is None or rec.games == 0:
            return 0, 0.5, 0.30
        w_score = rec.p1_score if white <= black else (rec.games - rec.p1_score)
        w_smoothed = (w_score + 0.5 * 4.0) / (rec.games + 4.0)
        d_smoothed = (rec.draws + 0.30 * 4.0) / (rec.games + 4.0)
        return rec.games, float(w_smoothed), float(d_smoothed)

    def extract_matchup_dict(
        self,
        white: str,
        black: str,
        white_elo: Optional[float] = None,
        black_elo: Optional[float] = None,
        time_control: str = "classical",
        day_ordinal: Optional[int] = None,
    ) -> Dict[str, float]:
        """Extract strictly pre-match features without mutating store state."""
        day = day_ordinal if day_ordinal is not None else self.latest_day
        w_st = self.players.get(white, PlayerStats())
        b_st = self.players.get(black, PlayerStats())
        w_gl = self.glicko.get(white, day)
        b_gl = self.glicko.get(black, day)

        w_ext_valid = white_elo is not None and not math.isnan(white_elo)
        b_ext_valid = black_elo is not None and not math.isnan(black_elo)
        has_ext = 1.0 if (w_ext_valid and b_ext_valid) else 0.0

        w_fallback = w_st.last_known_elo if w_st.last_known_elo is not None else (
            w_gl.rating if w_gl.games > 0 else self.default_elo
        )
        b_fallback = b_st.last_known_elo if b_st.last_known_elo is not None else (
            b_gl.rating if b_gl.games > 0 else self.default_elo
        )

        w_eff = float(white_elo) if w_ext_valid else float(w_fallback)
        b_eff = float(black_elo) if b_ext_valid else float(b_fallback)

        w_glicko_val = w_gl.rating if w_gl.games > 0 else w_eff
        b_glicko_val = b_gl.rating if b_gl.games > 0 else b_eff

        elo_diff = w_eff - b_eff
        glicko_diff = w_glicko_val - b_glicko_val

        w_form_10 = _smoothed_mean(w_st.recent_scores, 0.5, 4.0, limit=10)
        b_form_10 = _smoothed_mean(b_st.recent_scores, 0.5, 4.0, limit=10)

        w_opp_avg = _smoothed_mean(w_st.recent_opp_elos, w_eff, 4.0, limit=10)
        b_opp_avg = _smoothed_mean(b_st.recent_opp_elos, b_eff, 4.0, limit=10)
        w_perf_10 = w_opp_avg + 400.0 * (w_form_10 - 0.5)
        b_perf_10 = b_opp_avg + 400.0 * (b_form_10 - 0.5)

        w_draw = _smoothed_mean(w_st.recent_draws, 0.30, 6.0)
        b_draw = _smoothed_mean(b_st.recent_draws, 0.30, 6.0)

        w_white_sc = _smoothed_mean(w_st.white_scores, 0.54, 5.0)
        b_black_sc = _smoothed_mean(b_st.black_scores, 0.46, 5.0)

        w_recent_14d = float(sum(1 for d in w_st.recent_days if 0 <= (day - d) <= 14))
        b_recent_14d = float(sum(1 for d in b_st.recent_days if 0 <= (day - d) <= 14))
        w_rest = float(min(90, max(0, day - w_st.last_day))) if w_st.last_day is not None else 30.0
        b_rest = float(min(90, max(0, day - b_st.last_day))) if b_st.last_day is not None else 30.0

        h2h_n, h2h_w_sc, h2h_d = self._h2h_stats(white, black)
        tc = normalize_time_control(time_control)

        w_elo_minus_gl = w_eff - w_glicko_val
        b_elo_minus_gl = b_eff - b_glicko_val

        return {
            "white_eff_elo": w_eff,
            "black_eff_elo": b_eff,
            "elo_diff": elo_diff,
            "abs_elo_diff": abs(elo_diff),
            "avg_elo": 0.5 * (w_eff + b_eff),
            "has_external_elo": has_ext,
            "w_glicko": w_glicko_val,
            "b_glicko": b_glicko_val,
            "glicko_diff": glicko_diff,
            "w_rd": w_gl.rd,
            "b_rd": b_gl.rd,
            "rd_sum": w_gl.rd + b_gl.rd,
            "w_elo_minus_glicko": w_elo_minus_gl,
            "b_elo_minus_glicko": b_elo_minus_gl,
            "momentum_diff": w_elo_minus_gl - b_elo_minus_gl,
            "w_form_10": w_form_10,
            "b_form_10": b_form_10,
            "form_diff_10": w_form_10 - b_form_10,
            "w_perf_diff_10": w_perf_10 - w_eff,
            "b_perf_diff_10": b_perf_10 - b_eff,
            "w_draw_rate": w_draw,
            "b_draw_rate": b_draw,
            "avg_draw_propensity": 0.5 * (w_draw + b_draw),
            "w_white_score": w_white_sc,
            "b_black_score": b_black_sc,
            "color_edge_diff": w_white_sc - (1.0 - b_black_sc),
            "w_streak": float(w_st.streak),
            "b_streak": float(b_st.streak),
            "streak_diff": float(w_st.streak - b_st.streak),
            "w_games_log": math.log1p(w_st.total_games),
            "b_games_log": math.log1p(b_st.total_games),
            "w_recent_14d": w_recent_14d,
            "b_recent_14d": b_recent_14d,
            "activity_diff_14d": w_recent_14d - b_recent_14d,
            "w_rest_days": w_rest,
            "b_rest_days": b_rest,
            "h2h_games": float(h2h_n),
            "h2h_white_score_smoothed": h2h_w_sc,
            "h2h_draw_rate_smoothed": h2h_d,
            "tc_classical": 1.0 if tc == "classical" else 0.0,
            "tc_rapid": 1.0 if tc == "rapid" else 0.0,
            "tc_blitz": 1.0 if tc == "blitz" else 0.0,
            "tc_bullet": 1.0 if tc == "bullet" else 0.0,
        }

    def update_after_game(
        self,
        white: str,
        black: str,
        white_score: float,
        white_elo: Optional[float],
        black_elo: Optional[float],
        day_ordinal: int,
    ) -> None:
        """Advance Glicko-2, player rolling stats, and H2H after observing a result."""
        w_st = self._get_stats(white)
        b_st = self._get_stats(black)

        w_elo_clean = float(white_elo) if white_elo is not None and not math.isnan(white_elo) else None
        b_elo_clean = float(black_elo) if black_elo is not None and not math.isnan(black_elo) else None

        w_curr = w_elo_clean if w_elo_clean is not None else self.glicko.get(white, day_ordinal).rating
        b_curr = b_elo_clean if b_elo_clean is not None else self.glicko.get(black, day_ordinal).rating

        self.glicko.update_game(
            white=white,
            black=black,
            white_score=white_score,
            current_day=day_ordinal,
            seed_white_elo=w_elo_clean,
            seed_black_elo=b_elo_clean,
        )

        w_st.update(white_score, True, b_curr, w_elo_clean, day_ordinal)
        b_st.update(1.0 - white_score, False, w_curr, b_elo_clean, day_ordinal)

        key = (white, black) if white <= black else (black, white)
        rec = self.h2h.setdefault(key, H2HRecord())
        rec.games += 1
        rec.p1_score += white_score if white <= black else (1.0 - white_score)
        if abs(white_score - 0.5) < 1e-6:
            rec.draws += 1

        if day_ordinal > self.latest_day:
            self.latest_day = day_ordinal


def build_chronological_features(
    df: pd.DataFrame,
    default_elo: float = 1800.0,
) -> Tuple[pd.DataFrame, np.ndarray, PlayerHistoryStore]:
    """
    Build strictly chronological pre-match features from a sorted games DataFrame.

    Returns (X_features, y_labels, populated_store).
    """
    valid_elos = pd.concat([df["white_elo"], df["black_elo"]]).dropna()
    inferred_default = float(valid_elos.median()) if len(valid_elos) > 0 else default_elo

    store = PlayerHistoryStore(default_elo=inferred_default)
    rows: List[Dict[str, float]] = []

    for row in df.itertuples(index=False):
        feat = store.extract_matchup_dict(
            white=row.white,
            black=row.black,
            white_elo=row.white_elo,
            black_elo=row.black_elo,
            time_control=row.time_control,
            day_ordinal=int(row.date_ordinal),
        )
        rows.append(feat)
        store.update_after_game(
            white=row.white,
            black=row.black,
            white_score=float(row.white_score),
            white_elo=row.white_elo,
            black_elo=row.black_elo,
            day_ordinal=int(row.date_ordinal),
        )

    X = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
    y = df["label"].to_numpy(dtype=int)
    return X, y, store
