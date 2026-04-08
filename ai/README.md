# SGS 3v3 AI Pipeline (RLCard + ONNX)

这个目录用于训练并导出可在 Web 端使用的 AI 模型，目标是：

1. 采集服务端“原始局面信息”（完整 `GameState`，不脱敏不裁剪）。
2. 使用 `rlcard` 训练策略网络。
3. 导出 ONNX，让后端/前端可直接推理。

## 1) 数据采集

服务端已内置 replay 记录器。默认会在对局动作成功后把以下内容写入：

- `state`：动作前完整原始 `GameState`
- `event`：协议动作名（`use_card` / `respond` / ...）
- `payload`：动作原始 payload

输出目录默认：`ai/replays/*.jsonl`

可通过环境变量控制：

- `AI_REPLAY_ENABLED=0` 关闭采集
- `AI_REPLAY_DIR=...` 指定 replay 目录

## 2) 安装 Python 依赖

```bash
python -m pip install -r ai/requirements.txt
```

## 3) 训练

```bash
python ai/train_rlcard.py
```

常用参数：

- `--replay-dir ai/replays`
- `--artifacts-dir ai/artifacts`
- `--max-bytes 8192` 原始 JSON 编码长度
- `--epochs 8`

训练产物：

- `ai/artifacts/sgs3v3_policy.pt`
- `ai/artifacts/action_vocab.json`
- `ai/artifacts/policy_config.json`

## 4) 导出 ONNX

```bash
python ai/export_onnx.py
```

导出文件：

- `ai/artifacts/sgs3v3_policy.onnx`

## 5) Web/Server 使用

服务端已支持 `ai_suggest` 事件：

- 如果检测到 ONNX + vocab，会走模型打分。
- 否则自动回退到规则策略（不会中断功能）。

可选环境变量：

- `AI_ONNX_PATH=ai/artifacts/sgs3v3_policy.onnx`
- `AI_ACTION_VOCAB_PATH=ai/artifacts/action_vocab.json`

## 6) “原始局面原封不动”说明

输入编码采用“稳定序列化 + 字节向量”：

- 不做字段挑选，不删减对象结构。
- 对完整状态 JSON 进行稳定排序序列化。
- 直接把 UTF-8 字节映射为固定长度向量（长度不足补零，超长截断）。

这样可以尽量保证原始信息被完整传入模型。

