"""High-level local pre-match chess prediction API and persistence."""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import joblib
import numpy as np
import pandas as pd

from .data_loader import load_games, parse_elo, parse_pgn_date
from .features import FEATURE_COLUMNS, PlayerHistoryStore, build_chronological_features
from .model import PreMatchModel
from .ratings import DavidsonModel, normalize_time_control


@dataclass
class PredictionResult:
    """Structured pre-match prediction output for a chess pairing."""

    white: str
    black: str
    white_elo_used: float
    black_elo_used: float
    time_control: str
    p_white_win: float
    p_draw: float
    p_black_win: float
    expected_score_white: float
    expected_score_black: float
    fair_odds_white: float
    fair_odds_draw: float
    fair_odds_black: float
    most_likely_outcome: str
    mode: str
    factors: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ChessPreMatchPredictor:
    """
    End-to-end local pre-match chess predictor.

    Works both in zero-data analytical mode (Davidson Elo+Draw model) and
    in trained ML mode (Glicko-2 + chronological form/H2H + Davidson + LogReg/LightGBM).
    """

    def __init__(
        self,
        model: Optional[PreMatchModel] = None,
        store: Optional[PlayerHistoryStore] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.model = model or PreMatchModel(model_type="davidson", davidson=DavidsonModel())
        self.store = store or PlayerHistoryStore(default_elo=1800.0)
        self.is_trained = model is not None and model.model_type != "davidson"
        self.metadata: Dict[str, Any] = metadata or {}

    def train_from_file(
        self,
        dataset_path: Union[str, Path],
        model_type: str = "ensemble",
        max_games: Optional[int] = None,
        val_ratio: float = 0.2,
    ) -> Dict[str, Dict[str, float]]:
        """Load a local .pgn or .csv dataset and train the pre-match model."""
        df = load_games(dataset_path, max_games=max_games)
        metrics = self.train_from_dataframe(df, model_type=model_type, val_ratio=val_ratio)
        self.metadata["source_file"] = str(Path(dataset_path).resolve())
        return metrics

    def train_from_dataframe(
        self,
        df: pd.DataFrame,
        model_type: str = "ensemble",
        val_ratio: float = 0.2,
    ) -> Dict[str, Dict[str, float]]:
        """Build chronological features and fit PreMatchModel on a standardized DataFrame."""
        X, y, store = build_chronological_features(df)
        model = PreMatchModel(model_type=model_type).fit(
            X,
            y,
            time_controls=df["time_control"].tolist(),
            val_ratio=val_ratio,
        )
        self.model = model
        self.store = store
        self.is_trained = True
        self.metadata.update(
            {
                "n_games": int(len(df)),
                "n_players": int(len(store.players)),
                "model_type": model_type,
                "blend_weights": model.blend_weights,
                "date_min": str(df["date_obj"].min()),
                "date_max": str(df["date_obj"].max()),
                "label_distribution": {
                    "white_win": round(float((y == 0).mean()), 4),
                    "draw": round(float((y == 1).mean()), 4),
                    "black_win": round(float((y == 2).mean()), 4),
                },
            }
        )
        return model.train_metrics

    def save(self, artifact_path: Union[str, Path]) -> Path:
        """Persist trained model, player history store, and metadata locally."""
        out = Path(artifact_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "model": self.model,
            "store": self.store,
            "is_trained": self.is_trained,
            "metadata": self.metadata,
        }
        joblib.dump(payload, out)
        return out

    @classmethod
    def load(cls, artifact_path: Union[str, Path]) -> "ChessPreMatchPredictor":
        """Load a previously saved local predictor artifact."""
        path = Path(artifact_path)
        if not path.exists():
            raise FileNotFoundError(f"Model artifact not found: {path}")
        payload = joblib.load(path)
        inst = cls(
            model=payload["model"],
            store=payload["store"],
            metadata=payload.get("metadata", {}),
        )
        inst.is_trained = bool(payload.get("is_trained", True))
        return inst

    def predict(
        self,
        white: str = "White Player",
        black: str = "Black Player",
        white_elo: Optional[float] = None,
        black_elo: Optional[float] = None,
        time_control: str = "classical",
        game_date: Optional[str] = None,
    ) -> PredictionResult:
        """Predict White Win / Draw / Black Win probabilities before a match."""
        tc = normalize_time_control(time_control)
        parsed_date = parse_pgn_date(game_date)
        day_ord = parsed_date.toordinal() if parsed_date is not None else self.store.latest_day

        w_clean = self.store.resolve_player_name(white) if white.strip() else "White Player"
        b_clean = self.store.resolve_player_name(black) if black.strip() else "Black Player"

        feat_dict = self.store.extract_matchup_dict(
            white=w_clean,
            black=b_clean,
            white_elo=white_elo,
            black_elo=black_elo,
            time_control=tc,
            day_ordinal=day_ord,
        )
        X_row = pd.DataFrame([feat_dict], columns=FEATURE_COLUMNS)

        w_known = w_clean in self.store.players
        b_known = b_clean in self.store.players

        if self.is_trained:
            probs = self.model.predict_proba(X_row, [tc])[0]
            mode = "trained_ml_and_history" if (w_known or b_known) else "trained_ml_coldstart"
        else:
            probs = self.model.davidson.predict_proba(
                np.array([feat_dict["white_eff_elo"]]),
                np.array([feat_dict["black_eff_elo"]]),
                [tc],
            )[0]
            mode = "davidson_analytical_coldstart"

        p_w, p_d, p_b = float(probs[0]), float(probs[1]), float(probs[2])
        exp_w = p_w + 0.5 * p_d
        exp_b = p_b + 0.5 * p_d

        outcomes = [("White Win (1-0)", p_w), ("Draw (1/2-1/2)", p_d), ("Black Win (0-1)", p_b)]
        most_likely = max(outcomes, key=lambda x: x[1])[0]

        dav_p = self.model.davidson.predict_proba_single(
            feat_dict["white_eff_elo"],
            feat_dict["black_eff_elo"],
            tc,
        )

        factors = {
            "elo_diff": round(feat_dict["elo_diff"], 1),
            "avg_elo": round(feat_dict["avg_elo"], 1),
            "white_known_in_db": w_known,
            "black_known_in_db": b_known,
            "white_glicko": round(feat_dict["w_glicko"], 1),
            "black_glicko": round(feat_dict["b_glicko"], 1),
            "white_form_10": round(feat_dict["w_form_10"], 3),
            "black_form_10": round(feat_dict["b_form_10"], 3),
            "h2h_games": int(feat_dict["h2h_games"]),
            "h2h_white_score_smoothed": round(feat_dict["h2h_white_score_smoothed"], 3),
            "davidson_prior": {
                "p_white": round(dav_p[0], 4),
                "p_draw": round(dav_p[1], 4),
                "p_black": round(dav_p[2], 4),
            },
        }

        return PredictionResult(
            white=w_clean,
            black=b_clean,
            white_elo_used=round(feat_dict["white_eff_elo"], 1),
            black_elo_used=round(feat_dict["black_eff_elo"], 1),
            time_control=tc,
            p_white_win=round(p_w, 4),
            p_draw=round(p_d, 4),
            p_black_win=round(p_b, 4),
            expected_score_white=round(exp_w, 4),
            expected_score_black=round(exp_b, 4),
            fair_odds_white=round(1.0 / max(1e-4, p_w), 2),
            fair_odds_draw=round(1.0 / max(1e-4, p_d), 2),
            fair_odds_black=round(1.0 / max(1e-4, p_b), 2),
            most_likely_outcome=most_likely,
            mode=mode,
            factors=factors,
        )

    def predict_batch_csv(
        self,
        input_csv: Union[str, Path],
        output_csv: Union[str, Path],
    ) -> pd.DataFrame:
        """Predict pre-match probabilities for every pairing row in a CSV file."""
        in_path = Path(input_csv)
        df = pd.read_csv(in_path)
        col_map = {c.strip().lower(): c for c in df.columns}

        def col(*aliases: str) -> Optional[str]:
            for a in aliases:
                if a in col_map:
                    return col_map[a]
            return None

        w_col = col("white", "white_player", "white_name")
        b_col = col("black", "black_player", "black_name")
        if w_col is None or b_col is None:
            raise ValueError("Input CSV must contain 'white' and 'black' columns.")

        w_elo_col = col("white_elo", "whiteelo", "w_elo")
        b_elo_col = col("black_elo", "blackelo", "b_elo")
        tc_col = col("time_control", "timecontrol", "tc")
        date_col = col("date", "utcdate", "game_date")

        preds: List[Dict[str, Any]] = []
        for idx in range(len(df)):
            w_name = str(df[w_col].iloc[idx])
            b_name = str(df[b_col].iloc[idx])
            w_elo = parse_elo(df[w_elo_col].iloc[idx]) if w_elo_col else None
            b_elo = parse_elo(df[b_elo_col].iloc[idx]) if b_elo_col else None
            tc = str(df[tc_col].iloc[idx]) if tc_col else "classical"
            gdate = str(df[date_col].iloc[idx]) if date_col else None

            res = self.predict(
                white=w_name,
                black=b_name,
                white_elo=None if (w_elo is not None and np.isnan(w_elo)) else w_elo,
                black_elo=None if (b_elo is not None and np.isnan(b_elo)) else b_elo,
                time_control=tc,
                game_date=gdate,
            )
            preds.append(
                {
                    "white_elo_used": res.white_elo_used,
                    "black_elo_used": res.black_elo_used,
                    "p_white_win": res.p_white_win,
                    "p_draw": res.p_draw,
                    "p_black_win": res.p_black_win,
                    "expected_score_white": res.expected_score_white,
                    "expected_score_black": res.expected_score_black,
                    "most_likely_outcome": res.most_likely_outcome,
                }
            )

        out_df = pd.concat([df.reset_index(drop=True), pd.DataFrame(preds)], axis=1)
        out_path = Path(output_csv)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_df.to_csv(out_path, index=False, encoding="utf-8")
        return out_df
