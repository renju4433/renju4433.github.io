"""Fetch complete pre-drawn schedules and official tiebreak rules from chess-results.com."""

from __future__ import annotations

import datetime as dt
import re
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

from .data_loader import normalize_player_name, normalize_result, parse_elo

USER_AGENT = "Mozilla/5.0 (compatible; chess-prematch-predictor/0.1)"

TIEBREAK_LABELS = {
    "de": "直胜(DE)",
    "sb": "索伯分(SB)",
    "wins": "胜局数",
    "koya": "科亚分(Koya)",
    "black_games": "执黑局数",
}


def _fetch_html(url: str, timeout: int = 15) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def normalize_chess_results_base(url: Optional[str]) -> Optional[str]:
    """Extract canonical 'https://sX.chess-results.com/tnrNNNNN.aspx' base URL."""
    if not url:
        return None
    m = re.search(r"(https?://[^/]*chess-results\.com/tnr\d+\.aspx)", str(url), re.IGNORECASE)
    return m.group(1) if m else None


def parse_chess_results_tiebreaks(html: str) -> List[str]:
    """Parse 'Tie Break1..N' annotation lines from chess-results art=1 HTML."""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text("\n", strip=True)
    rules: List[str] = []

    for line in text.splitlines():
        if not re.match(r"^\s*Tie\s*Break\s*\d+\s*:", line, re.IGNORECASE):
            continue
        low = line.lower()
        code: Optional[str] = None
        if "direct encounter" in low or "(de)" in low:
            code = "de"
        elif "sonneborn" in low:
            code = "sb"
        elif "number of wins" in low or "victories" in low or "(win)" in low:
            code = "wins"
        elif "koya" in low:
            code = "koya"
        elif "black" in low:
            code = "black_games"
        if code and code not in rules:
            rules.append(code)

    return rules or ["de", "sb", "wins", "black_games"]


def _parse_cr_round_banner(text: str) -> Tuple[str, Optional[str], int]:
    """Parse banner like 'Round 1 on 2026/11/11 at 16:00' or 'Round 1 on 2026/11/01 at 3:00PM'."""
    m = re.match(
        r"^(Round\s+\d+|[\d.]+\s*Rodada|\S+\s+\d+)\s+on\s+(\d{4}/\d{2}/\d{2})(?:\s+at\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?))?",
        text.strip(),
        re.IGNORECASE,
    )
    if not m:
        return text.strip(), None, 0

    rname = m.group(1).strip()
    date_part = m.group(2).replace("/", "-")
    time_part = (m.group(3) or "12:00").strip().upper()
    try:
        if "AM" in time_part or "PM" in time_part:
            t_obj = dt.datetime.strptime(f"{date_part} {time_part}", "%Y-%m-%d %I:%M%p")
        else:
            t_obj = dt.datetime.strptime(f"{date_part} {time_part}", "%Y-%m-%d %H:%M")
        t_obj = t_obj.replace(tzinfo=dt.timezone.utc)
        return rname, t_obj.strftime("%Y-%m-%d %H:%M UTC"), int(t_obj.timestamp() * 1000)
    except ValueError:
        return rname, f"{date_part} 00:00 UTC", 0


def _map_cr_result(raw: str) -> str:
    cleaned = raw.replace("\xa0", " ").strip()
    if not cleaned:
        return "*"
    low = cleaned.lower().replace(" ", "")
    if low in {"1-0", "+--", "1:0"}:
        return "1-0"
    if low in {"0-1", "--+", "0:1"}:
        return "0-1"
    if "½" in low or "1/2" in low or "0.5" in low:
        return "1/2-1/2"
    lbl = normalize_result(cleaned)
    if lbl is not None:
        return {0: "1-0", 1: "1/2-1/2", 2: "0-1"}[lbl]
    return "*"


def parse_chess_results_schedule(
    html: str,
    tour_meta: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Parse all pre-drawn rounds and pairings from chess-results art=2&turdet=YES HTML."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table.CRs1")
    if table is None:
        return []

    tour_id = str(tour_meta.get("tour_id") or "")
    tour_name = str(tour_meta.get("tour_name") or "")
    tier = int(tour_meta.get("tier") or 0)
    fmt = str(tour_meta.get("format") or "")
    tc = str(tour_meta.get("time_control") or "classical")

    rounds: List[Dict[str, Any]] = []
    cur_round: Optional[Dict[str, Any]] = None
    col_idx: Dict[str, int] = {}

    for tr in table.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all(["td", "th"])]
        if not cells:
            continue

        joined = " ".join(cells).strip()
        if len(cells) <= 3 and re.search(r"\bon\s+\d{4}/\d{2}/\d{2}\b", joined):
            rname, starts_at, starts_ms = _parse_cr_round_banner(joined)
            rid = f"cr_{tour_id}_{re.sub(r'[^a-zA-Z0-9]+', '_', rname).strip('_').lower()}"
            cur_round = {
                "tour_id": tour_id,
                "tour_name": tour_name,
                "tier": tier,
                "format": fmt,
                "round_id": rid,
                "round_name": rname,
                "status": "upcoming",
                "starts_at": starts_at,
                "starts_at_ms": starts_ms,
                "time_control": tc,
                "pairings": [],
            }
            rounds.append(cur_round)
            continue

        if "White" in cells and "Black" in cells:
            w_idx = cells.index("White")
            b_idx = cells.index("Black")
            res_idx = cells.index("Result") if "Result" in cells else w_idx + 1
            rtg_indices = [i for i, c in enumerate(cells) if c == "Rtg"]
            w_rtg = next((i for i in rtg_indices if i < w_idx), None)
            b_rtg = next((i for i in rtg_indices if i > b_idx), None)
            col_idx = {
                "white": w_idx,
                "black": b_idx,
                "result": res_idx,
                "w_rtg": w_rtg if w_rtg is not None else -1,
                "b_rtg": b_rtg if b_rtg is not None else -1,
            }
            continue

        if cur_round is None or not col_idx:
            continue
        if max(col_idx["white"], col_idx["black"], col_idx["result"]) >= len(cells):
            continue

        white = normalize_player_name(cells[col_idx["white"]])
        black = normalize_player_name(cells[col_idx["black"]])
        if not white or not black or white == black:
            continue
        if white.lower() in {"bye", "free"} or black.lower() in {"bye", "free"}:
            continue

        w_elo = parse_elo(cells[col_idx["w_rtg"]]) if col_idx["w_rtg"] >= 0 else float("nan")
        b_elo = parse_elo(cells[col_idx["b_rtg"]]) if col_idx["b_rtg"] >= 0 else float("nan")
        status = _map_cr_result(cells[col_idx["result"]])

        cur_round["pairings"].append(
            {
                "white": white,
                "white_elo": None if (w_elo != w_elo) else int(round(w_elo)),
                "black": black,
                "black_elo": None if (b_elo != b_elo) else int(round(b_elo)),
                "status": status,
            }
        )

    out_rounds: List[Dict[str, Any]] = []
    for r in rounds:
        ps = r["pairings"]
        if not ps:
            continue
        done_cnt = sum(1 for g in ps if g["status"] != "*")
        if done_cnt == len(ps):
            r["status"] = "finished"
        elif done_cnt > 0:
            r["status"] = "ongoing"
        else:
            r["status"] = "upcoming"
        out_rounds.append(r)

    return out_rounds


def fetch_chess_results_tournament(
    standings_url: Optional[str],
    tour_meta: Dict[str, Any],
) -> Optional[Tuple[List[str], List[Dict[str, Any]]]]:
    """Fetch official tiebreaks (art=1) and complete schedule (art=2) from chess-results.com."""
    base = normalize_chess_results_base(standings_url)
    if not base:
        return None
    try:
        html_tb = _fetch_html(f"{base}?lan=1&art=1&turdet=YES", timeout=15)
        html_sched = _fetch_html(f"{base}?lan=1&art=2&turdet=YES", timeout=15)
    except Exception:
        return None

    tiebreaks = parse_chess_results_tiebreaks(html_tb)
    rounds = parse_chess_results_schedule(html_sched, tour_meta)
    if not rounds:
        return None
    return tiebreaks, rounds
