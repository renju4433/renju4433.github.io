from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from rlcard.utils import set_seed
from torch import nn
from torch.utils.data import DataLoader, Dataset

from rlcard_sgs3v3.codec import build_samples, build_vocab, load_replay_rows
from rlcard_sgs3v3.model import PolicyMLP


class ReplayDataset(Dataset):
    def __init__(self, obs: np.ndarray, labels: np.ndarray) -> None:
        self.obs = torch.from_numpy(obs).float()
        self.labels = torch.from_numpy(labels).long()

    def __len__(self) -> int:
        return self.obs.shape[0]

    def __getitem__(self, idx: int):
        return self.obs[idx], self.labels[idx]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train SGS 3v3 policy model from raw replays (RLCard pipeline).")
    p.add_argument("--replay-dir", type=Path, default=Path("ai/replays"))
    p.add_argument("--artifacts-dir", type=Path, default=Path("ai/artifacts"))
    p.add_argument("--max-bytes", type=int, default=8192)
    p.add_argument("--epochs", type=int, default=8)
    p.add_argument("--batch-size", type=int, default=128)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--hidden", type=int, nargs="+", default=[1024, 512, 256])
    p.add_argument("--top-k", type=int, default=512)
    p.add_argument("--min-count", type=int, default=1)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    args.artifacts_dir.mkdir(parents=True, exist_ok=True)

    rows = load_replay_rows(args.replay_dir)
    if not rows:
        raise SystemExit(f"No replay rows found under {args.replay_dir}")

    samples = build_samples(rows, max_bytes=args.max_bytes)
    if not samples:
        raise SystemExit("Replay rows exist, but no trainable action samples were produced.")

    vocab = build_vocab(samples, top_k=args.top_k, min_count=args.min_count)
    if not vocab:
        raise SystemExit("No action tokens in vocab.")

    token_to_idx = {tok: i for i, tok in enumerate(vocab)}
    filtered = [s for s in samples if s.token in token_to_idx]
    if not filtered:
        raise SystemExit("No samples left after vocab filtering.")

    obs = np.stack([s.obs for s in filtered]).astype(np.float32)
    labels = np.array([token_to_idx[s.token] for s in filtered], dtype=np.int64)

    dataset = ReplayDataset(obs=obs, labels=labels)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, drop_last=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = PolicyMLP(
        input_dim=obs.shape[1],
        output_dim=len(vocab),
        hidden_sizes=args.hidden,
    ).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    criterion = nn.CrossEntropyLoss()

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss = 0.0
        total = 0
        correct = 0

        for batch_obs, batch_labels in loader:
            batch_obs = batch_obs.to(device)
            batch_labels = batch_labels.to(device)

            logits = model(batch_obs)
            loss = criterion(logits, batch_labels)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += float(loss.item()) * batch_obs.shape[0]
            total += batch_obs.shape[0]
            pred = torch.argmax(logits, dim=1)
            correct += int((pred == batch_labels).sum().item())

        avg_loss = total_loss / max(total, 1)
        acc = correct / max(total, 1)
        print(f"[epoch {epoch:02d}] loss={avg_loss:.4f} acc={acc:.4f}")

    ckpt_path = args.artifacts_dir / "sgs3v3_policy.pt"
    torch.save(model.state_dict(), ckpt_path)

    config = {
        "input_dim": int(obs.shape[1]),
        "num_actions": int(len(vocab)),
        "hidden_sizes": list(map(int, args.hidden)),
        "max_bytes": int(args.max_bytes),
        "seed": int(args.seed),
        "engine": "rlcard+torch",
    }
    (args.artifacts_dir / "policy_config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    (args.artifacts_dir / "action_vocab.json").write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Saved checkpoint: {ckpt_path}")
    print(f"Saved vocab: {args.artifacts_dir / 'action_vocab.json'}")
    print(f"Saved config: {args.artifacts_dir / 'policy_config.json'}")
    print("Next step: python ai/export_onnx.py")


if __name__ == "__main__":
    main()

