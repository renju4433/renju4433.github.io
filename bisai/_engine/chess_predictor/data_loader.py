"""Load local PGN/CSV chess datasets and generate realistic demo data."""

from __future__ import annotations

import datetime as dt
import io
import math
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import chess.pgn
import numpy as np
import pandas as pd

from .ratings import DavidsonModel, normalize_time_control

LABEL_TO_NAME = {0: "white_win", 1: "draw", 2: "black_win"}
RESULT_TO_LABEL = {"1-0": 0, "1/2-1/2": 1, "0-1": 2}
LABEL_TO_WHITE_SCORE = {0: 1.0, 1: 0.5, 2: 0.0}


def parse_pgn_date(raw: Optional[str]) -> Optional[dt.date]:
    """Parse PGN or ISO date strings like '2025.04.12', '2025-04-12', '2025.??.??'."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text in {"?", "????.??.??", "nan", "None"}:
        return None
    cleaned = text.replace(".", "-").replace("/", "-")
    parts = cleaned.split("-")
    try:
        year = int(parts[0])
        month = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 6
        day = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 15
        month = max(1, min(12, month))
        day = max(1, min(28, day))
        return dt.date(year, month, day)
    except (ValueError, IndexError):
        return None


def parse_round_number(raw: Optional[str]) -> float:
    """Extract leading numeric round from strings like '5' or '5.2'."""
    if raw is None:
        return 0.0
    m = re.match(r"^\s*(\d+(?:\.\d+)?)", str(raw))
    return float(m.group(1)) if m else 0.0


def parse_elo(raw: object) -> float:
    """Parse an Elo field, returning NaN when missing or invalid."""
    if raw is None:
        return float("nan")
    text = str(raw).strip()
    if not text or text in {"?", "-", "nan", "None", "0"}:
        return float("nan")
    try:
        val = float(text)
        return val if 100.0 <= val <= 4000.0 else float("nan")
    except ValueError:
        return float("nan")


def normalize_result(raw: object) -> Optional[int]:
    """Normalize game result to label: 0=White win, 1=Draw, 2=Black win."""
    if raw is None:
        return None
    text = str(raw).strip().lower()
    if text in {"1-0", "w", "white", "white_win", "win_white", "1"}:
        return 0
    if text in {"1/2-1/2", "0.5-0.5", "0.5", "d", "draw", "tie"}:
        return 1
    if text in {"0-1", "b", "black", "black_win", "win_black", "0"}:
        return 2
    return None


def normalize_player_name(raw: object) -> str:
    """Normalize player names, converting FIDE 'Last, First' to 'First Last'."""
    text = re.sub(r"\s+", " ", str(raw or "").strip())
    if not text:
        return ""
    if "," in text:
        parts = [p.strip() for p in text.split(",", 1)]
        if parts[0] and parts[1]:
            # Keep South Indian initial style like "Gukesh, D" -> "Gukesh D"
            if len(parts[1].rstrip(".")) == 1 and parts[1].replace(".", "").isalpha():
                text = f"{parts[0]} {parts[1]}"
            else:
                text = f"{parts[1]} {parts[0]}"
    return re.sub(r"\s+", " ", text).strip()


def _unify_fide_aliases(df: pd.DataFrame) -> pd.DataFrame:
    """Unify name spelling variants (e.g. 'Erigaisi Arjun' vs 'Arjun Erigaisi') using FIDE IDs."""
    if "white_fide_id" not in df.columns or "black_fide_id" not in df.columns:
        return df

    counts: Dict[str, Dict[str, int]] = {}
    for col_name, col_id in [("white", "white_fide_id"), ("black", "black_fide_id")]:
        for name, fid in zip(df[col_name], df[col_id]):
            fid_str = str(fid or "").strip()
            if not fid_str or fid_str in {"?", "-", "nan", "None", "0"}:
                continue
            counts.setdefault(fid_str, {})
            counts[fid_str][name] = counts[fid_str].get(name, 0) + 1

    if not counts:
        return df

    canonical_by_fid = {
        fid: max(name_counts.items(), key=lambda kv: (kv[1], len(kv[0])))[0]
        for fid, name_counts in counts.items()
    }

    def map_col(names: pd.Series, fids: pd.Series) -> pd.Series:
        out = []
        for name, fid in zip(names, fids):
            fid_str = str(fid or "").strip()
            out.append(canonical_by_fid.get(fid_str, name))
        return pd.Series(out, index=names.index)

    df = df.copy()
    df["white"] = map_col(df["white"], df["white_fide_id"])
    df["black"] = map_col(df["black"], df["black_fide_id"])
    return df


def _norm_surname(text: str) -> str:
    return re.sub(r"[-'\s]+", " ", text.lower()).strip()


def _unify_initial_aliases(df: pd.DataFrame) -> pd.DataFrame:
    """Merge abbreviated names like 'Carlsen M' / 'Hi Nakamura' into canonical 'Magnus Carlsen' / 'Hikaru Nakamura'."""
    name_counts: Dict[str, int] = {}
    for col in ("white", "black"):
        for n in df[col]:
            name_counts[n] = name_counts.get(n, 0) + 1

    # Build (normalized_surname, first_initial) -> {full_name: count}
    full_buckets: Dict[Tuple[str, str], Dict[str, int]] = {}
    for name, cnt in name_counts.items():
        tokens = name.split()
        if len(tokens) < 2:
            continue
        if any(len(t.rstrip(".")) <= 2 for t in tokens):
            continue
        first = tokens[0].rstrip(".")
        surname = _norm_surname(" ".join(tokens[1:]))
        key = (surname, first[0].lower())
        full_buckets.setdefault(key, {})[name] = cnt

    canonical_by_key: Dict[Tuple[str, str], str] = {}
    for key, cand in full_buckets.items():
        total = sum(cand.values())
        best_name, best_cnt = max(cand.items(), key=lambda kv: kv[1])
        if best_cnt >= 5 and (best_cnt / max(1, total)) >= 0.85:
            canonical_by_key[key] = best_name

    # Match abbreviated forms (1-2 char first prefix, either "Hi Nakamura" or "Vachier Lagrave M")
    abbr_pairs: Dict[Tuple[str, str], Dict[str, int]] = {}
    alias_map: Dict[str, str] = {}
    for name, cnt in name_counts.items():
        tokens = name.split()
        if len(tokens) < 2:
            continue
        t_first = tokens[0].rstrip(".")
        t_last = tokens[-1].rstrip(".")
        if len(t_first) <= 2 and t_first.isalpha() and len(tokens[-1]) > 2:
            key = (_norm_surname(" ".join(tokens[1:])), t_first[0].lower())
            if key in canonical_by_key:
                target_first = canonical_by_key[key].split()[0].lower()
                if target_first.startswith(t_first.lower()):
                    alias_map[name] = canonical_by_key[key]
                    continue
            if len(t_first) == 1 and len(tokens) == 2:
                abbr_pairs.setdefault(key, {})[name] = cnt
        elif len(t_last) <= 2 and t_last.isalpha() and len(tokens[0]) > 2:
            key = (_norm_surname(" ".join(tokens[:-1])), t_last[0].lower())
            if key in canonical_by_key:
                target_first = canonical_by_key[key].split()[0].lower()
                if target_first.startswith(t_last.lower()):
                    alias_map[name] = canonical_by_key[key]
                    continue
            if len(t_last) == 1 and len(tokens) == 2:
                abbr_pairs.setdefault(key, {})[name] = cnt

    for key, variants in abbr_pairs.items():
        if key in canonical_by_key:
            target = canonical_by_key[key]
        else:
            target = max(
                variants.items(),
                key=lambda kv: (kv[1], 1 if len(kv[0].split()[1].rstrip(".")) == 1 else 0),
            )[0]
        for v in variants:
            if v != target:
                alias_map[v] = target

    if not alias_map:
        return df

    df = df.copy()
    df["white"] = df["white"].map(lambda x: alias_map.get(x, x))
    df["black"] = df["black"].map(lambda x: alias_map.get(x, x))
    return df


def _finalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Clean, enrich date/round ordering, deduplicate, and sort games chronologically."""
    if df.empty:
        raise ValueError("No valid finished chess games found in the dataset.")

    df = df.copy()
    df["white"] = df["white"].map(normalize_player_name)
    df["black"] = df["black"].map(normalize_player_name)
    df = _unify_fide_aliases(df)
    df = _unify_initial_aliases(df)
    df = df[(df["white"] != "") & (df["black"] != "") & (df["white"] != df["black"])].copy()

    df["time_control"] = df["time_control"].map(normalize_time_control)
    df["white_elo"] = df["white_elo"].map(parse_elo)
    df["black_elo"] = df["black_elo"].map(parse_elo)

    parsed_dates = df["date"].map(parse_pgn_date)
    fallback_date = dt.date(2000, 1, 1)
    df["date_obj"] = [d if d is not None else fallback_date for d in parsed_dates]
    df["date_ordinal"] = [d.toordinal() for d in df["date_obj"]]
    df["round_num"] = df["round"].map(parse_round_number)
    df["orig_idx"] = np.arange(len(df))
    df["white_score"] = df["label"].map(LABEL_TO_WHITE_SCORE)

    # Deduplicate overlapping tournament exports while preserving chronological order
    df = df.drop_duplicates(
        subset=["white", "black", "date_ordinal", "round_num", "label"],
        keep="first",
    )

    df = df.sort_values(["date_ordinal", "round_num", "orig_idx"], kind="mergesort").reset_index(
        drop=True
    )
    return df


def _read_pgn_rows(pgn_path: Path, max_games: Optional[int] = None) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    with pgn_path.open("r", encoding="utf-8", errors="replace") as f:
        while True:
            headers = chess.pgn.read_headers(f)
            if headers is None:
                break
            label = normalize_result(headers.get("Result"))
            if label is None:
                continue
            tc_raw = (
                headers.get("TimeControl")
                or headers.get("BroadcastName")
                or headers.get("Event")
            )
            rows.append(
                {
                    "white": headers.get("White", ""),
                    "black": headers.get("Black", ""),
                    "white_fide_id": headers.get("WhiteFideId"),
                    "black_fide_id": headers.get("BlackFideId"),
                    "white_elo": headers.get("WhiteElo"),
                    "black_elo": headers.get("BlackElo"),
                    "result": headers.get("Result"),
                    "label": label,
                    "date": headers.get("UTCDate") or headers.get("Date"),
                    "time_control": tc_raw,
                    "round": headers.get("Round", "0"),
                    "event": headers.get("BroadcastName") or headers.get("Event", ""),
                }
            )
            if max_games is not None and len(rows) >= max_games:
                break
    return rows


def load_pgn(path: Union[str, Path], max_games: Optional[int] = None) -> pd.DataFrame:
    """Load pre-match metadata from a local PGN file without parsing full move trees."""
    pgn_path = Path(path)
    if not pgn_path.exists():
        raise FileNotFoundError(f"PGN file not found: {pgn_path}")
    return _finalize_dataframe(pd.DataFrame(_read_pgn_rows(pgn_path, max_games=max_games)))


def load_csv(path: Union[str, Path], max_games: Optional[int] = None) -> pd.DataFrame:
    """Load pre-match metadata from a local CSV file with flexible column aliases."""
    csv_path = Path(path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    raw_df = pd.read_csv(csv_path, nrows=max_games)
    col_map = {c.strip().lower(): c for c in raw_df.columns}

    def pick(*aliases: str) -> Optional[pd.Series]:
        for alias in aliases:
            if alias in col_map:
                return raw_df[col_map[alias]]
        return None

    white_col = pick("white", "white_player", "white_name", "player_white")
    black_col = pick("black", "black_player", "black_name", "player_black")
    res_col = pick("result", "outcome", "target", "label")
    if white_col is None or black_col is None or res_col is None:
        raise ValueError(
            "CSV must contain white, black, and result/outcome columns. "
            f"Found columns: {list(raw_df.columns)}"
        )

    w_elo_col = pick("white_elo", "whiteelo", "w_elo", "white_rating")
    b_elo_col = pick("black_elo", "blackelo", "b_elo", "black_rating")
    date_col = pick("date", "utcdate", "game_date", "played_at")
    tc_col = pick("time_control", "timecontrol", "tc", "speed")
    round_col = pick("round", "round_num")
    event_col = pick("event", "tournament")

    rows: List[Dict[str, object]] = []
    for i in range(len(raw_df)):
        label = normalize_result(res_col.iloc[i])
        if label is None:
            continue
        rows.append(
            {
                "white": white_col.iloc[i],
                "black": black_col.iloc[i],
                "white_elo": w_elo_col.iloc[i] if w_elo_col is not None else None,
                "black_elo": b_elo_col.iloc[i] if b_elo_col is not None else None,
                "result": str(res_col.iloc[i]),
                "label": label,
                "date": date_col.iloc[i] if date_col is not None else None,
                "time_control": tc_col.iloc[i] if tc_col is not None else "classical",
                "round": round_col.iloc[i] if round_col is not None else "0",
                "event": event_col.iloc[i] if event_col is not None else "",
            }
        )

    return _finalize_dataframe(pd.DataFrame(rows))


def load_games(path: Union[str, Path], max_games: Optional[int] = None) -> pd.DataFrame:
    """Auto-detect a .pgn/.csv file or directory of PGN/CSV files and return a standardized DataFrame."""
    p = Path(path)
    if p.is_dir():
        files = sorted(
            [
                f
                for f in p.rglob("*")
                if f.is_file() and f.suffix.lower() in {".pgn", ".csv"}
            ]
        )
        if not files:
            raise FileNotFoundError(f"No .pgn or .csv files found in directory: {p}")
        frames = []
        for f in files:
            try:
                frames.append(load_games(f))
            except ValueError:
                continue
        if not frames:
            raise ValueError(f"No valid finished chess games found in directory: {p}")
        combined = pd.concat(frames, ignore_index=True)
        combined = _unify_fide_aliases(combined)
        combined = _unify_initial_aliases(combined)
        combined = combined.drop_duplicates(
            subset=["white", "black", "date_ordinal", "round_num", "label"],
            keep="first",
        )
        combined = combined.sort_values(
            ["date_ordinal", "round_num", "orig_idx"], kind="mergesort"
        ).reset_index(drop=True)
        if max_games is not None:
            combined = combined.iloc[:max_games].reset_index(drop=True)
        return combined

    suffix = p.suffix.lower()
    if suffix == ".pgn":
        return load_pgn(p, max_games=max_games)
    if suffix == ".csv":
        return load_csv(p, max_games=max_games)
    raise ValueError(f"Unsupported dataset format '{suffix}'. Expected .pgn, .csv, or directory.")


def generate_demo_dataset(
    output_path: Union[str, Path],
    n_games: int = 2400,
    n_players: int = 48,
    seed: int = 42,
) -> Path:
    """
    Generate a realistic local chess dataset (.csv or .pgn) for training and testing.

    Simulates player base ratings, gradual strength drift/form, White advantage,
    Elo- and time-control-dependent draw rates, and round-robin/Swiss pairings.
    """
    rng = np.random.default_rng(seed)
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    surnames = [
        "Carlsen", "Nakamura", "Caruana", "Nepomniachtchi", "Ding", "Firouzja",
        "Gukesh", "Praggnanandhaa", "Erigaisi", "Abdusattorov", "So", "Giri",
        "Vachier-Lagrave", "Aronian", "Duda", "Wei", "Keymer", "Rapport",
        "Mamedyarov", "Radjabov", "Grischuk", "Dominguez", "Vidit", "Maghsoodloo",
        "Niemann", "Sindarov", "Esipenko", "Sarana", "Sevian", "Robson",
        "Dubov", "Artemiev", "Fedoseev", "Van Foreest", "Shankland", "Xiong",
        "Yu", "Le", "harikrishna", "Navara", "Wojtaszek", "Deac",
        "Tabatabaei", "Sjugirov", "Bacrot", "Howell", "Jones", "Vitiugov",
    ]
    players = [f"{surnames[i % len(surnames)].title()}_{i // len(surnames) + 1}" if i >= len(surnames) else surnames[i].title() for i in range(n_players)]
    true_elo = rng.normal(loc=2580.0, scale=145.0, size=n_players).clip(2100.0, 2860.0)
    published_elo = true_elo + rng.normal(0.0, 12.0, size=n_players)
    # Player-specific drawishness & white/black stylistic tilt
    draw_style = rng.normal(0.0, 0.15, size=n_players)

    davidson = DavidsonModel()
    tc_choices = ["classical", "rapid", "blitz"]
    tc_probs = [0.45, 0.30, 0.25]
    tc_pgn_map = {"classical": "5400+30", "rapid": "900+10", "blitz": "180+2"}

    start_date = dt.date(2023, 1, 1)
    records: List[Dict[str, object]] = []

    for g in range(n_games):
        day_offset = int(g * (900.0 / max(1, n_games)))
        game_date = start_date + dt.timedelta(days=day_offset)

        # Pair players somewhat closer in rating (tournament Swiss-like pairing)
        i = int(rng.integers(0, n_players))
        diffs = np.abs(true_elo - true_elo[i]) + rng.uniform(20.0, 220.0, size=n_players)
        diffs[i] = 1e9
        weights = np.exp(-diffs / 160.0)
        weights[i] = 0.0
        weights /= weights.sum()
        j = int(rng.choice(n_players, p=weights))

        tc = str(rng.choice(tc_choices, p=tc_probs))
        # Subtle form fluctuation over time
        form_i = 18.0 * math.sin(2.0 * math.pi * (day_offset / 120.0) + i)
        form_j = 18.0 * math.sin(2.0 * math.pi * (day_offset / 120.0) + j)

        p_w, p_d, p_b = davidson.predict_proba_single(
            true_elo[i] + form_i,
            true_elo[j] + form_j,
            time_control=tc,
        )
        # Apply mild player draw style adjustment
        style_shift = 0.5 * (draw_style[i] + draw_style[j])
        p_d_adj = float(np.clip(p_d * math.exp(style_shift), 0.04, 0.82))
        rem = 1.0 - p_d_adj
        decisive = max(1e-9, p_w + p_b)
        probs = np.array([rem * (p_w / decisive), p_d_adj, rem * (p_b / decisive)])
        probs /= probs.sum()

        label = int(rng.choice([0, 1, 2], p=probs))
        result_str = {0: "1-0", 1: "1/2-1/2", 2: "0-1"}[label]

        w_elo_rep = round(float(published_elo[i]))
        b_elo_rep = round(float(published_elo[j]))

        # Slowly drift ratings based on game outcome
        score_i = {0: 1.0, 1: 0.5, 2: 0.0}[label]
        exp_i = p_w + 0.5 * p_d
        published_elo[i] += 10.0 * (score_i - exp_i)
        published_elo[j] += 10.0 * ((1.0 - score_i) - (1.0 - exp_i))
        true_elo[i] += rng.normal(0.0, 1.5)
        true_elo[j] += rng.normal(0.0, 1.5)

        records.append(
            {
                "Event": f"Local Open {game_date.year}",
                "Date": game_date.strftime("%Y.%m.%d"),
                "Round": str((g % 9) + 1),
                "White": players[i],
                "Black": players[j],
                "Result": result_str,
                "WhiteElo": w_elo_rep,
                "BlackElo": b_elo_rep,
                "TimeControl": tc_pgn_map[tc] if out.suffix.lower() == ".pgn" else tc,
            }
        )

    if out.suffix.lower() == ".pgn":
        buf = io.StringIO()
        for r in records:
            for k in ["Event", "Date", "Round", "White", "Black", "Result", "WhiteElo", "BlackElo", "TimeControl"]:
                buf.write(f'[{k} "{r[k]}"]\n')
            buf.write(f'\n1. e4 e5 {r["Result"]}\n\n')
        out.write_text(buf.getvalue(), encoding="utf-8")
    else:
        pd.DataFrame(records).to_csv(out, index=False, encoding="utf-8")

    return out
