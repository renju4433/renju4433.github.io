from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass
class ReplayRow:
    room_code: str
    player_id: str
    event: str
    payload: dict[str, Any]
    state: dict[str, Any]


@dataclass
class TrainingSample:
    obs: np.ndarray
    token: str


def _stable_dumps(value: Any) -> str:
    if value is None or isinstance(value, (bool, int, float, str)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(_stable_dumps(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value.keys())
        parts = []
        for k in keys:
            parts.append(json.dumps(k, ensure_ascii=False) + ":" + _stable_dumps(value[k]))
        return "{" + ",".join(parts) + "}"
    return json.dumps(str(value), ensure_ascii=False)


def encode_raw_state(state: dict[str, Any], max_bytes: int = 8192) -> np.ndarray:
    raw = _stable_dumps(state).encode("utf-8")
    vec = np.zeros((max_bytes + 1,), dtype=np.float32)
    used = min(len(raw), max_bytes)
    vec[0] = float(used) / float(max_bytes)
    if used > 0:
        vec[1 : 1 + used] = np.frombuffer(raw[:used], dtype=np.uint8).astype(np.float32) / 255.0
    return vec


def _safe(value: Any) -> str:
    if value is None:
        return "none"
    return str(value).replace("|", "_").replace("=", "_").replace(" ", "_")


def _find_card_name_by_id(state: dict[str, Any], card_id: str | None) -> str:
    if not card_id:
        return "none"
    generals = state.get("generals", [])
    for g in generals:
        for c in g.get("hand", []):
            if c.get("id") == card_id:
                return str(c.get("name", "unknown_card"))
        for c in g.get("judgeZone", []):
            if c.get("id") == card_id:
                return str(c.get("name", "unknown_card"))
        equip = g.get("equip", {})
        if isinstance(equip, dict):
            for c in equip.values():
                if isinstance(c, dict) and c.get("id") == card_id:
                    return str(c.get("name", "unknown_card"))

    for c in state.get("deck", []):
        if c.get("id") == card_id:
            return str(c.get("name", "unknown_card"))
    for c in state.get("discard", []):
        if c.get("id") == card_id:
            return str(c.get("name", "unknown_card"))
    return "unknown_card"


def _target_mode(state: dict[str, Any], player_id: str, target_indices: Any) -> str:
    if not isinstance(target_indices, list) or len(target_indices) == 0:
        return "none"
    if len(target_indices) > 1:
        return "multi"
    idx = target_indices[0]
    if not isinstance(idx, int):
        return "unknown"
    generals = state.get("generals", [])
    if idx < 0 or idx >= len(generals):
        return "unknown"
    target = generals[idx]
    if target.get("playerId") == player_id:
        active_idx = int(state.get("activeGeneralIndex", -1))
        return "self" if active_idx == idx else "ally"
    return "enemy"


def _bucket_count(n: int) -> str:
    if n <= 0:
        return "0"
    if n == 1:
        return "1"
    if n == 2:
        return "2"
    if n == 3:
        return "3"
    return "4p"


def _join(parts: list[str]) -> str:
    return "|".join(_safe(p) for p in parts)


def action_to_token(state: dict[str, Any], player_id: str, event: str, payload: dict[str, Any]) -> str:
    p = payload or {}

    if event == "use_card":
        card_name = _find_card_name_by_id(state, p.get("cardId"))
        mode = _target_mode(state, player_id, p.get("targetIndices"))
        extra = p.get("extra") if isinstance(p.get("extra"), dict) else {}
        direction = extra.get("direction") if isinstance(extra, dict) else None
        as_skill = p.get("asSkill")
        return _join(
            [
                "use_card",
                f"card={card_name}",
                f"target={mode}",
                f"dir={direction if direction is not None else 'none'}",
                f"as={as_skill if as_skill is not None else 'none'}",
            ]
        )

    if event == "use_skill":
        skill_id = p.get("skillId", "unknown_skill")
        mode = _target_mode(state, player_id, p.get("targetIndices"))
        card_ids = p.get("cardIds")
        card_count = len(card_ids) if isinstance(card_ids, list) else 0
        return _join(
            [
                "use_skill",
                f"id={skill_id}",
                f"target={mode}",
                f"cards={_bucket_count(card_count)}",
            ]
        )

    if event == "respond":
        card_name = _find_card_name_by_id(state, p.get("cardId"))
        action = p.get("action", "none")
        return _join(["respond", f"card={card_name}", f"action={action}"])

    if event == "discard":
        card_ids = p.get("cardIds")
        count = len(card_ids) if isinstance(card_ids, list) else 0
        return _join(["discard", f"count={_bucket_count(count)}"])

    if event == "choose_action_unit":
        return _join(["choose_action_unit", f"unit={p.get('unit', 'unknown')}"])

    if event == "yield_choice":
        return _join(["yield_choice", f"yield={bool(p.get('yield'))}"])

    if event == "negate_respond":
        return _join(["negate_respond", f"play={'yes' if p.get('cardId') else 'no'}"])

    if event == "end_turn":
        return "end_turn"

    return _join(["unknown", f"event={event}"])


def load_replay_rows(replay_dir: Path) -> list[ReplayRow]:
    rows: list[ReplayRow] = []
    if not replay_dir.exists():
        return rows

    for file in sorted(replay_dir.glob("*.jsonl")):
        for line in file.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
                state = obj.get("state")
                payload = obj.get("payload") or {}
                if not isinstance(state, dict) or not isinstance(payload, dict):
                    continue
                rows.append(
                    ReplayRow(
                        room_code=str(obj.get("roomCode", "")),
                        player_id=str(obj.get("playerId", "")),
                        event=str(obj.get("event", "")),
                        payload=payload,
                        state=state,
                    )
                )
            except json.JSONDecodeError:
                continue
    return rows


def build_samples(rows: list[ReplayRow], max_bytes: int) -> list[TrainingSample]:
    allowed_events = {
        "use_card",
        "use_skill",
        "respond",
        "discard",
        "choose_action_unit",
        "yield_choice",
        "negate_respond",
        "end_turn",
    }
    samples: list[TrainingSample] = []
    for row in rows:
        if row.event not in allowed_events:
            continue
        token = action_to_token(row.state, row.player_id, row.event, row.payload)
        obs = encode_raw_state(row.state, max_bytes=max_bytes)
        samples.append(TrainingSample(obs=obs, token=token))
    return samples


def build_vocab(samples: list[TrainingSample], top_k: int = 512, min_count: int = 1) -> list[str]:
    counter = Counter(s.token for s in samples)
    filtered = [(tok, cnt) for tok, cnt in counter.items() if cnt >= min_count]
    filtered.sort(key=lambda x: (-x[1], x[0]))
    return [tok for tok, _ in filtered[:top_k]]

