"""Pre-match chess outcome models, chronological evaluation, and calibration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Tuple

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from .features import FEATURE_COLUMNS
from .ratings import DavidsonModel


def compute_metrics(y_true: np.ndarray, probs: np.ndarray) -> Dict[str, float]:
    """
    Compute proper scoring rules and accuracy for 3-class chess outcomes.

    Classes: 0 = White Win, 1 = Draw, 2 = Black Win.
    """
    y = np.asarray(y_true, dtype=int)
    p = np.clip(np.asarray(probs, dtype=float), 1e-12, 1.0)
    p = p / p.sum(axis=1, keepdims=True)
    n = len(y)

    # Multi-class LogLoss
    log_loss = float(-np.mean(np.log(p[np.arange(n), y])))

    # Multi-class Brier Score
    one_hot = np.zeros_like(p)
    one_hot[np.arange(n), y] = 1.0
    brier = float(np.mean(np.sum((p - one_hot) ** 2, axis=1)))

    # Ranked Probability Score (ordered outcomes: White > Draw > Black)
    cdf_p = np.cumsum(p, axis=1)[:, :2]
    cdf_y = np.cumsum(one_hot, axis=1)[:, :2]
    rps = float(np.mean(np.mean((cdf_p - cdf_y) ** 2, axis=1)))

    # Expected score RMSE
    pred_score = p[:, 0] + 0.5 * p[:, 1]
    true_score = np.where(y == 0, 1.0, np.where(y == 1, 0.5, 0.0))
    score_rmse = float(np.sqrt(np.mean((pred_score - true_score) ** 2)))

    # Accuracy
    acc = float(np.mean(np.argmax(p, axis=1) == y))

    return {
        "log_loss": round(log_loss, 5),
        "brier_score": round(brier, 5),
        "rps": round(rps, 5),
        "score_rmse": round(score_rmse, 5),
        "accuracy": round(acc, 5),
    }


def _augment_with_davidson(
    X: pd.DataFrame,
    davidson: DavidsonModel,
    time_controls: Iterable[str],
) -> pd.DataFrame:
    """Append Davidson prior probabilities and logits to the feature DataFrame."""
    dav_p = davidson.predict_proba(
        X["white_eff_elo"].to_numpy(),
        X["black_eff_elo"].to_numpy(),
        time_controls,
    )
    out = X.copy()
    out["dav_p_white"] = dav_p[:, 0]
    out["dav_p_draw"] = dav_p[:, 1]
    out["dav_p_black"] = dav_p[:, 2]
    out["dav_exp_score"] = dav_p[:, 0] + 0.5 * dav_p[:, 1]
    return out


@dataclass
class PreMatchModel:
    """
    Hybrid pre-match chess predictor combining calibrated Davidson priors,
    regularized Multinomial Logistic Regression, and LightGBM.
    """

    model_type: str = "ensemble"  # "davidson", "logreg", "lightgbm", "ensemble"
    davidson: DavidsonModel = field(default_factory=DavidsonModel)
    scaler: Optional[StandardScaler] = None
    logreg: Optional[LogisticRegression] = None
    lgbm: Optional[lgb.LGBMClassifier] = None
    blend_weights: Tuple[float, float, float] = (0.35, 0.35, 0.30)
    feature_names: List[str] = field(default_factory=list)
    train_metrics: Dict[str, Dict[str, float]] = field(default_factory=dict)

    def _fit_submodels(
        self,
        X_train: pd.DataFrame,
        y_train: np.ndarray,
        tc_train: List[str],
        use_lgbm: bool = True,
    ) -> Tuple[DavidsonModel, StandardScaler, LogisticRegression, Optional[lgb.LGBMClassifier], List[str]]:
        dav = DavidsonModel().fit(
            X_train["white_eff_elo"].to_numpy(),
            X_train["black_eff_elo"].to_numpy(),
            tc_train,
            y_train,
        )
        X_aug = _augment_with_davidson(X_train, dav, tc_train)
        cols = list(X_aug.columns)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_aug)

        reg_c = min(0.15, max(0.025, len(X_train) / 15000.0))
        lr = LogisticRegression(
            C=reg_c,
            max_iter=1000,
            random_state=42,
        )
        lr.fit(X_scaled, y_train)

        gbm: Optional[lgb.LGBMClassifier] = None
        if use_lgbm and len(X_train) >= 120:
            gbm = lgb.LGBMClassifier(
                objective="multiclass",
                num_class=3,
                n_estimators=180,
                learning_rate=0.03,
                num_leaves=15,
                max_depth=4,
                min_child_samples=max(15, min(50, len(X_train) // 30)),
                subsample=0.8,
                colsample_bytree=0.8,
                reg_alpha=1.0,
                reg_lambda=2.0,
                random_state=42,
                verbose=-1,
            )
            gbm.fit(X_aug, y_train)

        return dav, scaler, lr, gbm, cols

    def fit(
        self,
        X: pd.DataFrame,
        y: np.ndarray,
        time_controls: Iterable[str],
        val_ratio: float = 0.2,
    ) -> "PreMatchModel":
        """Fit the model chronologically and tune ensemble weights on a time-ordered holdout."""
        tc_list = list(time_controls)
        n = len(X)
        if n < 30:
            raise ValueError(f"Need at least 30 games to train ML models, got {n}.")

        use_lgbm = self.model_type in {"lightgbm", "ensemble"}

        # Step 1: Chronological validation split to tune blend weights & report unbiased metrics
        split_idx = max(20, int(n * (1.0 - val_ratio)))
        if split_idx < n - 10:
            X_tr, y_tr, tc_tr = X.iloc[:split_idx], y[:split_idx], tc_list[:split_idx]
            X_va, y_va, tc_va = X.iloc[split_idx:], y[split_idx:], tc_list[split_idx:]

            dav_v, sc_v, lr_v, gbm_v, cols_v = self._fit_submodels(
                X_tr, y_tr, tc_tr, use_lgbm=use_lgbm
            )
            X_va_aug = _augment_with_davidson(X_va, dav_v, tc_va)[cols_v]
            p_dav = dav_v.predict_proba(
                X_va["white_eff_elo"].to_numpy(),
                X_va["black_eff_elo"].to_numpy(),
                tc_va,
            )
            p_lr = lr_v.predict_proba(sc_v.transform(X_va_aug))
            p_gbm = gbm_v.predict_proba(X_va_aug) if gbm_v is not None else p_lr

            self.train_metrics = {
                "davidson_val": compute_metrics(y_va, p_dav),
                "logreg_val": compute_metrics(y_va, p_lr),
            }
            if gbm_v is not None:
                self.train_metrics["lightgbm_val"] = compute_metrics(y_va, p_gbm)

            if self.model_type == "ensemble":
                weights = self._optimize_blend_weights(y_va, p_dav, p_lr, p_gbm if gbm_v is not None else None)
                self.blend_weights = weights
                p_ens = weights[0] * p_dav + weights[1] * p_lr + weights[2] * p_gbm
                self.train_metrics["ensemble_val"] = compute_metrics(y_va, p_ens)

        # Step 2: Refit submodels on full chronological dataset for serving
        dav_f, sc_f, lr_f, gbm_f, cols_f = self._fit_submodels(
            X, y, tc_list, use_lgbm=use_lgbm
        )
        self.davidson = dav_f
        self.scaler = sc_f
        self.logreg = lr_f
        self.lgbm = gbm_f
        self.feature_names = cols_f

        if self.model_type == "davidson":
            self.blend_weights = (1.0, 0.0, 0.0)
        elif self.model_type == "logreg":
            self.blend_weights = (0.0, 1.0, 0.0)
        elif self.model_type == "lightgbm":
            self.blend_weights = (0.0, 0.0, 1.0) if self.lgbm is not None else (0.5, 0.5, 0.0)

        return self

    @staticmethod
    def _optimize_blend_weights(
        y_val: np.ndarray,
        p_dav: np.ndarray,
        p_lr: np.ndarray,
        p_gbm: Optional[np.ndarray],
    ) -> Tuple[float, float, float]:
        if p_gbm is None:
            def loss2(w: np.ndarray) -> float:
                w0 = float(w[0])
                p = np.clip(w0 * p_dav + (1.0 - w0) * p_lr, 1e-12, 1.0)
                return float(-np.mean(np.log(p[np.arange(len(y_val)), y_val])))

            res = minimize(loss2, np.array([0.5]), bounds=[(0.0, 1.0)])
            w0 = float(res.x[0])
            return (round(w0, 4), round(1.0 - w0, 4), 0.0)

        def loss3(raw: np.ndarray) -> float:
            ex = np.exp(raw - np.max(raw))
            w = ex / ex.sum()
            p = np.clip(w[0] * p_dav + w[1] * p_lr + w[2] * p_gbm, 1e-12, 1.0)
            return float(-np.mean(np.log(p[np.arange(len(y_val)), y_val])))

        res = minimize(loss3, np.array([0.0, 0.0, 0.0]), method="BFGS")
        ex = np.exp(res.x - np.max(res.x))
        w = ex / ex.sum()
        return (round(float(w[0]), 4), round(float(w[1]), 4), round(float(w[2]), 4))

    def predict_proba(self, X: pd.DataFrame, time_controls: Iterable[str]) -> np.ndarray:
        """Predict [P(White Win), P(Draw), P(Black Win)] for rows in X."""
        tc_list = list(time_controls)
        p_dav = self.davidson.predict_proba(
            X["white_eff_elo"].to_numpy(),
            X["black_eff_elo"].to_numpy(),
            tc_list,
        )
        if self.logreg is None or self.scaler is None or self.model_type == "davidson":
            return p_dav

        X_aug = _augment_with_davidson(X[FEATURE_COLUMNS], self.davidson, tc_list)
        if self.feature_names:
            X_aug = X_aug[self.feature_names]

        p_lr = self.logreg.predict_proba(self.scaler.transform(X_aug))
        p_gbm = self.lgbm.predict_proba(X_aug) if self.lgbm is not None else p_lr

        w0, w1, w2 = self.blend_weights
        p = w0 * p_dav + w1 * p_lr + w2 * p_gbm
        p = np.clip(p, 1e-9, 1.0)
        return p / p.sum(axis=1, keepdims=True)

    def top_feature_importances(self, top_k: int = 12) -> List[Tuple[str, float]]:
        """Return top normalized feature importances from LightGBM or LogisticRegression."""
        if self.lgbm is not None:
            raw = np.asarray(self.lgbm.feature_importances_, dtype=float)
            names = self.feature_names
        elif self.logreg is not None:
            raw = np.mean(np.abs(self.logreg.coef_), axis=0)
            names = self.feature_names
        else:
            return []

        total = float(raw.sum()) or 1.0
        pairs = sorted(zip(names, raw / total), key=lambda x: x[1], reverse=True)
        return [(k, round(float(v), 4)) for k, v in pairs[:top_k]]
