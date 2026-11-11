"""Generate static schedule + pre-match predictions JSON for GitHub Pages."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from chess_predictor.export_static import export_schedule_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(ENGINE_DIR / "chess_prematch.joblib"))
    parser.add_argument("--out", default=str(ENGINE_DIR.parent / "data" / "chess.json"))
    parser.add_argument("--limit", type=int, default=16)
    args = parser.parse_args()

    out = export_schedule_json(args.model, args.out, limit=args.limit)
    print(f"Wrote static schedule snapshot: {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
