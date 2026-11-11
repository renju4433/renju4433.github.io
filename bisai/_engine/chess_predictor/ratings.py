"""Rating systems (Glicko-2) and analytical ternary outcome models (Davidson)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, Iterable, Optional, Tuple

import numpy as np
from scipy.optimize import minimize

GLICKO2_SCALE = 173.7178

TIME_CONTROL_ORDER = ("classical", "rapid", "blitz", "bullet", "unknown")


def normalize_time_control(raw: Optional[str]) -> str:
    """Normalize a PGN TimeControl string or category name to a standard bucket."""
    if raw is None:
        return "classical"
    text = str(raw).strip().lower()
    if not text or text in {"?", "-", "unknown", "nan", "none"}:
        return "classical"
    if text in {"classical", "standard", "correspondence"}:
        return "classical"
    if text in {"rapid", "blitz", "bullet"}:
        return text
    if "ultrabullet" in text or "hyperbullet" in text or "bullet" in text or "1-0" in text or "1+0" in text:
        return "bullet"
    if "blitz" in text or "titled tue" in text or "3-0" in text or "3+0" in text or "3+1" in text or "3+2" in text or "5+0" in text or "armageddon" in text:
        return "blitz"
    if "rapid" in text or "15+10" in text or "10+0" in text or "25+10" in text:
        return "rapid"
    if "classical" in text or "standard" in text or "masters" in text or "candidates" in text:
        return "classical"

    # Parse PGN format like "180+2", "5400+30", "40/5400+30:1800+30"
    segment = text.split(":")[0]
    if "/" in segment:
        segment = segment.split("/")[-1]
    parts = segment.split("+")
    try:
        base_sec = float(parts[0])
        inc_sec = float(parts[1]) if len(parts) > 1 else 0.0
    except ValueError:
        return "classical"

    # FIDE/Lichess standard estimated game duration = base + 40 * increment
    est_total = base_sec + 40.0 * inc_sec
    if est_total < 180:
        return "bullet"
    if est_total < 600:
        return "blitz"
    if est_total < 1800:
        return "rapid"
    return "classical"


@dataclass
class Glicko2Rating:
    """Glicko-2 rating state in internal scale alongside human-readable Elo scale."""

    rating: float = 1500.0
    rd: float = 350.0
    volatility: float = 0.06
    games: int = 0
    last_day: Optional[int] = None

    @property
    def mu(self) -> float:
        return (self.rating - 1500.0) / GLICKO2_SCALE

    @property
    def phi(self) -> float:
        return self.rd / GLICKO2_SCALE


class Glicko2Tracker:
    """Chronological per-game Glicko-2 rating tracker."""

    def __init__(
        self,
        default_rating: float = 1500.0,
        default_rd: float = 250.0,
        default_vol: float = 0.06,
        tau: float = 0.5,
        inactivity_period_days: float = 30.0,
    ) -> None:
        self.default_rating = default_rating
        self.default_rd = default_rd
        self.default_vol = default_vol
        self.tau = tau
        self.inactivity_period_days = inactivity_period_days
        self.players: Dict[str, Glicko2Rating] = {}

    def get(self, player: str, current_day: Optional[int] = None) -> Glicko2Rating:
        """Return a player's current rating, applying RD inflation for inactivity if known."""
        if player not in self.players:
            return Glicko2Rating(
                rating=self.default_rating,
                rd=self.default_rd,
                volatility=self.default_vol,
                games=0,
                last_day=current_day,
            )
        state = self.players[player]
        rd = state.rd
        if (
            current_day is not None
            and state.last_day is not None
            and current_day > state.last_day
            and self.inactivity_period_days > 0
        ):
            elapsed_periods = (current_day - state.last_day) / self.inactivity_period_days
            phi = state.phi
            phi_inflated = math.sqrt(phi * phi + elapsed_periods * (state.volatility ** 2))
            rd = min(350.0, phi_inflated * GLICKO2_SCALE)
        return Glicko2Rating(
            rating=state.rating,
            rd=rd,
            volatility=state.volatility,
            games=state.games,
            last_day=state.last_day,
        )

    @staticmethod
    def _g(phi: float) -> float:
        return 1.0 / math.sqrt(1.0 + 3.0 * (phi ** 2) / (math.pi ** 2))

    @staticmethod
    def _e(mu: float, mu_opp: float, g_opp: float) -> float:
        return 1.0 / (1.0 + math.exp(-g_opp * (mu - mu_opp)))

    def _update_volatility(self, delta: float, phi: float, v: float, sigma: float) -> float:
        a = math.log(sigma * sigma)
        tau2 = self.tau * self.tau
        delta2 = delta * delta
        phi2 = phi * phi

        def f(x: float) -> float:
            ex = math.exp(x)
            num1 = ex * (delta2 - phi2 - v - ex)
            den1 = 2.0 * ((phi2 + v + ex) ** 2)
            return (num1 / den1) - ((x - a) / tau2)

        A = a
        if delta2 > phi2 + v:
            B = math.log(delta2 - phi2 - v)
        else:
            k = 1
            while f(a - k * self.tau) < 0 and k < 50:
                k += 1
            B = a - k * self.tau

        fA = f(A)
        fB = f(B)
        for _ in range(40):
            if abs(B - A) <= 1e-6:
                break
            C = A + (A - B) * fA / (fB - fA) if abs(fB - fA) > 1e-12 else 0.5 * (A + B)
            fC = f(C)
            if fC * fB <= 0:
                A, fA = B, fB
            else:
                fA *= 0.5
            B, fB = C, fC
        return math.exp(A / 2.0)

    def _single_step(
        self,
        state: Glicko2Rating,
        opp_state: Glicko2Rating,
        score: float,
        current_day: Optional[int],
    ) -> Glicko2Rating:
        mu = state.mu
        phi = state.phi
        sigma = state.volatility

        g_opp = self._g(opp_state.phi)
        e_val = self._e(mu, opp_state.mu, g_opp)
        v = 1.0 / max(1e-9, (g_opp ** 2) * e_val * (1.0 - e_val))
        delta = v * g_opp * (score - e_val)

        sigma_new = self._update_volatility(delta, phi, v, sigma)
        phi_star = math.sqrt(phi * phi + sigma_new * sigma_new)
        phi_new = 1.0 / math.sqrt((1.0 / (phi_star * phi_star)) + (1.0 / v))
        mu_new = mu + (phi_new * phi_new) * g_opp * (score - e_val)

        rating_new = 1500.0 + GLICKO2_SCALE * mu_new
        rd_new = max(30.0, min(350.0, GLICKO2_SCALE * phi_new))
        return Glicko2Rating(
            rating=rating_new,
            rd=rd_new,
            volatility=sigma_new,
            games=state.games + 1,
            last_day=current_day if current_day is not None else state.last_day,
        )

    def update_game(
        self,
        white: str,
        black: str,
        white_score: float,
        current_day: Optional[int] = None,
        seed_white_elo: Optional[float] = None,
        seed_black_elo: Optional[float] = None,
    ) -> None:
        """Update both players' Glicko-2 ratings after a single game."""
        w_state = self.get(white, current_day)
        b_state = self.get(black, current_day)

        if w_state.games == 0 and seed_white_elo is not None and not math.isnan(seed_white_elo):
            w_state = Glicko2Rating(
                rating=float(seed_white_elo),
                rd=150.0,
                volatility=self.default_vol,
                games=0,
                last_day=current_day,
            )
        if b_state.games == 0 and seed_black_elo is not None and not math.isnan(seed_black_elo):
            b_state = Glicko2Rating(
                rating=float(seed_black_elo),
                rd=150.0,
                volatility=self.default_vol,
                games=0,
                last_day=current_day,
            )

        w_new = self._single_step(w_state, b_state, white_score, current_day)
        b_new = self._single_step(b_state, w_state, 1.0 - white_score, current_day)
        self.players[white] = w_new
        self.players[black] = b_new


@dataclass
class DavidsonParams:
    """Calibrated parameters for the Elo-conditioned Davidson ternary model."""

    white_adv_elo: float = 32.0
    elo_scale: float = 400.0
    draw_intercept: float = -0.35
    draw_elo_slope: float = 0.78
    tc_draw_offsets: Dict[str, float] = field(
        default_factory=lambda: {
            "classical": 0.45,
            "rapid": 0.0,
            "blitz": -0.35,
            "bullet": -0.80,
            "unknown": 0.0,
        }
    )


class DavidsonModel:
    """
    Analytical pre-match chess probability model (White Win, Draw, Black Win).

    Extends the Bradley-Terry/Davidson tie model with:
    - First-move White advantage in Elo points
    - Average-rating and time-control dependent draw propensity
    - Local MLE calibration when training data is supplied
    """

    def __init__(self, params: Optional[DavidsonParams] = None) -> None:
        self.params = params or DavidsonParams()

    def predict_proba_single(
        self,
        white_elo: float,
        black_elo: float,
        time_control: str = "classical",
    ) -> Tuple[float, float, float]:
        """Return (p_white_win, p_draw, p_black_win) for a single matchup."""
        probs = self.predict_proba(
            np.array([white_elo], dtype=float),
            np.array([black_elo], dtype=float),
            [time_control],
        )[0]
        return float(probs[0]), float(probs[1]), float(probs[2])

    def predict_proba(
        self,
        white_elo: np.ndarray,
        black_elo: np.ndarray,
        time_controls: Optional[Iterable[str]] = None,
    ) -> np.ndarray:
        """Return array of shape (n, 3) with columns [P(White), P(Draw), P(Black)]."""
        w = np.asarray(white_elo, dtype=float)
        b = np.asarray(black_elo, dtype=float)
        if time_controls is None:
            tc_offset = np.full_like(w, self.params.tc_draw_offsets.get("classical", 0.0))
        else:
            offsets = self.params.tc_draw_offsets
            tc_offset = np.array(
                [offsets.get(normalize_time_control(tc), 0.0) for tc in time_controls],
                dtype=float,
            )

        avg_elo = 0.5 * (w + b)
        log_nu = (
            self.params.draw_intercept
            + self.params.draw_elo_slope * ((avg_elo - 2000.0) / 400.0)
            + tc_offset
        )
        nu = np.exp(np.clip(log_nu, -4.0, 4.0))

        # Scale diff by (1 + nu/2) so expected score slope near equal ratings matches Elo
        diff_elo = (w + self.params.white_adv_elo) - b
        d = (diff_elo / max(50.0, self.params.elo_scale)) * math.log(10.0) * (1.0 + 0.5 * nu)
        half_d = np.clip(0.5 * d, -20.0, 20.0)

        u_w = np.exp(half_d)
        u_b = np.exp(-half_d)
        denom = u_w + u_b + nu

        p_w = u_w / denom
        p_d = nu / denom
        p_b = u_b / denom
        return np.column_stack([p_w, p_d, p_b])

    def fit(
        self,
        white_elo: np.ndarray,
        black_elo: np.ndarray,
        time_controls: Iterable[str],
        y: np.ndarray,
    ) -> "DavidsonModel":
        """
        Calibrate parameters via regularized Maximum Likelihood on game outcomes.

        y values: 0 = White win, 1 = Draw, 2 = Black win.
        """
        w = np.asarray(white_elo, dtype=float)
        b = np.asarray(black_elo, dtype=float)
        y_arr = np.asarray(y, dtype=int)
        tc_list = [normalize_time_control(tc) for tc in time_controls]
        tc_idx = {tc: i for i, tc in enumerate(["classical", "rapid", "blitz", "bullet"])}
        tc_codes = np.array([tc_idx.get(tc, 1) for tc in tc_list], dtype=int)
        avg_scaled = (0.5 * (w + b) - 2000.0) / 400.0
        raw_diff = w - b

        # theta = [white_adv, log_scale, intercept, slope, tc_classical, tc_blitz, tc_bullet]
        x0 = np.array(
            [
                self.params.white_adv_elo,
                math.log(self.params.elo_scale),
                self.params.draw_intercept,
                self.params.draw_elo_slope,
                self.params.tc_draw_offsets.get("classical", 0.45),
                self.params.tc_draw_offsets.get("blitz", -0.35),
                self.params.tc_draw_offsets.get("bullet", -0.80),
            ],
            dtype=float,
        )

        def nll(theta: np.ndarray) -> float:
            white_adv, log_scale, intercept, slope, tc_cl, tc_bl, tc_bu = theta
            elo_scale = math.exp(np.clip(log_scale, math.log(150.0), math.log(1200.0)))
            tc_vec = np.array([tc_cl, 0.0, tc_bl, tc_bu], dtype=float)
            log_nu = intercept + slope * avg_scaled + tc_vec[tc_codes]
            nu = np.exp(np.clip(log_nu, -4.0, 4.0))
            d = ((raw_diff + white_adv) / elo_scale) * math.log(10.0) * (1.0 + 0.5 * nu)
            half_d = np.clip(0.5 * d, -20.0, 20.0)

            u_w = np.exp(half_d)
            u_b = np.exp(-half_d)
            denom = u_w + u_b + nu
            probs = np.column_stack([u_w / denom, nu / denom, u_b / denom])
            p_true = np.clip(probs[np.arange(len(y_arr)), y_arr], 1e-12, 1.0)
            reg = 1e-3 * ((slope - 0.78) ** 2 + (log_scale - math.log(400.0)) ** 2)
            return float(-np.mean(np.log(p_true)) + reg)

        bounds = [
            (-50.0, 120.0),
            (math.log(180.0), math.log(900.0)),
            (-3.0, 3.0),
            (-1.0, 3.0),
            (-2.0, 2.5),
            (-2.5, 2.0),
            (-3.0, 2.0),
        ]
        res = minimize(nll, x0, method="L-BFGS-B", bounds=bounds)
        white_adv, log_scale, intercept, slope, tc_cl, tc_bl, tc_bu = res.x
        self.params = DavidsonParams(
            white_adv_elo=float(white_adv),
            elo_scale=float(math.exp(log_scale)),
            draw_intercept=float(intercept),
            draw_elo_slope=float(slope),
            tc_draw_offsets={
                "classical": float(tc_cl),
                "rapid": 0.0,
                "blitz": float(tc_bl),
                "bullet": float(tc_bu),
                "unknown": 0.0,
            },
        )
        return self
