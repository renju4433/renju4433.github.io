"""Sync SQLite DB, lock pre-match predictions, simulate championships, and export chess.json."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from chess_predictor.database import ChessDatabase
from chess_predictor.export_static import build_championship_list, build_schedule_snapshot
from chess_predictor.predictor import ChessPreMatchPredictor
from chess_predictor.schedule import fetch_recent_schedule


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(ENGINE_DIR / "chess_prematch.joblib"))
    parser.add_argument("--db", default=str(ENGINE_DIR / "history" / "chess.db"))
    parser.add_argument("--legacy-csv", default=str(ENGINE_DIR / "history" / "finished_games.csv"))
    parser.add_argument("--out", default=str(ENGINE_DIR.parent / "data" / "chess.json"))
    parser.add_argument("--limit", type=int, default=16)
    args = parser.parse_args()

    model_path = Path(args.model)
    predictor = ChessPreMatchPredictor.load(model_path) if model_path.exists() else ChessPreMatchPredictor()
    db = ChessDatabase(args.db)
    migrated = db.migrate_csv_if_needed(args.legacy_csv)
    if migrated:
        print(f"Migrated {migrated} legacy CSV rows into SQLite DB.")

    live_events = fetch_recent_schedule(
        limit=args.limit,
        with_pairings=True,
        max_pairing_rounds=args.limit,
        include_finished=6,
    )
    locked, ingested = db.sync_events_and_lock_predictions(live_events, predictor)

    championships = build_championship_list(predictor, db=db, max_tours=5, n_sims=5000)
    if ingested > 0:
        predictor.save(model_path)
    print(f"DB synced: locked={locked}, newly_ingested={ingested}, total_games={predictor.metadata.get('n_games', 0)}")

    out = Path(args.out)
    previous_events = []
    if out.exists():
        try:
            prev_obj = json.loads(out.read_text(encoding="utf-8"))
            previous_events = prev_obj.get("events", [])
            if not championships:
                championships = prev_obj.get("championships", [])
        except Exception:
            previous_events = []

    snapshot = build_schedule_snapshot(
        predictor,
        events=live_events,
        previous_events=previous_events,
        db=db,
        max_finished_history=25,
        championships=championships,
    )
    if snapshot["events"] or not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(
            f"Wrote {out} ({out.stat().st_size} bytes, {len(snapshot['events'])} rounds, "
            f"{len(snapshot['championships'])} championships)"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
