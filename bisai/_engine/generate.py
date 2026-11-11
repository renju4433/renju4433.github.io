"""Sync SQLite DB, lock pre-match predictions, archive finished games, and export JSONs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from chess_predictor.database import ChessDatabase
from chess_predictor.export_static import build_round_robin_snapshot, build_schedule_snapshot
from chess_predictor.predictor import ChessPreMatchPredictor
from chess_predictor.schedule import fetch_recent_schedule


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(ENGINE_DIR / "chess_prematch.joblib"))
    parser.add_argument("--db", default=str(ENGINE_DIR / "history" / "chess.db"))
    parser.add_argument("--legacy-csv", default=str(ENGINE_DIR / "history" / "finished_games.csv"))
    parser.add_argument("--out", default=str(ENGINE_DIR.parent / "data" / "chess.json"))
    parser.add_argument("--rr-out", default=str(ENGINE_DIR.parent / "data" / "chess_rr.json"))
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
    if ingested > 0:
        predictor.save(model_path)
    print(f"DB synced: locked={locked}, newly_ingested={ingested}, total_games={predictor.metadata.get('n_games', 0)}")

    # Read finished rounds from DB & combine with active/upcoming live rounds
    out = Path(args.out)
    previous_events = []
    if out.exists():
        try:
            previous_events = json.loads(out.read_text(encoding="utf-8")).get("events", [])
        except Exception:
            previous_events = []

    snapshot = build_schedule_snapshot(
        predictor,
        events=live_events,
        previous_events=previous_events,
        db=db,
        max_finished_history=25,
    )
    if snapshot["events"] or not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {out} ({out.stat().st_size} bytes, {len(snapshot['events'])} rounds)")

    # Simulate active/recent Single Round-Robin tournaments with FIDE Berger + FIDE tiebreaks
    rr_out = Path(args.rr_out)
    rr_snap = build_round_robin_snapshot(predictor, db=db, max_tours=6, n_sims=5000)
    if rr_snap["tournaments"] or not rr_out.exists():
        rr_out.parent.mkdir(parents=True, exist_ok=True)
        rr_out.write_text(json.dumps(rr_snap, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {rr_out} ({rr_out.stat().st_size} bytes, {len(rr_snap['tournaments'])} RR tours)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
