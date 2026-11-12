"""Export DB-backed schedule, accuracy stats, and championship data to a single clean JSON."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .data_loader import normalize_player_name, normalize_result
from .database import ChessDatabase
from .predictor import ChessPreMatchPredictor
from .round_robin import simulate_fide_round_robin
from .schedule import fetch_recent_schedule, fetch_single_round_robin_tours


def _pair_key(g: Dict[str, Any]) -> Tuple[str, str]:
    return (normalize_player_name(g.get("white", "")), normalize_player_name(g.get("black", "")))


def _compute_db_accuracy(finished_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute transparent pre-match prediction accuracy across archived finished games."""
    total_decided = 0
    hits = 0
    conf_total = 0
    conf_hits = 0
    recent_hits: List[Dict[str, Any]] = []
    recent_misses: List[Dict[str, Any]] = []

    for ev in finished_events:
        for g in ev.get("pairings") or []:
            lbl = normalize_result(g.get("status"))
            pr = g.get("prediction")
            if lbl is None or not pr:
                continue
            pw = float(pr.get("p_white_win") or 0.0)
            pd = float(pr.get("p_draw") or 0.0)
            pb = float(pr.get("p_black_win") or 0.0)
            probs = [(0, pw, g["white"]), (1, pd, "和棋"), (2, pb, g["black"])]
            pred_lbl, top_p, top_side = max(probs, key=lambda x: x[1])

            # Also track decisive favorite accuracy (white vs black) when non-draw or max outcome
            total_decided += 1
            is_hit = (pred_lbl == lbl)
            if is_hit:
                hits += 1
            if top_p >= 0.55:
                conf_total += 1
                if is_hit:
                    conf_hits += 1
                    if len(recent_hits) < 8:
                        recent_hits.append(
                            {
                                "tour_name": ev.get("tour_name"),
                                "round_name": ev.get("round_name"),
                                "white": g["white"],
                                "black": g["black"],
                                "status": g["status"],
                                "pick": top_side,
                                "prob": round(top_p, 4),
                            }
                        )
                elif len(recent_misses) < 6:
                    recent_misses.append(
                        {
                            "tour_name": ev.get("tour_name"),
                            "round_name": ev.get("round_name"),
                            "white": g["white"],
                            "black": g["black"],
                            "status": g["status"],
                            "pick": top_side,
                            "prob": round(top_p, 4),
                        }
                    )

    return {
        "total_finished": total_decided,
        "hits": hits,
        "accuracy": round(hits / total_decided, 4) if total_decided else None,
        "confident_total": conf_total,
        "confident_hits": conf_hits,
        "confident_accuracy": round(conf_hits / conf_total, 4) if conf_total else None,
        "recent_hits": recent_hits,
        "recent_misses": recent_misses,
    }


def build_schedule_snapshot(
    predictor: ChessPreMatchPredictor,
    limit: int = 16,
    events: Optional[List[Dict[str, Any]]] = None,
    previous_events: Optional[List[Dict[str, Any]]] = None,
    db: Optional[ChessDatabase] = None,
    max_finished_history: Optional[int] = None,
    championships: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Combine live active/upcoming rounds (with locked pre-match predictions),
    finished rounds read strictly from ChessDatabase, and championship predictions.
    """
    raw_events = events if events is not None else fetch_recent_schedule(limit=limit, with_pairings=True)

    if db is not None and raw_events:
        db.sync_events_and_lock_predictions(raw_events, predictor)

    prev_by_round: Dict[str, Dict[str, Any]] = {}
    for pev in previous_events or []:
        rid = str(pev.get("round_id") or "")
        if rid and (pev.get("pairings") or []):
            prev_by_round[rid] = pev

    active_events: List[Dict[str, Any]] = []
    seen_round_ids = set()

    for ev in raw_events:
        rid = str(ev.get("round_id") or ev.get("round_name") or "")
        tc = str(ev.get("time_control") or "classical")
        pairings = ev.get("pairings") or []
        if not pairings:
            continue

        all_done = all(normalize_result(g.get("status")) is not None for g in pairings)
        if all_done and db is not None:
            continue

        prev_ev = prev_by_round.get(rid)
        prev_pred_map = (
            {_pair_key(pg): pg["prediction"] for pg in (prev_ev.get("pairings") or []) if pg.get("prediction")}
            if prev_ev
            else {}
        )

        out_pairings: List[Dict[str, Any]] = []
        for g in pairings:
            w, b = _pair_key(g)
            if not w or not b:
                continue
            pred_dict = None
            if db is not None:
                pred_dict = db.get_locked_prediction(rid, w, b)
            if pred_dict is None and (w, b) in prev_pred_map and normalize_result(g.get("status")) is not None:
                pred_dict = prev_pred_map[(w, b)]
            if pred_dict is None:
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
        ev_copy["pairings"] = out_pairings
        if all(normalize_result(g.get("status")) is not None for g in out_pairings):
            ev_copy["status"] = "finished"
        active_events.append(ev_copy)
        seen_round_ids.add(rid)

    finished_events: List[Dict[str, Any]] = []
    if db is not None:
        for fr in db.get_finished_rounds(predictor, limit=max_finished_history):
            if str(fr.get("round_id") or "") not in seen_round_ids:
                finished_events.append(fr)
    else:
        for pev in previous_events or []:
            rid = str(pev.get("round_id") or "")
            if rid not in seen_round_ids and pev.get("status") == "finished":
                finished_events.append(pev)

    if max_finished_history is not None and max_finished_history > 0:
        finished_events = finished_events[:max_finished_history]
    final_events = active_events + finished_events
    champ_fmt_by_tid = {
        str(c.get("tour_id") or ""): str(c.get("format") or "")
        for c in (championships or [])
        if c.get("tour_id") and c.get("format")
    }
    if champ_fmt_by_tid:
        for ev in final_events:
            tid = str(ev.get("tour_id") or "")
            if tid in champ_fmt_by_tid:
                ev["format"] = champ_fmt_by_tid[tid]

    summary = _compute_db_accuracy(final_events)

    return {
        "generated_at": dt.datetime.now(tz=dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model": {
            "n_games": predictor.metadata.get("n_games", 0),
            "n_players": predictor.metadata.get("n_players", 0),
            "date_max": predictor.metadata.get("date_max"),
        },
        "summary": summary,
        "events": final_events,
        "championships": championships or [],
    }


def build_championship_list(
    predictor: ChessPreMatchPredictor,
    db: Optional[ChessDatabase] = None,
    max_tours: int = 5,
    n_sims: int = 20000,
) -> List[Dict[str, Any]]:
    """Simulate active/recent Round-Robin tournaments using official schedules & tiebreaks."""
    tours_with_rounds = fetch_single_round_robin_tours(max_tours=max_tours)
    champ_list: List[Dict[str, Any]] = []

    for tour, rounds_out, tiebreaks, sched_src in tours_with_rounds:
        if db is not None:
            db.sync_events_and_lock_predictions(rounds_out, predictor)

        locked_map: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        if db is not None:
            for rd in rounds_out:
                rid = str(rd.get("round_id") or "")
                for g in rd.get("pairings") or []:
                    w, b = _pair_key(g)
                    pr = db.get_locked_prediction(rid, w, b)
                    if pr is not None:
                        locked_map[(rid, w, b)] = pr

        sim = simulate_fide_round_robin(
            tour=tour,
            rounds_data=rounds_out,
            predictor=predictor,
            locked_predictions=locked_map,
            tiebreaks=tiebreaks,
            schedule_source=sched_src,
            n_sims=n_sims,
        )
        if sim is None:
            continue
        champ_list.append(sim)
        if db is not None:
            db.save_rr_snapshot(
                tour_id=str(tour["tour_id"]),
                tour_name=str(tour["tour_name"]),
                tour_format=str(sim["format"]),
                as_of_round=f"{sim['rounds_played']}/{sim['total_rounds']}",
                snapshot=sim,
            )

    return champ_list


def export_schedule_json(
    model_path: Union[str, Path],
    output_path: Union[str, Path],
    limit: int = 16,
    db_path: Optional[Union[str, Path]] = None,
    include_championships: bool = False,
) -> Path:
    """Load local predictor artifact, sync DB, and write unified static chess.json."""
    mpath = Path(model_path)
    out = Path(output_path)
    predictor = ChessPreMatchPredictor.load(mpath) if mpath.exists() else ChessPreMatchPredictor()
    db = ChessDatabase(db_path) if db_path is not None else None

    champs = build_championship_list(predictor, db=db) if include_championships else []
    snapshot = build_schedule_snapshot(predictor, limit=limit, db=db, championships=champs)
    if not snapshot["events"] and out.exists():
        return out

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out
