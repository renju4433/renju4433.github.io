"""Archive finished games, update player ratings/form, and export static JSON."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from chess_predictor.export_static import build_schedule_snapshot
from chess_predictor.incremental import ingest_finished_games
from chess_predictor.predictor import ChessPreMatchPredictor
from chess_predictor.schedule import fetch_recent_schedule


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(ENGINE_DIR / "chess_prematch.joblib"))
    parser.add_argument("--history", default=str(ENGINE_DIR / "history" / "finished_games.csv"))
    parser.add_argument("--out", default=str(ENGINE_DIR.parent / "data" / "chess.json"))
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    model_path = Path(args.model)
    out = Path(args.out)
    predictor = ChessPreMatchPredictor.load(model_path) if model_path.exists() else ChessPreMatchPredictor()

    previous_events = []
    if out.exists():
        try:
            previous_events = json.loads(out.read_text(encoding="utf-8")).get("events", [])
        except Exception:
            previous_events = []

    events = fetch_recent_schedule(
        limit=args.limit,
        with_pairings=True,
        max_pairing_rounds=args.limit,
        include_finished=8,
    )
    added = ingest_finished_games(predictor, events, history_csv=args.history)
    if added > 0:
        predictor.save(model_path)
    print(f"Archived & ingested {added} newly finished games (total={predictor.metadata.get('n_games', 0)}).")

    snapshot = build_schedule_snapshot(
        predictor,
        events=events,
        previous_events=previous_events,
    )
    if not snapshot["events"] and previous_events:
        print("Upstream schedule returned 0 events; keeping existing chess.json.")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote static schedule snapshot: {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
