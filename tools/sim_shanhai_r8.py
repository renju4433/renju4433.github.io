# -*- coding: utf-8 -*-
"""基于最新模型预测的 R9 胜率，对山海杯 R8 积分榜执行 10,000,000 次蒙特卡洛模拟并写入 api/shanhai/standings/r8.json。"""

import json
import os
import sqlite3
import sys
import time
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import manage_duiju  # noqa: E402

DB_PATH = os.path.join(ROOT, 'data', 'duiju.db')
R9_JSON = os.path.join(ROOT, 'api', 'shanhai', 'r9.json')
S8_JSON = os.path.join(ROOT, 'api', 'shanhai', 'standings', 'r8.json')
TRIALS = 10_000_000
BATCH = 200_000


def main():
    t0 = time.time()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    tid = '2026-shanhai'

    players_dict = manage_duiju.collect_players(conn, tid)
    keys = sorted(players_dict.keys(), key=lambda k: players_dict[k]['no'])
    n_players = len(keys)
    key_to_idx = {k: i for i, k in enumerate(keys)}

    # 统计前 9 轮（其中第 9 轮先按赛程记录对手与是否出战，不计赛果）
    games_all = conn.execute(
        'SELECT * FROM games WHERE tournament_id=? AND round<=9 ORDER BY round, table_no',
        (tid,),
    ).fetchall()
    conn.close()

    base_score = np.zeros(n_players, dtype=np.float64)
    base_wins = np.zeros(n_players, dtype=np.int64)
    floss = np.zeros(n_players, dtype=np.int64)
    fwin = np.zeros(n_players, dtype=np.int64)
    bye = np.zeros(n_players, dtype=np.int64)
    rounds_played = [set() for _ in range(n_players)]
    # opp_idx[i, r] in 0..n_players-1, or n_players (unplayed=0.0), or n_players+1 (bye=4.5)
    opp_idx = np.full((n_players, 9), n_players, dtype=np.int64)

    for g in games_all:
        rnd = g['round']
        b_key = manage_duiju._player_key(g['black_no'], g['black_name'])
        w_key = manage_duiju._player_key(g['white_no'], g['white_name'])
        bi = key_to_idx.get(b_key)
        wi = key_to_idx.get(w_key)

        if bi is not None:
            rounds_played[bi].add(rnd)
            opp_idx[bi, rnd - 1] = (n_players + 1) if w_key == '轮空' else wi
        if wi is not None:
            rounds_played[wi].add(rnd)
            opp_idx[wi, rnd - 1] = (n_players + 1) if b_key == '轮空' else bi

        if rnd <= 8:
            res = g['result']
            if w_key == '轮空' and bi is not None:
                base_score[bi] += 1.0
                bye[bi] += 1
            elif b_key == '轮空' and wi is not None:
                base_score[wi] += 1.0
                bye[wi] += 1
            elif res == 'B':
                base_score[bi] += 1.0
                base_wins[bi] += 1
            elif res == 'W':
                base_score[wi] += 1.0
                base_wins[wi] += 1
            elif res == 'D':
                base_score[bi] += 0.5
                base_score[wi] += 0.5
            elif res == 'BF':
                floss[bi] += 1
                fwin[wi] += 1
                base_score[wi] += 1.0
            elif res == 'WF':
                floss[wi] += 1
                fwin[bi] += 1
                base_score[bi] += 1.0

    # 虚拟积分偏移量：virtual_score = score + v_offset
    v_offset = np.zeros(n_players, dtype=np.float64)
    for i in range(n_players):
        withdraw = 9 - len(rounds_played[i])
        v_offset[i] = 0.5 * (floss[i] + withdraw - fwin[i] - bye[i])

    # 读取第 9 轮对阵及最新预测概率
    with open(R9_JSON, 'r', encoding='utf-8') as f:
        r9_data = json.load(f)
    r9_pairs = []
    for g in r9_data['games']:
        b_key = manage_duiju._player_key(g['black']['no'], g['black']['name'])
        w_key = manage_duiju._player_key(g['white']['no'], g['white']['name'])
        pred = g['prediction']
        pb = pred['black'] / 100.0
        pd = pred['draw'] / 100.0
        r9_pairs.append((key_to_idx[b_key], key_to_idx[w_key], pb, pb + pd))

    m_games = len(r9_pairs)
    b_indices = np.array([x[0] for x in r9_pairs], dtype=np.int64)
    w_indices = np.array([x[1] for x in r9_pairs], dtype=np.int64)
    pb_arr = np.array([x[2] for x in r9_pairs], dtype=np.float64)[None, :]
    pbd_arr = np.array([x[3] for x in r9_pairs], dtype=np.float64)[None, :]

    rank_counts = np.zeros((n_players, n_players), dtype=np.float64)
    rng = np.random.default_rng(20261116)
    n_batches = TRIALS // BATCH

    for _ in range(n_batches):
        u = rng.random((BATCH, m_games))
        is_b = u < pb_arr
        is_d = (~is_b) & (u < pbd_arr)
        is_w = ~is_b & ~is_d

        sc = np.broadcast_to(base_score, (BATCH, n_players)).copy()
        wn = np.broadcast_to(base_wins, (BATCH, n_players)).copy()

        # 22 台不重复选手，可直接向量化赋值
        sc[:, b_indices] += is_b * 1.0 + is_d * 0.5
        sc[:, w_indices] += is_w * 1.0 + is_d * 0.5
        wn[:, b_indices] += is_b
        wn[:, w_indices] += is_w

        v_sc = np.empty((BATCH, n_players + 2), dtype=np.float64)
        v_sc[:, :n_players] = sc + v_offset[None, :]
        v_sc[:, n_players] = 0.0
        v_sc[:, n_players + 1] = 4.5

        opp_vals = v_sc[:, opp_idx]  # (BATCH, n_players, 9)
        buch = opp_vals.sum(axis=2)
        med = buch - opp_vals.min(axis=2) - opp_vals.max(axis=2)

        # 所有分值均为 0.5 的整数倍，编码为无损整数键降序排列
        sort_key = (
            np.rint(sc * 2.0).astype(np.int64) * 100_000_000
            + np.rint(buch * 2.0).astype(np.int64) * 1_000_000
            + np.rint(med * 2.0).astype(np.int64) * 100
            + wn
        )
        order = np.argsort(-sort_key, axis=1, kind='quicksort')
        sorted_keys = np.take_along_axis(sort_key, order, axis=1)

        # 完全并列均分处理
        eq = sorted_keys[:, 1:] == sorted_keys[:, :-1]
        if not eq.any():
            for r in range(n_players):
                np.add.at(rank_counts[:, r], order[:, r], 1.0)
        else:
            # 对无并列行快速统计，有并列行精确均分
            has_tie = eq.any(axis=1)
            no_tie_idx = np.flatnonzero(~has_tie)
            if len(no_tie_idx):
                ord_nt = order[no_tie_idx]
                for r in range(n_players):
                    np.add.at(rank_counts[:, r], ord_nt[:, r], 1.0)
            for b_i in np.flatnonzero(has_tie):
                sk = sorted_keys[b_i]
                od = order[b_i]
                pos = 0
                while pos < n_players:
                    end = pos + 1
                    while end < n_players and sk[end] == sk[pos]:
                        end += 1
                    if end - pos == 1:
                        rank_counts[od[pos], pos] += 1.0
                    else:
                        w_share = 1.0 / (end - pos)
                        for p_idx in range(pos, end):
                            for r_idx in range(pos, end):
                                rank_counts[od[p_idx], r_idx] += w_share
                    pos = end

    # 写入 api/shanhai/standings/r8.json
    with open(S8_JSON, 'r', encoding='utf-8') as f:
        s8 = json.load(f)

    s8['champion_sim_trials'] = TRIALS
    ranks_1_to_n = np.arange(1, n_players + 1, dtype=np.float64)
    for row in s8['ranking']:
        k = manage_duiju._player_key(row['no'], row['name'])
        idx = key_to_idx[k]
        cnts = rank_counts[idx]
        probs_pct = cnts / TRIALS * 100.0
        row['champion_prob'] = round(float(probs_pct[0]), 4)
        row['top3_prob'] = round(float(probs_pct[:3].sum()), 4)
        row['top8_prob'] = round(float(probs_pct[:8].sum()), 4)
        row['expected_rank'] = round(float((cnts * ranks_1_to_n).sum() / TRIALS), 2)
        row['rank_probs'] = [
            round(float(probs_pct[r]), 2) if cnts[r] > 0 else None
            for r in range(n_players)
        ]

    with open(S8_JSON, 'w', encoding='utf-8') as f:
        json.dump(s8, f, ensure_ascii=False, indent=2)

    elapsed = time.time() - t0
    top5 = sorted(s8['ranking'], key=lambda x: -x['champion_prob'])[:5]
    print(f'10,000,000 次模拟完成 ({elapsed:.2f}s) → {S8_JSON}')
    for row in top5:
        print(f"  #{row['no']:2d} {row['name']:4s}: 夺冠={row['champion_prob']:.2f}% 前3={row['top3_prob']:.2f}% 前8={row['top8_prob']:.2f}% 期望名次={row['expected_rank']:.2f}")


if __name__ == '__main__':
    main()
