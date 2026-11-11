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
    limit: int = 12,
    with_pairings: bool = True,
    max_pairing_rounds: int = 12,
) -> List[Dict[str, Any]]:
    """
    Return recent, ongoing, and upcoming official tournament schedules from Lichess Broadcasts.
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

    # Prioritize higher-tier and active/upcoming events
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

    # Sort: ongoing first, then upcoming (nearest start time), then finished (latest first), weighted by tier
    def sort_key(it: Dict[str, Any]) -> Tuple[int, int, int]:
        st_rank = {"ongoing": 0, "upcoming": 1, "finished": 2}.get(it["status"], 3)
        tier_rank = -int(it["tier"])
        ts = int(it["starts_at_ms"] or 0)
        ts_rank = ts if it["status"] == "upcoming" else -ts
        return (st_rank, tier_rank, ts_rank)

    items.sort(key=sort_key)
    selected = items[:limit]

    if with_pairings and selected:
        targets = selected[:max_pairing_rounds]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            pair_list = list(pool.map(lambda it: _fetch_round_pairings(str(it["round_id"])), targets))
        for it, pairings in zip(targets, pair_list):
            if pairings:
                it["pairings"] = pairings
        selected = [it for it in selected if it["pairings"]] or selected

    _CACHE[cache_key] = (now, selected)
    return selected
