"""Export pre-computed recent tournament schedule and predictions to static JSON."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .predictor import ChessPreMatchPredictor
from .schedule import fetch_recent_schedule


def build_schedule_snapshot(
    predictor: ChessPreMatchPredictor,
    limit: int = 16,
    events: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Attach pre-match predictions to every pairing in recent/upcoming tournament rounds."""
    raw_events = events if events is not None else fetch_recent_schedule(limit=limit, with_pairings=True)
    enriched_events: List[Dict[str, Any]] = []

    for ev in raw_events:
        tc = str(ev.get("time_control") or "classical")
        out_pairings: List[Dict[str, Any]] = []
        for g in ev.get("pairings") or []:
            w = str(g.get("white") or "").strip()
            b = str(g.get("black") or "").strip()
            if not w or not b:
                continue
            pred = predictor.predict(
                white=w,
                black=b,
                white_elo=g.get("white_elo"),
                black_elo=g.get("black_elo"),
                time_control=tc,
            )
            out_pairings.append({**g, "prediction": pred.to_dict()})

        if not out_pairings:
            continue
        ev_copy = {k: v for k, v in ev.items() if k != "pairings"}
        ev_copy["pairings"] = out_pairings
        enriched_events.append(ev_copy)

    return {
        "generated_at": dt.datetime.now(tz=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": {
            "n_games": predictor.metadata.get("n_games", 0),
            "n_players": predictor.metadata.get("n_players", 0),
            "date_max": predictor.metadata.get("date_max"),
        },
        "events": enriched_events,
    }


def export_schedule_json(
    model_path: Union[str, Path],
    output_path: Union[str, Path],
    limit: int = 16,
) -> Path:
    """Load local predictor artifact and write static schedule+prediction JSON."""
    mpath = Path(model_path)
    predictor = ChessPreMatchPredictor.load(mpath) if mpath.exists() else ChessPreMatchPredictor()
    snapshot = build_schedule_snapshot(predictor, limit=limit)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out
