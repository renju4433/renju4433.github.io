"""Fetch recent and upcoming chess tournament schedules and pairings via Lichess Broadcasts."""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import json
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from .data_loader import normalize_player_name
from .ratings import normalize_time_control

USER_AGENT = "chess-prematch-predictor/0.1 (local research)"
_CACHE: Dict[Tuple[int, bool], Tuple[float, List[Dict[str, Any]]]] = {}
_CACHE_TTL_SEC = 120.0


def _get_json(url: str, timeout: int = 12, retries: int = 2) -> Any:
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < retries:
                time.sleep(2.5 * (attempt + 1))
                continue
            raise
    return {}


def _ms_to_iso(ms: Optional[int]) -> Optional[str]:
    if not ms:
        return None
    return dt.datetime.fromtimestamp(ms / 1000.0, tz=dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _infer_tc_from_tour_name(name: str) -> str:
    low = name.lower()
    if "bullet" in low:
        return "bullet"
    if "blitz" in low:
        return "blitz"
    if "rapid" in low:
        return "rapid"
    return normalize_time_control(name)


def _fetch_round_pairings(round_id: str) -> List[Dict[str, Any]]:
    try:
        payload = _get_json(f"https://lichess.org/api/broadcast/-/-/{round_id}", timeout=10)
    except Exception:
        return []

    pairings: List[Dict[str, Any]] = []
    for g in payload.get("games", []):
        players = g.get("players") or []
        if len(players) < 2:
            continue
        w, b = players[0], players[1]
        pairings.append(
            {
                "white": normalize_player_name(w.get("name", "")),
                "white_elo": w.get("rating"),
                "white_title": w.get("title"),
                "black": normalize_player_name(b.get("name", "")),
                "black_elo": b.get("rating"),
                "black_title": b.get("title"),
                "status": g.get("status", "*"),
            }
        )
    return pairings


def fetch_recent_schedule(
    limit: int = 16,
    with_pairings: bool = True,
    max_pairing_rounds: int = 16,
    include_finished: int = 8,
) -> List[Dict[str, Any]]:
    """
    Return recent, ongoing, upcoming, and finished official tournament schedules from Lichess Broadcasts.
    """
    cache_key = (limit, with_pairings)
    now = time.time()
    if cache_key in _CACHE:
        ts, cached = _CACHE[cache_key]
        if now - ts < _CACHE_TTL_SEC:
            return cached

    items: List[Dict[str, Any]] = []
    seen_rounds = set()

    try:
        top = _get_json("https://lichess.org/api/broadcast/top?page=1", timeout=12)
        raw_entries = top.get("active", []) + top.get("past", {}).get("currentPageResults", [])
    except Exception:
        raw_entries = []

    for entry in raw_entries:
        tour = entry.get("tour") or {}
        rnd = entry.get("round") or {}
        rid = rnd.get("id")
        if not rid or rid in seen_rounds:
            continue
        seen_rounds.add(rid)

        tier = int(tour.get("tier") or 0)
        ongoing = bool(rnd.get("ongoing"))
        finished = bool(rnd.get("finished"))
        status = "ongoing" if ongoing else ("finished" if finished else "upcoming")
        tour_name = str(tour.get("name") or "")

        items.append(
            {
                "tour_id": tour.get("id"),
                "tour_name": tour_name,
                "tier": tier,
                "format": str((tour.get("info") or {}).get("format") or ""),
                "round_id": rid,
                "round_name": str(rnd.get("name") or ""),
                "status": status,
                "starts_at": _ms_to_iso(rnd.get("startsAt")),
                "starts_at_ms": rnd.get("startsAt") or 0,
                "time_control": _infer_tc_from_tour_name(tour_name),
                "url": rnd.get("url") or tour.get("url"),
                "pairings": [],
            }
        )

    def sort_key(it: Dict[str, Any]) -> Tuple[int, int, int]:
        st_rank = {"ongoing": 0, "upcoming": 1, "finished": 2}.get(it["status"], 3)
        tier_rank = -int(it["tier"])
        ts = int(it["starts_at_ms"] or 0)
        ts_rank = ts if it["status"] == "upcoming" else -ts
        return (st_rank, tier_rank, ts_rank)

    items.sort(key=sort_key)

    # Guarantee a balanced mix of active/upcoming and recently finished rounds
    active_items = [it for it in items if it["status"] in {"ongoing", "upcoming"}]
    finished_items = [it for it in items if it["status"] == "finished"]
    n_fin = min(len(finished_items), include_finished)
    n_act = max(0, limit - n_fin)
    selected = active_items[:n_act] + finished_items[:n_fin]
    if len(selected) < limit:
        used = {it["round_id"] for it in selected}
        for it in items:
            if it["round_id"] not in used:
                selected.append(it)
            if len(selected) >= limit:
                break

    if with_pairings and selected:
        targets = selected[:max_pairing_rounds]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            pair_list = list(pool.map(lambda it: _fetch_round_pairings(str(it["round_id"])), targets))
        for it, pairings in zip(targets, pair_list):
            if pairings:
                it["pairings"] = pairings
                if all(str(g.get("status") or "*") in {"1-0", "0-1", "1/2-1/2", "½-½"} for g in pairings):
                    it["status"] = "finished"
        selected = [it for it in selected if it["pairings"]] or selected

    _CACHE[cache_key] = (now, selected)
    return selected


def fetch_single_round_robin_tours(
    max_tours: int = 5,
) -> List[Tuple[Dict[str, Any], List[Dict[str, Any]], List[str], str]]:
    """
    Discover active/recent Round-Robin tournaments.
    Prefer complete official schedules & tiebreak rules from chess-results.com;
    fall back to Lichess Broadcast rounds + FIDE Berger completion when absent.
    """
    from .chess_results import fetch_chess_results_tournament
    from .round_robin import is_single_round_robin

    try:
        top = _get_json("https://lichess.org/api/broadcast/top?page=1", timeout=12)
        raw_entries = top.get("active", []) + top.get("past", {}).get("currentPageResults", [])
    except Exception:
        return []

    candidates: List[Dict[str, Any]] = []
    seen_tours = set()
    for entry in raw_entries:
        tour = entry.get("tour") or {}
        tid = tour.get("id")
        if not tid or tid in seen_tours:
            continue
        info = tour.get("info") or {}
        fmt = str(info.get("format") or "")
        standings_url = str(info.get("standings") or "")
        # Include single RR, plus official chess-results double RR (like Salamanca)
        is_srr = is_single_round_robin(fmt)
        is_indiv_rr = ("round-robin" in fmt.lower() or "round robin" in fmt.lower()) and "team" not in fmt.lower()
        if not (is_srr or (is_indiv_rr and "chess-results.com" in standings_url.lower())):
            continue
        seen_tours.add(tid)
        rnd = entry.get("round") or {}
        is_active = bool(rnd.get("ongoing")) or (not bool(rnd.get("finished")))
        candidates.append(
            {
                "tour_id": tid,
                "tour_name": str(tour.get("name") or tid),
                "tier": int(tour.get("tier") or 0),
                "format": fmt,
                "standings_url": standings_url,
                "time_control": _infer_tc_from_tour_name(str(tour.get("name") or "")),
                "is_active": is_active,
            }
        )

    candidates.sort(key=lambda t: (0 if t["is_active"] else 1, -t["tier"]))
    now_ms = int(time.time() * 1000)
    results: List[Tuple[Dict[str, Any], List[Dict[str, Any]], List[str], str]] = []

    for tour in candidates[:max_tours]:
        # 1. Try complete official schedule & tiebreaks from chess-results.com
        cr = fetch_chess_results_tournament(tour.get("standings_url"), tour)
        if cr is not None:
            tiebreaks, rounds_cr = cr
            results.append((tour, rounds_cr, tiebreaks, "official_chess_results"))
            continue

        # 2. Fallback: fetch Lichess rounds (skip far-future empty rounds)
        tid = tour["tour_id"]
        try:
            detail = _get_json(f"https://lichess.org/api/broadcast/{tid}", timeout=12)
        except Exception:
            continue
        rounds_meta = detail.get("rounds") or []
        rounds_out: List[Dict[str, Any]] = []
        for r in rounds_meta:
            rid = r.get("id")
            if not rid:
                continue
            starts_ms = int(r.get("startsAt") or 0)
            if not r.get("finished") and not r.get("ongoing") and starts_ms > now_ms + 36 * 3600 * 1000:
                continue
            time.sleep(0.12)
            pairings = _fetch_round_pairings(str(rid))
            rounds_out.append(
                {
                    "tour_id": tid,
                    "tour_name": tour["tour_name"],
                    "tier": tour["tier"],
                    "format": tour["format"],
                    "round_id": str(rid),
                    "round_name": str(r.get("name") or ""),
                    "status": "ongoing" if r.get("ongoing") else ("finished" if r.get("finished") else "upcoming"),
                    "starts_at": _ms_to_iso(r.get("startsAt")),
                    "starts_at_ms": starts_ms,
                    "time_control": tour["time_control"],
                    "pairings": pairings,
                }
            )
        if any(r["pairings"] for r in rounds_out):
            results.append((tour, rounds_out, ["de", "sb", "wins", "black_games"], "fide_berger"))
    return results
