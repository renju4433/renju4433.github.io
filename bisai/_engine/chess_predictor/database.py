"""SQLite persistence for pre-match predictions, finished games, and Round-Robin snapshots."""

from __future__ import annotations

import csv
import datetime as dt
import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .data_loader import (
    LABEL_TO_WHITE_SCORE,
    normalize_player_name,
    normalize_result,
    parse_elo,
    parse_pgn_date,
)
from .predictor import ChessPreMatchPredictor


def _canonical_result(raw_status: Any) -> str:
    lbl = normalize_result(raw_status)
    if lbl is None:
        return "*"
    return {0: "1-0", 1: "1/2-1/2", 2: "0-1"}[lbl]


def _make_game_key(round_id: str, white: str, black: str) -> str:
    return f"{round_id}::{white}::{black}"


class ChessDatabase:
    """Local SQLite store for locked pre-match predictions and finished tournament games."""

    def __init__(self, db_path: Union[str, Path]) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS games (
                    game_key TEXT PRIMARY KEY,
                    date TEXT,
                    tour_id TEXT,
                    tour_name TEXT,
                    tier INTEGER DEFAULT 0,
                    round_id TEXT,
                    round_name TEXT,
                    starts_at TEXT,
                    starts_at_ms INTEGER DEFAULT 0,
                    time_control TEXT DEFAULT 'classical',
                    tour_format TEXT DEFAULT '',
                    white TEXT NOT NULL,
                    black TEXT NOT NULL,
                    white_elo REAL,
                    black_elo REAL,
                    status TEXT DEFAULT '*',
                    pred_p_white REAL,
                    pred_p_draw REAL,
                    pred_p_black REAL,
                    pred_exp_white REAL,
                    pred_exp_black REAL,
                    pred_factors_json TEXT,
                    pred_locked INTEGER DEFAULT 0,
                    pred_at TEXT,
                    ingested_to_model INTEGER DEFAULT 0,
                    updated_at TEXT
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_games_round ON games(round_id, starts_at_ms)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_games_status ON games(status, starts_at_ms)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS rr_snapshots (
                    tour_id TEXT PRIMARY KEY,
                    tour_name TEXT,
                    tour_format TEXT,
                    as_of_round TEXT,
                    snapshot_json TEXT NOT NULL,
                    updated_at TEXT
                )
                """
            )

    def migrate_csv_if_needed(self, csv_path: Union[str, Path]) -> int:
        """Import any legacy finished_games.csv rows that are not yet in SQLite."""
        p = Path(csv_path)
        if not p.exists():
            return 0
        now_iso = dt.datetime.now(tz=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        inserted = 0
        with self._connect() as conn:
            existing = {
                r["game_key"] for r in conn.execute("SELECT game_key FROM games").fetchall()
            }
            with p.open("r", encoding="utf-8", newline="") as f:
                for row in csv.DictReader(f):
                    gkey = (row.get("game_key") or "").strip()
                    if not gkey or gkey in existing:
                        continue
                    w = normalize_player_name(row.get("white", ""))
                    b = normalize_player_name(row.get("black", ""))
                    if not w or not b:
                        continue
                    st = _canonical_result(row.get("result"))
                    date_str = (row.get("date") or "").strip()
                    d_obj = parse_pgn_date(date_str)
                    ms = int(
                        dt.datetime(d_obj.year, d_obj.month, d_obj.day, tzinfo=dt.timezone.utc).timestamp() * 1000
                    ) if d_obj else 0
                    conn.execute(
                        """
                        INSERT INTO games (
                            game_key, date, tour_id, tour_name, tier, round_id, round_name,
                            starts_at, starts_at_ms, time_control, white, black,
                            white_elo, black_elo, status, ingested_to_model, updated_at
                        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                        """,
                        (
                            gkey,
                            date_str,
                            row.get("tour_id", ""),
                            row.get("tour_name", ""),
                            row.get("round_id", ""),
                            row.get("round_name", ""),
                            f"{date_str} 00:00 UTC" if date_str else None,
                            ms,
                            row.get("time_control", "classical"),
                            w,
                            b,
                            None if not row.get("white_elo") else float(row["white_elo"]),
                            None if not row.get("black_elo") else float(row["black_elo"]),
                            st,
                            now_iso,
                        ),
                    )
                    existing.add(gkey)
                    inserted += 1
        return inserted

    def sync_events_and_lock_predictions(
        self,
        events: List[Dict[str, Any]],
        predictor: ChessPreMatchPredictor,
        now_ms: Optional[int] = None,
    ) -> Tuple[int, int]:
        """
        Sync scheduled/live/finished events into SQLite:
        1. Lock pre-match predictions BEFORE games start/finish (never overwrite after kickoff/finish).
        2. Incrementally update predictor.store for newly finished games (strictly idempotent).

        Returns (locked_predictions_count, newly_ingested_finished_games_count).
        """
        curr_ms = now_ms if now_ms is not None else int(time.time() * 1000)
        now_iso = dt.datetime.now(tz=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        locked_count = 0
        to_ingest: List[Tuple[int, str, str, str, int, float, float, str]] = []

        with self._connect() as conn:
            for ev in events:
                rid = str(ev.get("round_id") or ev.get("round_name") or "round")
                tid = str(ev.get("tour_id") or "")
                tname = str(ev.get("tour_name") or "")
                tier = int(ev.get("tier") or 0)
                rname = str(ev.get("round_name") or "")
                starts_at = ev.get("starts_at")
                starts_ms = int(ev.get("starts_at_ms") or 0)
                tc = str(ev.get("time_control") or "classical")
                tformat = str(ev.get("format") or "")
                date_str = (
                    str(starts_at)[:10]
                    if starts_at and len(str(starts_at)) >= 10
                    else dt.date.today().strftime("%Y-%m-%d")
                )

                for g in ev.get("pairings") or []:
                    w = normalize_player_name(g.get("white", ""))
                    b = normalize_player_name(g.get("black", ""))
                    if not w or not b or w == b:
                        continue
                    gkey = _make_game_key(rid, w, b)
                    raw_st = g.get("status", "*")
                    lbl = normalize_result(raw_st)
                    canon_st = _canonical_result(raw_st)

                    w_elo = parse_elo(g.get("white_elo"))
                    b_elo = parse_elo(g.get("black_elo"))
                    w_elo_db = None if (w_elo != w_elo) else float(w_elo)
                    b_elo_db = None if (b_elo != b_elo) else float(b_elo)

                    row = conn.execute(
                        "SELECT * FROM games WHERE game_key = ?", (gkey,)
                    ).fetchone()

                    already_locked = bool(
                        row is not None
                        and row["pred_p_white"] is not None
                        and int(row["pred_locked"] or 0) == 1
                        and (
                            lbl is not None
                            or (starts_ms > 0 and curr_ms >= starts_ms)
                            or row["status"] != "*"
                        )
                    )

                    if already_locked and row is not None:
                        p_w = float(row["pred_p_white"])
                        p_d = float(row["pred_p_draw"])
                        p_b = float(row["pred_p_black"])
                        exp_w = float(row["pred_exp_white"])
                        exp_b = float(row["pred_exp_black"])
                        factors_json = row["pred_factors_json"]
                        pred_at = row["pred_at"]
                        pred_locked = 1
                    else:
                        pred = predictor.predict(
                            white=w,
                            black=b,
                            white_elo=w_elo_db,
                            black_elo=b_elo_db,
                            time_control=tc,
                            game_date=date_str,
                        )
                        p_w = pred.p_white_win
                        p_d = pred.p_draw
                        p_b = pred.p_black_win
                        exp_w = pred.expected_score_white
                        exp_b = pred.expected_score_black
                        factors_json = json.dumps(pred.factors, ensure_ascii=False)
                        pred_at = now_iso
                        pred_locked = 1
                        locked_count += 1

                    already_ingested = int(row["ingested_to_model"]) if row is not None else 0

                    if row is None:
                        conn.execute(
                            """
                            INSERT INTO games (
                                game_key, date, tour_id, tour_name, tier, round_id, round_name,
                                starts_at, starts_at_ms, time_control, tour_format, white, black,
                                white_elo, black_elo, status, pred_p_white, pred_p_draw, pred_p_black,
                                pred_exp_white, pred_exp_black, pred_factors_json, pred_locked, pred_at,
                                ingested_to_model, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                gkey, date_str, tid, tname, tier, rid, rname,
                                starts_at, starts_ms, tc, tformat, w, b,
                                w_elo_db, b_elo_db, canon_st, p_w, p_d, p_b,
                                exp_w, exp_b, factors_json, pred_locked, pred_at,
                                0, now_iso,
                            ),
                        )
                    else:
                        conn.execute(
                            """
                            UPDATE games SET
                                date = ?, tour_id = ?, tour_name = ?, tier = ?, round_name = ?,
                                starts_at = ?, starts_at_ms = ?, time_control = ?,
                                tour_format = CASE WHEN ? != '' THEN ? ELSE tour_format END,
                                white_elo = COALESCE(?, white_elo),
                                black_elo = COALESCE(?, black_elo),
                                status = ?,
                                pred_p_white = ?, pred_p_draw = ?, pred_p_black = ?,
                                pred_exp_white = ?, pred_exp_black = ?, pred_factors_json = ?,
                                pred_locked = ?, pred_at = ?, updated_at = ?
                            WHERE game_key = ?
                            """,
                            (
                                date_str, tid, tname, tier, rname,
                                starts_at, starts_ms, tc,
                                tformat, tformat,
                                w_elo_db, b_elo_db, canon_st,
                                p_w, p_d, p_b, exp_w, exp_b, factors_json,
                                pred_locked, pred_at, now_iso, gkey,
                            ),
                        )

                    if lbl is not None and already_ingested == 0:
                        to_ingest.append((starts_ms, gkey, w, b, lbl, w_elo, b_elo, date_str))

            # Chronologically ingest newly finished games into predictor.store
            if to_ingest:
                to_ingest.sort(key=lambda x: x[0])
                for starts_ms, gkey, w, b, lbl, w_elo, b_elo, date_str in to_ingest:
                    d_obj = parse_pgn_date(date_str) or dt.date.today()
                    w_res = predictor.store.resolve_player_name(w)
                    b_res = predictor.store.resolve_player_name(b)
                    predictor.store.update_after_game(
                        white=w_res,
                        black=b_res,
                        white_score=LABEL_TO_WHITE_SCORE[lbl],
                        white_elo=w_elo,
                        black_elo=b_elo,
                        day_ordinal=d_obj.toordinal(),
                    )
                    conn.execute(
                        "UPDATE games SET ingested_to_model = 1 WHERE game_key = ?", (gkey,)
                    )

                predictor.metadata["n_games"] = int(predictor.metadata.get("n_games", 0)) + len(to_ingest)
                predictor.metadata["n_players"] = len(predictor.store.players)
                max_date = max(x[7] for x in to_ingest)
                prev_max = str(predictor.metadata.get("date_max") or "")
                if not prev_max or max_date > prev_max:
                    predictor.metadata["date_max"] = max_date

        return locked_count, len(to_ingest)

    def get_locked_prediction(self, round_id: str, white: str, black: str) -> Optional[Dict[str, Any]]:
        """Retrieve a previously locked pre-match prediction from SQLite."""
        gkey = _make_game_key(round_id, normalize_player_name(white), normalize_player_name(black))
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM games WHERE game_key = ?", (gkey,)).fetchone()
        if row is None or row["pred_p_white"] is None:
            return None
        return self._row_to_prediction_dict(row)

    @staticmethod
    def _row_to_prediction_dict(row: sqlite3.Row) -> Dict[str, Any]:
        p_w = float(row["pred_p_white"])
        p_d = float(row["pred_p_draw"])
        p_b = float(row["pred_p_black"])
        exp_w = float(row["pred_exp_white"])
        exp_b = float(row["pred_exp_black"])
        factors = {}
        if row["pred_factors_json"]:
            try:
                factors = json.loads(row["pred_factors_json"])
            except Exception:
                factors = {}
        outcomes = [("White Win (1-0)", p_w), ("Draw (1/2-1/2)", p_d), ("Black Win (0-1)", p_b)]
        most_likely = max(outcomes, key=lambda x: x[1])[0]
        return {
            "white": row["white"],
            "black": row["black"],
            "white_elo_used": row["white_elo"] or factors.get("white_glicko") or 1800.0,
            "black_elo_used": row["black_elo"] or factors.get("black_glicko") or 1800.0,
            "time_control": row["time_control"] or "classical",
            "p_white_win": p_w,
            "p_draw": p_d,
            "p_black_win": p_b,
            "expected_score_white": exp_w,
            "expected_score_black": exp_b,
            "fair_odds_white": round(1.0 / max(1e-4, p_w), 2),
            "fair_odds_draw": round(1.0 / max(1e-4, p_d), 2),
            "fair_odds_black": round(1.0 / max(1e-4, p_b), 2),
            "most_likely_outcome": most_likely,
            "mode": "locked_prematch_db",
            "factors": factors,
        }

    def get_finished_rounds(
        self,
        predictor: ChessPreMatchPredictor,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Read finished rounds strictly from the SQLite database, attaching each game's
        saved pre-match prediction and actual final result.
        """
        with self._connect() as conn:
            round_rows = conn.execute(
                """
                SELECT round_id, tour_id, tour_name, tier, round_name,
                       starts_at, starts_at_ms, time_control, tour_format,
                       COUNT(*) AS total_games,
                       SUM(CASE WHEN status IN ('1-0','0-1','1/2-1/2') THEN 1 ELSE 0 END) AS done_games
                FROM games
                WHERE round_id != ''
                GROUP BY round_id
                HAVING done_games > 0 AND done_games = total_games
                ORDER BY starts_at_ms DESC, tier DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

            events: List[Dict[str, Any]] = []
            for rr in round_rows:
                g_rows = conn.execute(
                    "SELECT * FROM games WHERE round_id = ? ORDER BY rowid ASC",
                    (rr["round_id"],),
                ).fetchall()
                pairings: List[Dict[str, Any]] = []
                for gr in g_rows:
                    if gr["pred_p_white"] is not None:
                        pred_dict = self._row_to_prediction_dict(gr)
                    else:
                        pred_dict = predictor.predict(
                            white=gr["white"],
                            black=gr["black"],
                            white_elo=gr["white_elo"],
                            black_elo=gr["black_elo"],
                            time_control=gr["time_control"] or "classical",
                            game_date=gr["date"],
                        ).to_dict()
                    pairings.append(
                        {
                            "white": gr["white"],
                            "white_elo": int(round(gr["white_elo"])) if gr["white_elo"] else None,
                            "black": gr["black"],
                            "black_elo": int(round(gr["black_elo"])) if gr["black_elo"] else None,
                            "status": gr["status"],
                            "prediction": pred_dict,
                        }
                    )
                if not pairings:
                    continue
                events.append(
                    {
                        "tour_id": rr["tour_id"],
                        "tour_name": rr["tour_name"],
                        "tier": int(rr["tier"] or 0),
                        "round_id": rr["round_id"],
                        "round_name": rr["round_name"],
                        "status": "finished",
                        "starts_at": rr["starts_at"],
                        "starts_at_ms": int(rr["starts_at_ms"] or 0),
                        "time_control": rr["time_control"] or "classical",
                        "format": rr["tour_format"] or "",
                        "pairings": pairings,
                    }
                )
        return events

    def save_rr_snapshot(
        self,
        tour_id: str,
        tour_name: str,
        tour_format: str,
        as_of_round: str,
        snapshot: Dict[str, Any],
    ) -> None:
        now_iso = dt.datetime.now(tz=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO rr_snapshots (tour_id, tour_name, tour_format, as_of_round, snapshot_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(tour_id) DO UPDATE SET
                    tour_name = excluded.tour_name,
                    tour_format = excluded.tour_format,
                    as_of_round = excluded.as_of_round,
                    snapshot_json = excluded.snapshot_json,
                    updated_at = excluded.updated_at
                """,
                (
                    tour_id,
                    tour_name,
                    tour_format,
                    as_of_round,
                    json.dumps(snapshot, ensure_ascii=False),
                    now_iso,
                ),
            )
