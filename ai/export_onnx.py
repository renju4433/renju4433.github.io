from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch

from rlcard_sgs3v3.model import PolicyMLP


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export SGS 3v3 policy checkpoint to ONNX")
    p.add_argument("--artifacts-dir", type=Path, default=Path("ai/artifacts"))
    p.add_argument("--opset", type=int, default=17)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    config_path = args.artifacts_dir / "policy_config.json"
    ckpt_path = args.artifacts_dir / "sgs3v3_policy.pt"
    onnx_path = args.artifacts_dir / "sgs3v3_policy.onnx"

    if not config_path.exists():
        raise SystemExit(f"Missing config: {config_path}")
    if not ckpt_path.exists():
        raise SystemExit(f"Missing checkpoint: {ckpt_path}")

    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    model = PolicyMLP(
        input_dim=int(cfg["input_dim"]),
        output_dim=int(cfg["num_actions"]),
        hidden_sizes=[int(x) for x in cfg["hidden_sizes"]],
    )
    state_dict = torch.load(ckpt_path, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()

    dummy = torch.zeros((1, int(cfg["input_dim"])), dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        onnx_path.as_posix(),
        input_names=["obs"],
        output_names=["q_values"],
        opset_version=args.opset,
        do_constant_folding=True,
    )
    print(f"Exported ONNX: {onnx_path}")


if __name__ == "__main__":
    main()

