# -*- coding: utf-8 -*-
"""基于 data/duiju.db 使用 Glicko-1 与 6 特征（含时限）训练 LightGBM GBDT 模型并导出 JSON。

特征 (6 维):
  [rule, rating_tb, rating_tw, rating_diff, base_time, increment]
类别映射 (与 predict_api.py 一致):
  0: 白胜 (W), 1: 和棋 (D), 2: 黑胜 (B)
"""

import argparse
import csv
import json
import math
import os
import time
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, log_loss

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(ROOT, "data", "duiju.db")
DEFAULT_CSV_PATH = os.path.join(ROOT, "data", "all_games.csv")
MODEL_DIR = os.path.join(ROOT, "model")
API_DIR = os.path.join(ROOT, "api")
NON_FORBIDDEN_RULES = (7, 11, 15, 28)
SHANHAI_DAY = 20771

Q = math.log(10.0) / 400.0
Q2 = Q * Q
THREE_Q2_OVER_PI2 = 3.0 * Q2 / (math.pi * math.pi)
INIT_RATING = 2000.0
INIT_RD = 350.0
MIN_RD = 30.0
MAX_RD = 350.0
C2_PER_DAY = 100.0


def load_training_games(source_path=DEFAULT_DB_PATH, max_day_exclusive=SHANHAI_DAY):
    games = []
    if str(source_path).endswith(".db"):
        import sqlite3
        conn = sqlite3.connect(source_path)
        sql = """
            SELECT id, tournament_id, round, day, rule, base_time, increment,
                   black_id, black_name, white_id, white_name, result
            FROM games
            WHERE result IN ('B', 'W', 'D') AND day > 0
              AND (rule IS NULL OR rule NOT IN (7, 11, 15, 28))
        """
        params = []
        if max_day_exclusive is not None:
            sql += " AND day < ?"
            params.append(max_day_exclusive)
        for idx, b_id_raw, bn, w_id_raw, wn, tid, rnd, day, rule, bt, inc, res in [
            (r[0], r[7], r[8], r[9], r[10], r[1], r[2], r[3], r[4], r[5], r[6], r[11])
            for r in conn.execute(sql, params)
        ]:
            b_id = b_id_raw or bn or ""
            w_id = w_id_raw or wn or ""
            if not b_id or not w_id or b_id == w_id:
                continue
            games.append({
                "idx": idx, "tid": tid or "",
                "rnd": int(rnd or 0), "day": int(day), "rule": int(rule or 0),
                "base_time": float(bt) if bt is not None else np.nan,
                "increment": float(inc) if inc is not None else np.nan,
                "b_id": b_id, "w_id": w_id, "res": res,
            })
        conn.close()
    else:
        with open(source_path, "r", encoding="utf-8", newline="") as f:
            for idx, row in enumerate(csv.DictReader(f)):
                res = row.get("result", "")
                if res not in ("B", "W", "D"):
                    continue
                b_id = row.get("black_id") or row.get("black_name") or ""
                w_id = row.get("white_id") or row.get("white_name") or ""
                if not b_id or not w_id or b_id == w_id:
                    continue
                day = int(float(row.get("day") or 0))
                if day <= 0:
                    continue
                if max_day_exclusive is not None and day >= max_day_exclusive:
                    continue
                rule = int(float(row.get("rule") or 0))
                if rule in NON_FORBIDDEN_RULES:
                    continue
                rnd = int(row["round"]) if (row.get("round") or "").isdigit() else 0
                bt_str = (row.get("base_time") or "").strip()
                inc_str = (row.get("increment") or "").strip()
                base_time = float(bt_str) if bt_str != "" else np.nan
                increment = float(inc_str) if inc_str != "" else np.nan
                games.append({
                    "idx": idx, "tid": row.get("tournament_id") or "",
                    "rnd": rnd, "day": day, "rule": rule,
                    "base_time": base_time, "increment": increment,
                    "b_id": b_id, "w_id": w_id, "res": res,
                })
    games.sort(key=lambda g: (g["day"], g["rnd"], g["idx"]))
    annotate_final_states(games)
    return games


def annotate_final_states(games):
    """标注每局的一维末轮状态 final_state（仅看当时最高分领先者，不存在最高分或非末轮为 0）:
    0: 非末轮，或本局不存在当前最高分选手
    1: 仅黑方为当前最高分，处于 争胜
    2: 仅黑方为当前最高分，处于 保和
    3: 仅黑方为当前最高分，处于 稳冠
    4: 仅白方为当前最高分，处于 争胜
    5: 仅白方为当前最高分，处于 保和
    6: 仅白方为当前最高分，处于 稳冠
    7: 双方同为当前最高分（均处于 争胜）
    """
    from collections import defaultdict
    tours = defaultdict(list)
    for g in games:
        g["final_state"] = 0
        if g["tid"] and g["rnd"] > 0:
            tours[g["tid"]].append(g)

    for glist in tours.values():
        if max(g["rnd"] for g in glist) < 3:
            continue
        parent = {}

        def find(x):
            while parent.setdefault(x, x) != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for g in glist:
            rb, rw = find(g["b_id"]), find(g["w_id"])
            if rb != rw:
                parent[rb] = rw

        comps = defaultdict(list)
        for g in glist:
            comps[find(g["b_id"])].append(g)

        for cg in comps.values():
            max_r = max(g["rnd"] for g in cg)
            if max_r < 3:
                continue
            pts = defaultdict(float)
            in_final = set()
            finals = []
            for g in cg:
                if g["rnd"] < max_r:
                    if g["res"] == "B":
                        pts[g["b_id"]] += 1.0
                    elif g["res"] == "W":
                        pts[g["w_id"]] += 1.0
                    else:
                        pts[g["b_id"]] += 0.5
                        pts[g["w_id"]] += 0.5
                else:
                    in_final.add(g["b_id"])
                    in_final.add(g["w_id"])
                    finals.append(g)
            if len(finals) < 2:
                continue
            cur_leader = max((pts[q] for q in in_final), default=0.0)

            def leader_state(p, opp):
                other_max = max((pts[q] + 1.0 for q in in_final if q != p and q != opp), default=-1.0)
                if pts[p] > max(other_max, pts[opp] + 1.0):
                    return 3
                if pts[p] + 0.5 > max(other_max, pts[opp] + 0.5):
                    return 2
                return 1

            for g in finals:
                b, w = g["b_id"], g["w_id"]
                b_lead = pts[b] == cur_leader
                w_lead = pts[w] == cur_leader
                if b_lead and w_lead:
                    g["final_state"] = 7
                elif b_lead:
                    g["final_state"] = leader_state(b, w)
                elif w_lead:
                    g["final_state"] = 3 + leader_state(w, b)
                else:
                    g["final_state"] = 0


def build_glicko_features(games):
    rating, rd_map, last_day = {}, {}, {}

    def get_pre_win(pid, day):
        r = rating.get(pid, INIT_RATING)
        rd = rd_map.get(pid, INIT_RD)
        ld = last_day.get(pid)
        if ld is not None and day > ld:
            rd = min(MAX_RD, math.sqrt(rd * rd + C2_PER_DAY * (day - ld)))
        return r, rd

    def g_func(rd):
        return 1.0 / math.sqrt(1.0 + THREE_Q2_OVER_PI2 * rd * rd)

    rows = []
    for g in games:
        day, b_id, w_id, res = g["day"], g["b_id"], g["w_id"], g["res"]
        rb, rdb = get_pre_win(b_id, day)
        rw, rdw = get_pre_win(w_id, day)
        # 类别映射：0: 白胜 (W), 1: 和棋 (D), 2: 黑胜 (B)
        label = 2 if res == "B" else (1 if res == "D" else 0)
        rows.append((g["rule"], rb, rw, rb - rw, g["base_time"], g["increment"], label))

        gb, gw = g_func(rdb), g_func(rdw)
        eb = 1.0 / (1.0 + 10.0 ** (-gw * (rb - rw) / 400.0))
        ew = 1.0 / (1.0 + 10.0 ** (-gb * (rw - rb) / 400.0))
        sb = 1.0 if res == "B" else (0.5 if res == "D" else 0.0)
        sw = 1.0 - sb
        db = 1.0 / (rdb * rdb) + Q2 * gw * gw * eb * (1.0 - eb)
        dw = 1.0 / (rdw * rdw) + Q2 * gb * gb * ew * (1.0 - ew)
        rating[b_id] = rb + (Q / db) * gw * (sb - eb)
        rd_map[b_id] = max(MIN_RD, math.sqrt(1.0 / db))
        last_day[b_id] = day
        rating[w_id] = rw + (Q / dw) * gb * (sw - ew)
        rd_map[w_id] = max(MIN_RD, math.sqrt(1.0 / dw))
        last_day[w_id] = day

    feature_cols = ["rule", "rating_tb", "rating_tw", "rating_diff", "base_time", "increment"]
    return pd.DataFrame(rows, columns=feature_cols + ["label"]), feature_cols


def train_and_export(df, feature_cols, out_name="model_glicko_20261113.json"):
    cat_cols = ["rule"]
    cat_indices = [0]
    all_rules = sorted(list(df["rule"].unique()))
    df["rule"] = df["rule"].astype(pd.CategoricalDtype(categories=all_rules))

    n_train = int(len(df) * 0.8)
    train_df = df.iloc[:n_train].copy()
    test_df = df.iloc[n_train:].copy()

    # 两阶段模型：
    # 1) 和棋 vs 分胜负（对 base_time 和 increment 施加 +1 单调非降约束，避免无加秒反而更易和棋）
    y_draw_tr = (train_df["label"] == 1).astype(int)
    y_draw_te = (test_df["label"] == 1).astype(int)
    d_tr1 = lgb.Dataset(train_df[feature_cols], label=y_draw_tr, categorical_feature=cat_cols)
    d_te1 = lgb.Dataset(test_df[feature_cols], label=y_draw_te, reference=d_tr1, categorical_feature=cat_cols)
    base_params = {
        "objective": "binary",
        "metric": "binary_logloss",
        "boosting_type": "gbdt",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
        "seed": 42,
    }
    m_draw = lgb.train(
        {**base_params, "monotone_constraints": [0, 0, 0, 0, 1, 1]},
        d_tr1,
        num_boost_round=1000,
        valid_sets=[d_tr1, d_te1],
        callbacks=[lgb.early_stopping(50, verbose=False)],
    )

    # 2) 分胜负对局中黑胜 vs 白胜
    tr_dec = train_df[train_df["label"] != 1].copy()
    te_dec = test_df[test_df["label"] != 1].copy()
    d_tr2 = lgb.Dataset(tr_dec[feature_cols], label=(tr_dec["label"] == 2).astype(int), categorical_feature=cat_cols)
    d_te2 = lgb.Dataset(te_dec[feature_cols], label=(te_dec["label"] == 2).astype(int), reference=d_tr2, categorical_feature=cat_cols)
    m_bw = lgb.train(
        base_params,
        d_tr2,
        num_boost_round=1000,
        valid_sets=[d_tr2, d_te2],
        callbacks=[lgb.early_stopping(50, verbose=False)],
    )

    pd_te = m_draw.predict(test_df[feature_cols], num_iteration=m_draw.best_iteration)
    pb_dec_te = m_bw.predict(test_df[feature_cols], num_iteration=m_bw.best_iteration)
    preds = np.column_stack([(1.0 - pd_te) * (1.0 - pb_dec_te), pd_te, (1.0 - pd_te) * pb_dec_te])
    y_true = test_df["label"].values
    acc = accuracy_score(y_true, np.argmax(preds, axis=1))
    loss = log_loss(y_true, preds)
    print(f"两阶段单调 Glicko-GBDT ({len(feature_cols)}特征) 训练完成: draw_iter={m_draw.best_iteration}, bw_iter={m_bw.best_iteration}, Valid Acc={acc*100:.2f}%, LogLoss={loss:.4f}")

    def parse_tree_node(node):
        if "leaf_value" in node:
            return {"v": round(node["leaf_value"], 6)}
        f_idx = node["split_feature"]
        thresh = node["threshold"]
        res = {
            "f": f_idx,
            "l": parse_tree_node(node["left_child"]),
            "r": parse_tree_node(node["right_child"]),
            "dl": 1 if (node["default_left"] is True) else 0,
        }
        if isinstance(thresh, str):
            res["tc"] = [int(x) for x in thresh.split("||")]
        else:
            res["t"] = thresh if abs(thresh) < 1e-15 else round(thresh, 5)
        return res

    draw_dump = m_draw.dump_model()
    bw_dump = m_bw.dump_model()
    pandas_cat = draw_dump.get("pandas_categorical", [])
    draw_trees = [parse_tree_node(t["tree_structure"]) for t in draw_dump["tree_info"]]
    bw_trees = [parse_tree_node(t["tree_structure"]) for t in bw_dump["tree_info"]]
    cat_maps = {
        str(feature_cols.index(c)): [int(x) for x in pandas_cat[i]]
        for i, c in enumerate(cat_cols)
    }
    out_model = {
        "format": "two_stage_binary_v1",
        "features": feature_cols,
        "cat_indices": cat_indices,
        "cat_maps": cat_maps,
        "inc_draw_calib": {"coef": 0.05, "ref": 15.0},
        "draw_trees": draw_trees,
        "bw_trees": bw_trees,
    }

    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(API_DIR, exist_ok=True)
    default_path = os.path.join(MODEL_DIR, "model.json")
    api_model_path = os.path.join(API_DIR, "model.json")
    for p in (default_path, api_model_path):
        with open(p, "w", encoding="utf-8") as f:
            json.dump(out_model, f, separators=(",", ":"))
    print(f"已导出两阶段单调 Glicko-GBDT 模型: {default_path} 与 {api_model_path} ({len(draw_trees)}+{len(bw_trees)} 棵树)")
    return default_path


def main():
    ap = argparse.ArgumentParser(description="基于 data/duiju.db 训练 7 特征 Glicko-GBDT 模型")
    ap.add_argument("--source", "--csv", dest="source", default=DEFAULT_DB_PATH, help="数据源路径（默认 data/duiju.db，也可传 CSV）")
    ap.add_argument("--out-name", default="model_glicko_20261113.json", help="输出模型文件名")
    ap.add_argument("--include-shanhai", action="store_true", help="是否把山海杯纳入训练集")
    args = ap.parse_args()

    t0 = time.time()
    max_day = None if args.include_shanhai else SHANHAI_DAY
    games = load_training_games(args.source, max_day_exclusive=max_day)
    df, cols = build_glicko_features(games)
    train_and_export(df, cols, out_name=args.out_name)
    print(f"总耗时: {time.time() - t0:.2f}s")


if __name__ == "__main__":
    main()
