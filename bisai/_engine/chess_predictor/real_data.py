"""Fetch real chess tournaments and real player games from public Lichess APIs."""

from __future__ import annotations

import concurrent.futures
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

USER_AGENT = "chess-prematch-predictor/0.1 (local research)"

DEFAULT_TOURNAMENT_QUERIES: Tuple[str, ...] = (
    "Tata Steel",
    "Candidates",
    "Norway Chess",
    "Norway Chess 2023",
    "Sinquefield",
    "Grand Swiss",
    "Grand Swiss 2023",
    "World Chess Championship",
    "Olympiad 2024",
    "Superbet",
    "Prague",
    "World Rapid 2021",
    "World Rapid 2022",
    "World Rapid",
    "World Blitz",
    "Biel",
)

DEFAULT_HISTORICAL_PLAYERS: Tuple[str, ...] = (
    "Kasparov",
    "Karpov",
    "Anand",
    "Kramnik",
    "Topalov",
    "Aronian",
    "Carlsen",
    "Caruana",
    "Nakamura",
    "Nepomniachtchi",
    "Ding",
    "Firouzja",
    "Giri",
    "So",
    "VachierLagrave",
    "Duda",
    "Grischuk",
    "Mamedyarov",
    "Radjabov",
    "Rapport",
    "Wei",
    "Praggnanandhaa",
)

DEFAULT_LICHESS_PLAYERS: Tuple[str, ...] = (
    "DrNykterstein",       # Magnus Carlsen
    "Hikaru",              # Hikaru Nakamura
    "Firouzja2003",        # Alireza Firouzja
    "FabianoCaruana",      # Fabiano Caruana
    "lachesisQ",           # Ian Nepomniachtchi
    "DanielNaroditsky",
    "nihalsarin",          # Nihal Sarin
    "AnishGiri",           # Anish Giri
    "LyonBeast",           # Maxime Vachier-Lagrave
    "Polish_fighter3000",  # Jan-Krzysztof Duda
)


def _http_get_text(
    url: str,
    accept: Optional[str] = None,
    timeout: int = 30,
    retries: int = 2,
) -> str:
    headers = {"User-Agent": USER_AGENT}
    if accept:
        headers["Accept"] = accept
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < retries:
                time.sleep(2.5 * (attempt + 1))
                continue
            raise
    return ""


def _safe_slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", text).strip("_")[:64] or "tournament"


def search_fide_broadcasts(
    queries: Sequence[str] = DEFAULT_TOURNAMENT_QUERIES,
    min_tier: int = 5,
    max_tournaments: int = 24,
    per_query: int = 2,
) -> List[Dict[str, object]]:
    """Discover diverse real FIDE / OTB tournaments via Lichess Broadcast search API."""
    seen: Dict[str, Dict[str, object]] = {}
    for q in queries:
        url = "https://lichess.org/api/broadcast/search?q=" + urllib.parse.quote(q)
        try:
            payload = json.loads(_http_get_text(url, accept="application/json", timeout=15))
        except Exception:
            continue
        added_this_q = 0
        for item in payload.get("currentPageResults", []):
            tour = item.get("tour", {})
            tid = tour.get("id")
            tier = int(tour.get("tier") or 0)
            if not tid or tid in seen or tier < min_tier:
                continue
            seen[tid] = {
                "id": tid,
                "name": tour.get("name", tid),
                "tier": tier,
                "dates": tour.get("dates"),
            }
            added_this_q += 1
            if len(seen) >= max_tournaments:
                return list(seen.values())
            if added_this_q >= per_query:
                break
    return list(seen.values())


def _download_one_broadcast(
    tour: Dict[str, object],
    out_dir: Path,
    force: bool,
) -> Optional[Path]:
    tid = str(tour["id"])
    slug = _safe_slug(str(tour["name"]))
    dest = out_dir / f"{tid}_{slug}.pgn"
    if dest.exists() and dest.stat().st_size > 200 and not force:
        return dest
    url = f"https://lichess.org/api/broadcast/{tid}.pgn"
    try:
        pgn_text = _http_get_text(url, accept="application/x-chess-pgn", timeout=25)
    except Exception:
        return None
    if not any(tag in pgn_text for tag in ('[Result "1-0"]', '[Result "0-1"]', '[Result "1/2-1/2"]')):
        return None
    dest.write_text(pgn_text, encoding="utf-8")
    return dest


def fetch_fide_broadcasts(
    output_dir: Path | str = "data/real_fide",
    queries: Sequence[str] = DEFAULT_TOURNAMENT_QUERIES,
    min_tier: int = 5,
    max_tournaments: int = 24,
    per_query: int = 2,
    force: bool = False,
) -> List[Path]:
    """Download real FIDE / OTB tournament PGNs concurrently into a local directory."""
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tours = search_fide_broadcasts(
        queries=queries,
        min_tier=min_tier,
        max_tournaments=max_tournaments,
        per_query=per_query,
    )

    saved_paths: List[Path] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_download_one_broadcast, tour, out_dir, force) for tour in tours]
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            if res is not None:
                saved_paths.append(res)

    manifest = out_dir / "_manifest.json"
    manifest.write_text(json.dumps(tours, indent=2, ensure_ascii=False), encoding="utf-8")
    return sorted(saved_paths)


def fetch_lichess_player_games(
    usernames: Iterable[str] = DEFAULT_LICHESS_PLAYERS,
    output_pgn: Path | str = "data/real_lichess/titled_players.pgn",
    max_per_player: int = 120,
    perf_types: str = "classical,rapid,blitz",
    pause_sec: float = 0.35,
) -> Path:
    """Download real rated games for specified Lichess players into a single local PGN."""
    dest = Path(output_pgn)
    dest.parent.mkdir(parents=True, exist_ok=True)

    chunks: List[str] = []
    for user in usernames:
        params = urllib.parse.urlencode(
            {
                "max": max_per_player,
                "rated": "true",
                "perfType": perf_types,
                "moves": "false",
                "clocks": "false",
                "evals": "false",
            }
        )
        url = f"https://lichess.org/api/games/user/{urllib.parse.quote(user)}?{params}"
        try:
            pgn_text = _http_get_text(url, accept="application/x-chess-pgn", timeout=25)
            if pgn_text.strip():
                chunks.append(pgn_text.strip())
        except Exception:
            continue
        if pause_sec > 0:
            time.sleep(pause_sec)

    if not chunks:
        raise RuntimeError("Failed to download any Lichess player games.")

    dest.write_text("\n\n".join(chunks) + "\n", encoding="utf-8")
    return dest


def _download_pgnmentor_player(player: str, out_dir: Path, force: bool) -> Optional[Path]:
    slug = _safe_slug(player)
    dest = out_dir / f"{slug}.pgn"
    if dest.exists() and dest.stat().st_size > 1000 and not force:
        return dest

    url = f"https://www.pgnmentor.com/players/{urllib.parse.quote(player)}.zip"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw_zip = resp.read()
        with zipfile.ZipFile(io.BytesIO(raw_zip)) as zf:
            pgn_names = [n for n in zf.namelist() if n.lower().endswith(".pgn")]
            if not pgn_names:
                return None
            content = zf.read(pgn_names[0]).decode("utf-8", errors="replace")
        dest.write_text(content, encoding="utf-8")
        return dest
    except Exception:
        return None


def fetch_pgnmentor_players(
    output_dir: Path | str = "data/real_historical",
    players: Sequence[str] = DEFAULT_HISTORICAL_PLAYERS,
    force: bool = False,
) -> List[Path]:
    """Download decades of real historical GM games from PGN Mentor archives."""
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    saved: List[Path] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(_download_pgnmentor_player, p, out_dir, force) for p in players]
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            if res is not None:
                saved.append(res)
    return sorted(saved)
