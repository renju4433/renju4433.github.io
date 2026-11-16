# -*- coding: utf-8 -*-
"""从 RenjuNet .rif XML 文件增量注入或修复 data/duiju.db 中的棋手、赛事与对局。"""

import argparse
from datetime import datetime
import os
import sqlite3
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, 'data', 'duiju.db')
EPOCH = datetime(1970, 1, 1)

# 已由本地精细赛程录入的赛事（避免重复入库）
SKIP_TOURNAMENT_IDS = {'rif_3692'}


def _date_to_day(date_str):
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str[:10], '%Y-%m-%d')
        return (dt - EPOCH).days
    except Exception:
        return None


def _player_name(a):
    nn = (a.get('native_name') or '').strip()
    if nn:
        return nn
    sn = (a.get('surname') or '').strip()
    nm = (a.get('name') or '').strip()
    return f'{sn} {nm}'.strip()


def _parse_int(v):
    if v is None or v == '':
        return None
    try:
        return int(v)
    except ValueError:
        return None


def import_rif(rif_path, db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    existing_players = {
        r['id']: (r['name'], r['country'])
        for r in conn.execute('SELECT id, name, country FROM players')
    }
    existing_tours = {
        r['id']: dict(r)
        for r in conn.execute("SELECT * FROM tournaments WHERE source='rif_xml'")
    }
    existing_games = {
        r['game_id']: dict(r)
        for r in conn.execute("SELECT * FROM games WHERE source='rif_xml'")
    }

    players_by_xml_id = {}
    tours_by_xml_id = {}
    p_ins = p_upd = t_ins = g_ins = g_upd = 0

    for _, elem in ET.iterparse(rif_path, events=('end',)):
        tag = elem.tag
        if tag == 'player':
            a = elem.attrib
            players_by_xml_id[a['id']] = a
            pid = (a.get('disp_id') or '').strip()
            pname = _player_name(a)
            pcountry = _parse_int(a.get('country'))
            if pid and pname:
                if pid not in existing_players:
                    conn.execute(
                        'INSERT OR IGNORE INTO players (id, name, country) VALUES (?, ?, ?)',
                        (pid, pname, pcountry),
                    )
                    existing_players[pid] = (pname, pcountry)
                    p_ins += 1
                elif existing_players[pid] != (pname, pcountry):
                    conn.execute(
                        'UPDATE players SET name=?, country=? WHERE id=?',
                        (pname, pcountry, pid),
                    )
                    existing_players[pid] = (pname, pcountry)
                    p_upd += 1
            elem.clear()

        elif tag == 'tournament':
            a = elem.attrib
            tours_by_xml_id[a['id']] = a
            elem.clear()

        elif tag == 'game':
            a = elem.attrib
            tid_xml = a.get('tournament', '')
            tid = 'rif_' + tid_xml
            if tid in SKIP_TOURNAMENT_IDS:
                elem.clear()
                continue

            gid = 'rif_' + a['id']
            tinfo = tours_by_xml_id.get(tid_xml, {})

            # 只为存在对局的新赛事建表，避免写入大量空未来赛程
            if tid not in existing_tours and tinfo:
                t_date = (tinfo.get('start') or tinfo.get('end') or '').strip() or None
                t_day = _date_to_day(t_date)
                t_year = _parse_int(tinfo.get('year'))
                t_rule = _parse_int(tinfo.get('rule'))
                t_rated = _parse_int(tinfo.get('rated'))
                conn.execute(
                    '''INSERT INTO tournaments
                       (id, source, name, year, date, day, rule_id, rated)
                       VALUES (?, 'rif_xml', ?, ?, ?, ?, ?, ?)''',
                    (tid, tinfo.get('name'), t_year, t_date, t_day, t_rule, t_rated),
                )
                existing_tours[tid] = {'id': tid, 'date': t_date, 'day': t_day}
                t_ins += 1

            sw = a.get('swap') or ''
            swapped = (sw.count('R') % 2 == 1)
            bp = players_by_xml_id.get(a.get('black', ''), {})
            wp = players_by_xml_id.get(a.get('white', ''), {})
            if swapped:
                bp, wp = wp, bp

            bid = (bp.get('disp_id') or '').strip() or None
            bname = _player_name(bp) if bp else None
            bc = _parse_int(bp.get('country')) if bp else None
            wid = (wp.get('disp_id') or '').strip() or None
            wname = _player_name(wp) if wp else None
            wc = _parse_int(wp.get('country')) if wp else None

            br = (a.get('bresult') or '').strip()
            if br == '1':
                res = 'W' if swapped else 'B'
            elif br == '0':
                res = 'B' if swapped else 'W'
            elif br == '0.5':
                res = 'D'
            else:
                res = None

            rnd = _parse_int(a.get('round'))
            g_date = (tinfo.get('start') or '').strip() or (existing_tours.get(tid, {}).get('date'))
            g_day = _date_to_day(g_date) or (existing_tours.get(tid, {}).get('day'))
            g_rule = _parse_int(a.get('rule'))
            g_rated = _parse_int(tinfo.get('rated')) if tinfo else None
            g_op = (a.get('opening') or '').strip() or None

            moves_parts = []
            for ch in elem:
                if ch.tag == 'move' and ch.text:
                    moves_parts.append(ch.text.strip())
            moves = ' '.join(p for p in moves_parts if p) or None

            if gid not in existing_games:
                conn.execute(
                    '''INSERT INTO games (
                           game_id, source, tournament_id, round, date, day, rule, rated,
                           black_id, black_name, black_country,
                           white_id, white_name, white_country,
                           result, swap, opening, moves
                       ) VALUES (?, 'rif_xml', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (
                        gid, tid, rnd, g_date, g_day, g_rule, g_rated,
                        bid, bname, bc, wid, wname, wc,
                        res, sw or None, g_op, moves,
                    ),
                )
                g_ins += 1
            else:
                og = existing_games[gid]
                if (
                    og['result'] != res
                    or og['black_id'] != bid
                    or og['white_id'] != wid
                    or og['rule'] != g_rule
                    or (og['opening'] or None) != g_op
                    or (og['swap'] or None) != (sw or None)
                ):
                    conn.execute(
                        '''UPDATE games
                           SET round=?, rule=?, black_id=?, black_name=?, black_country=?,
                               white_id=?, white_name=?, white_country=?,
                               result=?, swap=?, opening=?, moves=?
                           WHERE game_id=?''',
                        (
                            rnd, g_rule, bid, bname, bc, wid, wname, wc,
                            res, sw or None, g_op, moves, gid,
                        ),
                    )
                    g_upd += 1
            elem.clear()

    conn.commit()
    conn.close()
    print(f'同步完成: 新增棋手 {p_ins}, 更新棋手 {p_upd}, 新增赛事 {t_ins}, 新增对局 {g_ins}, 修复对局 {g_upd}')


def main():
    ap = argparse.ArgumentParser(description='从 .rif XML 文件增量同步棋手、赛事与对局到 data/duiju.db')
    ap.add_argument('rif', help='.rif XML 文件路径')
    ap.add_argument('--db', default=DB_PATH, help='SQLite 数据库路径')
    args = ap.parse_args()
    import_rif(args.rif, args.db)


if __name__ == '__main__':
    main()
