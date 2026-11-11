"""Export pre-computed recent & finished tournament schedules to static JSON."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .data_loader import normalize_result
from .predictor import ChessPreMatchPredictor
from .schedule import fetch_recent_schedule


def _pair_key(g: Dict[str, Any]) -> Tuple[str, str]:
    return (str(g.get("white") or "").strip(), str(g.get("black") or "").strip())


def build_schedule_snapshot(
    predictor: ChessPreMatchPredictor,
    limit: int = 16,
    events: Optional[List[Dict[str, Any]]] = None,
    previous_events: Optional[List[Dict[str, Any]]] = None,
    max_finished_history: int = 30,
) -> Dict[str, Any]:
    """
    Attach pre-match predictions to recent/upcoming/finished tournament rounds,
    preserving finished rounds and original pre-match predictions across runs.
    """
    raw_events = events if events is not None else fetch_recent_schedule(limit=limit, with_pairings=True)

    prev_by_round: Dict[str, Dict[str, Any]] = {}
    for pev in previous_events or []:
        rid = str(pev.get("round_id") or "")
        if rid and (pev.get("pairings") or []):
            prev_by_round[rid] = pev

    merged_by_round: Dict[str, Dict[str, Any]] = {}

    for ev in raw_events:
        rid = str(ev.get("round_id") or ev.get("round_name") or "")
        tc = str(ev.get("time_control") or "classical")
        prev_ev = prev_by_round.get(rid)
        prev_pred_map: Dict[Tuple[str, str], Dict[str, Any]] = {}
        if prev_ev:
            for pg in prev_ev.get("pairings") or []:
                if pg.get("prediction"):
                    prev_pred_map[_pair_key(pg)] = pg["prediction"]

        out_pairings: List[Dict[str, Any]] = []
        for g in ev.get("pairings") or []:
            w, b = _pair_key(g)
            if not w or not b:
                continue
            is_finished_game = normalize_result(g.get("status")) is not None
            # Keep original pre-match prediction if game has finished since prior snapshot
            if is_finished_game and (w, b) in prev_pred_map:
                pred_dict = prev_pred_map[(w, b)]
            else:
                pred_dict = predictor.predict(
                    white=w,
                    black=b,
                    white_elo=g.get("white_elo"),
                    black_elo=g.get("black_elo"),
                    time_control=tc,
                ).to_dict()
            out_pairings.append({**g, "prediction": pred_dict})

        if not out_pairings:
            continue
        ev_copy = {k: v for k, v in ev.items() if k != "pairings"}
        if all(normalize_result(g.get("status")) is not None for g in out_pairings):
            ev_copy["status"] = "finished"
        ev_copy["pairings"] = out_pairings
        merged_by_round[rid] = ev_copy

    # Retain previous rounds (especially finished ones) that rotated out of the live feed
    retained_finished: List[Dict[str, Any]] = []
    for rid, pev in prev_by_round.items():
        if rid in merged_by_round:
            continue
        p_copy = dict(pev)
        # If an older ongoing/upcoming round rotated out without live update, keep it as finished if results exist
        if any(normalize_result(g.get("status")) is not None for g in p_copy.get("pairings") or []):
            if all(normalize_result(g.get("status")) is not None for g in p_copy.get("pairings") or []):
                p_copy["status"] = "finished"
            retained_finished.append(p_copy)
        elif p_copy.get("status") == "finished":
            retained_finished.append(p_copy)

    all_events = list(merged_by_round.values()) + retained_finished
    active_list = [e for e in all_events if e.get("status") in {"ongoing", "upcoming"}]
    finished_list = [e for e in all_events if e.get("status") == "finished"]

    active_list.sort(
        key=lambda e: (
            0 if e.get("status") == "ongoing" else 1,
            -int(e.get("tier") or 0),
            int(e.get("starts_at_ms") or 0) if e.get("status") == "upcoming" else -int(e.get("starts_at_ms") or 0),
        )
    )
    finished_list.sort(
        key=lambda e: (-int(e.get("starts_at_ms") or 0), -int(e.get("tier") or 0))
    )

    final_events = active_list + finished_list[:max_finished_history]

    return {
        "generated_at": dt.datetime.now(tz=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": {
            "n_games": predictor.metadata.get("n_games", 0),
            "n_players": predictor.metadata.get("n_players", 0),
            "date_max": predictor.metadata.get("date_max"),
        },
        "events": final_events,
    }


def export_schedule_json(
    model_path: Union[str, Path],
    output_path: Union[str, Path],
    limit: int = 16,
) -> Path:
    """Load local predictor artifact and write static schedule+prediction JSON."""
    mpath = Path(model_path)
    out = Path(output_path)
    predictor = ChessPreMatchPredictor.load(mpath) if mpath.exists() else ChessPreMatchPredictor()

    previous_events: List[Dict[str, Any]] = []
    if out.exists():
        try:
            previous_events = json.loads(out.read_text(encoding="utf-8")).get("events", [])
        except Exception:
            previous_events = []

    snapshot = build_schedule_snapshot(
        predictor,
        limit=limit,
        previous_events=previous_events,
    )
    if not snapshot["events"] and previous_events:
        return out

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out
