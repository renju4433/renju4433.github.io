"""Archive finished broadcast games and incrementally update player state."""

from __future__ import annotations

import csv
import datetime as dt
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple, Union

from .data_loader import LABEL_TO_WHITE_SCORE, normalize_player_name, normalize_result, parse_elo, parse_pgn_date
from .predictor import ChessPreMatchPredictor

HISTORY_COLUMNS = [
    "game_key",
    "date",
    "tour_id",
    "tour_name",
    "round_id",
    "round_name",
    "time_control",
    "white",
    "black",
    "white_elo",
    "black_elo",
    "result",
]


def _make_game_key(round_id: str, white: str, black: str) -> str:
    return f"{round_id}::{white}::{black}"


def _canonical_result_str(label: int) -> str:
    return {0: "1-0", 1: "1/2-1/2", 2: "0-1"}[label]


def _load_existing_keys(history_csv: Path) -> Set[str]:
    if not history_csv.exists():
        return set()
    keys: Set[str] = set()
    with history_csv.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            k = (row.get("game_key") or "").strip()
            if k:
                keys.add(k)
    return keys


def ingest_finished_games(
    predictor: ChessPreMatchPredictor,
    events: List[Dict[str, Any]],
    history_csv: Union[str, Path],
) -> int:
    """
    Persist newly finished games from schedule events to CSV and incrementally
    update predictor.store (Glicko-2, form, color splits, H2H) without double counting.

    Returns the number of newly ingested games.
    """
    csv_path = Path(history_csv)
    existing_keys = _load_existing_keys(csv_path)

    new_records: List[Tuple[int, Dict[str, Any]]] = []
    seen_now: Set[str] = set()

    for ev in events:
        rid = str(ev.get("round_id") or ev.get("round_name") or "round")
        tid = str(ev.get("tour_id") or "")
        tname = str(ev.get("tour_name") or "")
        rname = str(ev.get("round_name") or "")
        tc = str(ev.get("time_control") or "classical")
        starts_ms = int(ev.get("starts_at_ms") or 0)
        starts_iso = str(ev.get("starts_at") or "")
        date_str = starts_iso[:10] if len(starts_iso) >= 10 else dt.date.today().strftime("%Y-%m-%d")

        for g in ev.get("pairings") or []:
            label = normalize_result(g.get("status"))
            if label is None:
                continue
            white = normalize_player_name(g.get("white", ""))
            black = normalize_player_name(g.get("black", ""))
            if not white or not black or white == black:
                continue

            gkey = _make_game_key(rid, white, black)
            if gkey in existing_keys or gkey in seen_now:
                continue
            seen_now.add(gkey)

            w_elo = parse_elo(g.get("white_elo"))
            b_elo = parse_elo(g.get("black_elo"))
            rec = {
                "game_key": gkey,
                "date": date_str,
                "tour_id": tid,
                "tour_name": tname,
                "round_id": rid,
                "round_name": rname,
                "time_control": tc,
                "white": white,
                "black": black,
                "white_elo": "" if (w_elo != w_elo) else int(round(w_elo)),
                "black_elo": "" if (b_elo != b_elo) else int(round(b_elo)),
                "result": _canonical_result_str(label),
                "_label": label,
                "_w_elo_f": w_elo,
                "_b_elo_f": b_elo,
            }
            new_records.append((starts_ms, rec))

    if not new_records:
        return 0

    # Sort chronologically before updating Glicko-2 and rolling form
    new_records.sort(key=lambda x: x[0])

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not csv_path.exists() or csv_path.stat().st_size == 0
    with csv_path.open("a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=HISTORY_COLUMNS)
        if write_header:
            writer.writeheader()
        for _, rec in new_records:
            d_obj = parse_pgn_date(rec["date"]) or dt.date.today()
            day_ord = d_obj.toordinal()
            w_resolved = predictor.store.resolve_player_name(rec["white"])
            b_resolved = predictor.store.resolve_player_name(rec["black"])
            predictor.store.update_after_game(
                white=w_resolved,
                black=b_resolved,
                white_score=LABEL_TO_WHITE_SCORE[rec["_label"]],
                white_elo=rec["_w_elo_f"],
                black_elo=rec["_b_elo_f"],
                day_ordinal=day_ord,
            )
            writer.writerow({k: rec[k] for k in HISTORY_COLUMNS})

    predictor.metadata["n_games"] = int(predictor.metadata.get("n_games", 0)) + len(new_records)
    predictor.metadata["n_players"] = len(predictor.store.players)
    latest_date = max(rec["date"] for _, rec in new_records)
    prev_max = str(predictor.metadata.get("date_max") or "")
    if not prev_max or latest_date > prev_max:
        predictor.metadata["date_max"] = latest_date

    return len(new_records)
