from flask import Flask, render_template, request, redirect, url_for, flash, session, g
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import json
from datetime import datetime, timedelta
from collections import defaultdict
import math
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///swiss_tournament.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
def get_player_points(player, up_to_round=None):
    if up_to_round is None:
        return sum(r.points for r in player.player_results)
    return sum(r.points for r in player.player_results if r.round_number <= up_to_round)

def get_player_points2(player, up_to_round=None):
    if up_to_round is None:
        return sum(r.points2 for r in player.player_results)
    return sum(r.points2 for r in player.player_results if r.round_number <= up_to_round)
# 数据库模型
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    tournaments = db.relationship('Tournament', backref='organizer', lazy=True)

class Tournament(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow()+ timedelta(hours=8))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    players = db.relationship('Player', backref='tournament', lazy=True)
    rounds = db.relationship('Round', backref='tournament', lazy=True)

class Player(db.Model):
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    team = db.Column(db.String(80), default="个人")
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournament.id'), nullable=False)
    
    # 作为选手的比赛结果
    player_results = db.relationship('PlayerResult', 
                                    back_populates='player', 
                                    foreign_keys='PlayerResult.player_id')
    def get_player_points(self,round):
        return get_player_points(self,round)
                                      

class Round(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.Integer, nullable=False)
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournament.id'), nullable=False)
    pairings = db.relationship('Pairing', backref='round', lazy=True)

class Pairing(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    table_number = db.Column(db.Integer, nullable=False)
    round_id = db.Column(db.Integer, db.ForeignKey('round.id'), nullable=False)
    player1_id = db.Column(db.Integer, db.ForeignKey('player.id'), nullable=False)
    player2_id = db.Column(db.Integer, db.ForeignKey('player.id'))
    result = db.Column(db.Float)
    is_bye = db.Column(db.Boolean, default=False)
    
    player1 = db.relationship('Player', foreign_keys=[player1_id])
    player2 = db.relationship('Player', foreign_keys=[player2_id])


class PlayerResult(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    round_number = db.Column(db.Integer, nullable=False)
    player_id = db.Column(db.Integer, db.ForeignKey('player.id'), nullable=False)
    points = db.Column(db.Float, default=0.0)
    points2 = db.Column(db.Float, default=0.0)
    opponent_id = db.Column(db.Integer, db.ForeignKey('player.id'))
    result = db.Column(db.Float)
    is_bye = db.Column(db.Boolean, default=False)
    
    # 使用 back_populates 定义反向关系
    player = db.relationship('Player', foreign_keys=[player_id], back_populates='player_results')

# 创建数据库表
with app.app_context():
    # 在创建数据库表之前
    db.drop_all()
    db.create_all()

# 辅助函数
def get_current_tournament():
    if 'tournament_id' in session:
        return Tournament.query.get(session['tournament_id'])
    return None


def has_played_against(player1, player2, tournament):
    for round_ in tournament.rounds:
        for pairing in round_.pairings:
            if (pairing.player1_id == player1.id and pairing.player2_id == player2.id) or \
               (pairing.player1_id == player2.id and pairing.player2_id == player1.id):
                return True
    return False

def calculate_opponent_points(player, tournament):
    current_round = max([r.number for r in tournament.rounds], default=0)
    opponent_points = 0.0
    for result in player.player_results:
        if result.is_bye:
            opponent_points += current_round * 0.5
        elif result.opponent_id:
            # 获取对手对象而不是直接使用ID
            opponent = Player.query.get(result.opponent_id)
            if opponent:
                opponent_points += get_player_points2(opponent)
    return opponent_points

def calculate_small_points(player, tournament):
    small_points = 0.0
    for result in player.player_results:
        if result.opponent_id and not result.is_bye:
            opponent = Player.query.get(result.opponent_id)
            small_points += get_player_points(opponent) * result.result
    return small_points

@app.route('/tournament/<int:tournament_id>/set_tiebreak_rules', methods=['POST'])
def set_tiebreak_rules(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    tiebreak1 = request.form.get('tiebreak1', '')
    tiebreak2 = request.form.get('tiebreak2', '')
    
    # 保存破同分规则到数据库或session
    session[f'tiebreak_rules'] = [tiebreak1, tiebreak2]
    flash('破同分规则已更新', 'success')
    return redirect(url_for('tournament_dashboard', tournament_id=tournament_id))

def get_tiebreak_rules():
    # 从session或数据库获取破同分规则
    default_rules = []
    return session.get(f'tiebreak_rules', default_rules)

# 修改get_rankings函数以使用自定义破同分规则
def get_rankings(tournament):
    tiebreak_rules = get_tiebreak_rules()
    
    players = tournament.players
    
    # 计算每个选手的积分和破同分项
    player_data = []
    for player in players:
        points = get_player_points(player)
        opponent_points = calculate_opponent_points(player, tournament)
        small_points = calculate_small_points(player, tournament)
        
         # 构建积分显示字符串
        points_str =str(get_player_points(player)).replace(".0", "") 
        if tiebreak_rules[0] == "对手分":
            points_str += f" - {str(opponent_points).replace(".0", "")  }"
        if tiebreak_rules[1] == "小分":
            points_str += f" - {str(small_points).replace(".0", "")}"
        
        player_data.append({
            'player': player,
            'points': points,  # 原始积分值
            'points_str': points_str,  # 格式化后的字符串
            'opponent_points': opponent_points,
            'small_points': small_points,
        })
    
    # 排序
    def sort_key(p):
        key = [-p['points']]  # 积分降序
        for method in tiebreak_rules:
            if method == "对手分":
                key.append(-p['opponent_points'])
            elif method == "小分":
                key.append(-p['small_points'])
        key.append(p['player'].id)  # ID升序作为最后条件
        return key
    
    player_data.sort(key=sort_key)
    
    # 计算名次
    rankings = []
    for i, data in enumerate(player_data):
        points_str = ""
        if i > 0 and all(
            player_data[i][k] == player_data[i-1][k] 
            for k in ['points', 'opponent_points', 'small_points']
        ):
            # 与前一名选手各项相同，名次相同
            rank = rankings[-1][0]
        else:
            rank = i + 1
        
        rankings.append((rank, data['player'], data['points_str']))
    
    return rankings


# 路由
@app.route('/')
def index():
    # 检查用户是否已登录
    if 'user_id' not in session:
        return render_template("index.html", tournaments=[])
    
    user = User.query.get(session['user_id'])
    if not user:  # 如果session中有user_id但数据库中不存在该用户
        session.pop('user_id', None)  # 清除无效的session
        return render_template("index.html", tournaments=[])
    
    tournaments = Tournament.query.filter_by(user_id=user.id).order_by(Tournament.created_at.desc()).all()
    return render_template('index.html', tournaments=tournaments)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        if User.query.filter_by(username=username).first():
            flash('用户名已存在', 'error')
            return redirect(url_for('register'))
        
        hashed_password = generate_password_hash(password)
        new_user = User(username=username, password=hashed_password)
        db.session.add(new_user)
        db.session.commit()
        
        flash('注册成功，请登录', 'success')
        return redirect(url_for('login'))
    
    return render_template('register.html')

from flask_login import login_user, logout_user, current_user, login_required
from flask_login import LoginManager, UserMixin

login_manager = LoginManager(app)
login_manager.login_view = 'login'

class User(UserMixin, db.Model):
    # 你的User模型定义
    pass

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        user = User.query.filter_by(username=request.form['username']).first()
        if user and check_password_hash(user.password, request.form['password']):
            session['user_id'] = user.id  # 将用户ID存入session
            flash('登录成功', 'success')
            return redirect(url_for('index'))
        else:
            flash('用户名或密码错误', 'error')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)  # 从session中移除user_id
    flash('您已成功退出', 'success')
    return redirect(url_for('index'))

@app.route('/tournament/new', methods=['GET', 'POST'])
def new_tournament():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    if request.method == 'POST':
        name = request.form['name']
        new_tournament = Tournament(name=name, user_id=session['user_id'])
        db.session.add(new_tournament)
        db.session.commit()
        
        session['tournament_id'] = new_tournament.id
        flash('比赛创建成功', 'success')
        return redirect(url_for('tournament_dashboard', tournament_id=new_tournament.id))
    
    return render_template('new_tournament.html')

@app.route('/tournament/<int:tournament_id>')
def tournament_dashboard(tournament_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    session['tournament_id'] = tournament_id
    
    # 找到当前最新的轮次对象
    current_round_number = max([r.number for r in tournament.rounds], default=0)
    current_round = None
    if current_round_number > 0:
        current_round = Round.query.filter_by(
            tournament_id=tournament_id,
            number=current_round_number
        ).first()
    
    players = tournament.players
    rounds = tournament.rounds
    

    tiebreak_rules = get_tiebreak_rules()
    
    return render_template('tournament_dashboard.html', 
                         tournament=tournament,
                         current_round=current_round,
                         players=players,
                         rounds=rounds,
                         tiebreak_rules=tiebreak_rules)

@app.route('/tournament/<int:tournament_id>/players', methods=['GET', 'POST'])
def manage_players(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        if 'delete' in request.form:
            player_id = int(request.form['delete'])
            player = Player.query.get(player_id)
            if player and player.tournament_id == tournament_id:
                # 删除相关结果和配对
                PlayerResult.query.filter_by(player_id=player_id).delete()
                for round_ in tournament.rounds:
                    Pairing.query.filter(
                        (Pairing.player1_id == player_id) | 
                        (Pairing.player2_id == player_id)
                    ).delete()
                db.session.delete(player)
                db.session.commit()
                flash('选手已删除', 'success')
        
        elif 'add' in request.form:
            name = request.form['name'].strip()
            team = request.form['team'].strip() or "个人"
            
            if not name:
                name = f"选手{len(tournament.players) + 1}"
            
            new_player = Player(name=name, team=team, tournament_id=tournament_id)
            db.session.add(new_player)
            db.session.commit()
            flash('选手已添加', 'success')
    
    return render_template('manage_players.html', tournament=tournament)

@app.route('/tournament/<int:tournament_id>/round/new')
def create_next_round(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    if len(tournament.players) < 2:
        flash('至少需要2名选手才能创建轮次', 'error')
        return redirect(url_for('tournament_dashboard', tournament_id=tournament_id))
    
    current_round = max([r.number for r in tournament.rounds], default=0)
    
    # 检查上一轮是否所有对局都有结果
    if current_round > 0:
        last_round = Round.query.filter_by(tournament_id=tournament_id, number=current_round).first()
        incomplete = [p for p in last_round.pairings if p.result is None]
        if incomplete:
            flash(f'请先完成第{current_round}轮的所有对局结果', 'error')
            return redirect(url_for('tournament_dashboard', tournament_id=tournament_id))
    
    new_round_number = current_round + 1
    new_round = Round(number=new_round_number, tournament_id=tournament_id)
    db.session.add(new_round)
    db.session.flush()  # 获取新轮次的ID
    
    if new_round_number == 1:
        # 第一轮随机配对
        players = tournament.players
        players.sort(key=lambda p: p.id)  # 按ID排序
        
        n = len(players)
        mid = n // 2
        
        upper = players[:mid]
        lower = players[mid:]
        
        table = 1
        for i in range(mid):
            pairing = Pairing(
                table_number=table,
                round_id=new_round.id,
                player1_id=upper[i].id,
                player2_id=lower[i].id
            )
            db.session.add(pairing)
            table += 1
        
        if n % 2 == 1:
            # 奇数选手，最后一个轮空
            pairing = Pairing(
                table_number=table,
                round_id=new_round.id,
                player1_id=lower[-1].id,
                player2_id=None,
                is_bye=True
            )
            db.session.add(pairing)
            
            # 记录轮空结果
            result = PlayerResult(
                round_number=new_round_number,
                player_id=lower[-1].id,
                points=1.0,
                points2=0.5,
                result=-1.5,
                is_bye=True
            )
            db.session.add(result)
    else:
        # 瑞士制配对
        players = tournament.players
        
        # 1. All players sorted by points descending and ID ascending
        players = sorted(
            tournament.players,
            key=lambda p: (-get_player_points(p), p.id)
        )

        # Group by points (from high to low)
        score_groups = defaultdict(list)
        for p in players:
            score_groups[get_player_points(p)].append(p)
        score_groups = sorted(score_groups.items(), key=lambda x: -x[0])

        # Minimum points among players who never had a bye (for bye eligibility)
        never_had_bye = [p for p in tournament.players if not any(
            r.is_bye for r in p.player_results
        )]
        min_bye_points = min([get_player_points(p) for p in never_had_bye]) if never_had_bye else float('inf')

        # Final results storage
        final_pairings = []
        final_leftover = []
        log = []

        # ===== Group-level backtracking with up-down rules =====
        def solve_group(group_index, leftover_upper, current_pairings):
            # ===== Base case: all groups processed =====
            if group_index == len(score_groups):
                rem = leftover_upper
                # Check if remaining players can form a legal ending
                if len(rem) == 0:
                    # Perfect pairing
                    return (True, current_pairings.copy(), [])
                if len(rem) == 1 and not any(r.is_bye for r in rem[0].player_results) and get_player_points(rem[0]) == min_bye_points:
                    # Legal bye
                    bye = Pairing(
                        table_number=0,
                        round_id=new_round.id,
                        player1_id=rem[0].id,
                        player2_id=None,
                        is_bye=True
                    )
                    current_pairings.append(bye)
                    # Record bye result
                    result = PlayerResult(
                        round_number=new_round_number,
                        player_id=rem[0].id,
                        points=1.0,
                        points2=0.5,
                        result=-1.5,
                        is_bye=True
                    )
                    db.session.add(result)
                    return (True, current_pairings.copy(), rem.copy())
                # Other cases (remaining > 1 or bye not legal) are invalid
                return (False, None, None)

            current_group = score_groups[group_index][1]
            score = score_groups[group_index][0]

            # ===== Phase 1: Generate all legal cross-group pairing options (leftover_upper → current_group) =====
            cross_options = []

            def generate_cross_options():
                available_upper = leftover_upper.copy()
                available_lower = current_group.copy()
                used_in_lower = set()  # Mark players used in lower group

                def backtrack(idx, path):
                    if idx == len(available_upper):
                        rem = [p for p in available_lower if p.id not in used_in_lower]
                        cross_options.append((path.copy(), set(used_in_lower), rem.copy()))
                        return

                    p1 = available_upper[idx]  # Upper player

                    # Try to pair with each unused and non-played player in current group
                    for i, p2 in enumerate(available_lower):
                        if p2.id in used_in_lower:
                            continue
                        if has_played_against(p1, p2, tournament):
                            continue

                        # Try pairing
                        used_in_lower.add(p2.id)
                        path.append(Pairing(
                            table_number=0,
                            round_id=new_round.id,
                            player1_id=p1.id,
                            player2_id=p2.id
                        ))

                        # Recursively process next upper player
                        backtrack(idx + 1, path)

                        # Backtrack
                        path.pop()
                        used_in_lower.remove(p2.id)

                    # Even if can pair, allow not pairing current upper player (left for internal processing)
                    backtrack(idx + 1, path)

                backtrack(0, [])

            generate_cross_options()

            # ===== Phase 2: For each cross-group option, generate internal pairing options (with up-down rules) =====
            for cross_pairs, used_in_cross, remaining_current in cross_options:
                internal_options = []

                def generate_internal_with_rules(candidates):
                    # Divide into upper and lower
                    mid = len(candidates) // 2 if len(candidates) % 2 == 0 else (len(candidates) - 1) // 2
                    upper = candidates[:mid]
                    lower = candidates[mid:]

                    used = set()
                    path = []

                    # ===== Core: Prioritize pairing for "front-most" players =====
                    def backtrack_internal(index):
                        if index >= len(candidates):
                            internal_options.append((path.copy(), set(used)))
                            return

                        p1 = candidates[index]

                        # If p1 is already used, skip
                        if p1.id in used:
                            backtrack_internal(index + 1)
                            return

                        # ===== Generate all possible opponents for p1, prioritized =====
                        opponents = []

                        # 1. Highest priority: Pair with lower player (if p1 is in upper)
                        if p1 in upper:
                            opponents.extend([p for p in lower if p.id not in used])

                        # 2. Medium priority: Pair with upper players after p1 (reverse order)
                        if p1 in upper:
                            p1_upper_idx = upper.index(p1)
                            for i in range(len(upper) - 1, p1_upper_idx, -1):
                                p2 = upper[i]
                                if p2.id not in used:
                                    opponents.append(p2)

                        # 3. Lowest priority: Pair with lower players after p1 (reverse order)
                        if p1 in lower:
                            p1_lower_idx = lower.index(p1)
                            for i in range(len(lower) - 1, p1_lower_idx, -1):
                                p2 = lower[i]
                                if p2.id not in used:
                                    opponents.append(p2)

                        # ===== Try to pair p1 with each prioritized opponent =====
                        for p2 in opponents:
                            if has_played_against(p1, p2, tournament):
                                continue

                            # Try pairing
                            used.add(p1.id)
                            used.add(p2.id)
                            path.append(Pairing(
                                table_number=0,
                                round_id=new_round.id,
                                player1_id=p1.id,
                                player2_id=p2.id
                            ))

                            # Recurse: process next "front-most" player
                            backtrack_internal(index + 1)

                            # Backtrack
                            path.pop()
                            used.remove(p1.id)
                            used.remove(p2.id)

                        # Try not pairing p1 (leave for later processing)
                        backtrack_internal(index + 1)

                    # Start backtracking from index 0 (first "front-most" player)
                    backtrack_internal(0)

                generate_internal_with_rules(remaining_current)

                # ===== Phase 3: Combine options, recurse to next group =====
                for internal_pairs, used_in_internal in internal_options:
                    # Build cumulative pairing list
                    new_pairings = current_pairings.copy()
                    new_pairings.extend(cross_pairs)  # Add cross-group pairings
                    new_pairings.extend(internal_pairs)  # Add internal pairings

                    # Calculate remaining players after this phase
                    used_all = set(used_in_cross)  # Cross-group used
                    for p in internal_pairs:  # Internal used
                        used_all.add(p.player1_id)
                        if p.player2_id is not None:
                            used_all.add(p.player2_id)

                    # Unpaired players in current group
                    rem_current = [p for p in remaining_current if p.id not in used_all]
                    # Unpaired players in upper group that didn't participate in cross-group
                    rem_upper = [p for p in leftover_upper if not any(cp.player1_id == p.id for cp in cross_pairs)]
                    # Combine as new "leftover" for next group
                    new_leftover = rem_upper + rem_current

                    # Recurse to next group
                    success, result_pairings, result_leftover = solve_group(
                        group_index + 1, new_leftover, new_pairings
                    )

                    if success:                        # Return final result upwards
                        return (True, result_pairings, result_leftover)
                    # If failed, continue to next internal_pairs option
                # If all internal_pairs options failed, continue to next cross_pairs option

            # All options failed
            return (False, None, None)

        # ===== Start backtracking =====
        success, result_pairings, result_leftover = solve_group(0, [], [])
        
        # 保存配对
        result_pairings.sort(key=lambda p: (
            -1 if p.is_bye else 0,
            -max(get_player_points(tournament.players[p.player1_id - 1]), get_player_points(tournament.players[p.player1_id - 1]) if p.player2 else 0),
            -min(get_player_points(tournament.players[p.player2_id - 1]), get_player_points(tournament.players[p.player2_id - 1]) if p.player2 else 0),
            p.player1_id
        ))
        
        for i, pairing in enumerate(result_pairings):
            pairing.table_number = i + 1
            db.session.add(pairing)
    
    db.session.commit()
    flash(f'第{new_round_number}轮已创建', 'success')
    return redirect(url_for('tournament_dashboard', tournament_id=tournament_id))

@app.route('/tournament/<int:tournament_id>/round/<int:round_number>')
def view_round(tournament_id, round_number):
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    round_ = Round.query.filter_by(tournament_id=tournament_id, number=round_number).first_or_404()
    pairings = round_.pairings
    
    # 获取每个选手的上轮积分
    pairing_data = []
    for p in pairings:
        p1_points = get_player_points(p.player1, round_number - 1) if round_number > 1 else 0.0
        p2_points = get_player_points(p.player2, round_number - 1) if p.player2 and round_number > 1 else 0.0
        
        if p.result == 1.0:
            result_str = "1 : 0"
        elif p.result == 0.5:
            result_str = "0.5 : 0.5"
        elif p.result == 0.0:
            result_str = "0 : 1"
        elif p.result == -1.5:
            result_str = "+ : -"
        else:
            result_str = ""
        
        pairing_data.append({
            'pairing': p,
            'p1_points': p1_points,
            'p2_points': p2_points,
            'result_str': result_str
        })
    
    return render_template('view_round.html', 
                         tournament=tournament,
                         round=round_,
                         pairing_data=pairing_data)

@app.route('/tournament/<int:tournament_id>/round/<int:round_number>/pairing/<int:pairing_id>/set_result', methods=['POST'])
def set_pairing_result(tournament_id, round_number, pairing_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    pairing = Pairing.query.get_or_404(pairing_id)
    if pairing.round_id != Round.query.filter_by(tournament_id=tournament_id, number=round_number).first().id:
        flash('无效的对局', 'error')
        return redirect(url_for('view_round', tournament_id=tournament_id, round_number=round_number))
    
    result = request.form.get('result')
    if result not in ['1', '0.5', '0']:
        flash('无效的结果', 'error')
        return redirect(url_for('view_round', tournament_id=tournament_id, round_number=round_number))
    
    result = float(result)
    pairing.result = result
    
    # 更新选手结果
    # 删除旧的结果记录（如果有）
    PlayerResult.query.filter_by(
        player_id=pairing.player1_id,
        round_number=round_number
    ).delete()
    
    if pairing.player2_id:
        PlayerResult.query.filter_by(
            player_id=pairing.player2_id,
            round_number=round_number
        ).delete()
    
    # 添加新的结果记录
    result1 = PlayerResult(
        round_number=round_number,
        player_id=pairing.player1_id,
        points=result if not pairing.is_bye else 1.0,
        points2=result if not pairing.is_bye else 0.5,
        opponent_id=pairing.player2_id,
        result=result if not pairing.is_bye else -1.5,
        is_bye=pairing.is_bye
    )
    db.session.add(result1)
    
    if pairing.player2_id and not pairing.is_bye:
        result2 = PlayerResult(
            round_number=round_number,
            player_id=pairing.player2_id,
            points=1.0 - result,
            points2=1.0 - result,
            opponent_id=pairing.player1_id,
            result=1.0 - result,
            is_bye=False
        )
        db.session.add(result2)
    
    db.session.commit()
    flash('结果已保存', 'success')
    return redirect(url_for('view_round', tournament_id=tournament_id, round_number=round_number))

@app.route('/tournament/<int:tournament_id>/rankings')
def view_rankings(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    rankings = get_rankings(tournament)
    return render_template('rankings.html', 
                         tournament=tournament,
                         rankings=rankings)

@app.route('/tournament/<int:tournament_id>/delete_last_round')
def delete_last_round(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    if tournament.user_id != session['user_id']:
        flash('无权访问此比赛', 'error')
        return redirect(url_for('index'))
    
    current_round = max([r.number for r in tournament.rounds], default=0)
    if current_round == 0:
        flash('没有可删除的轮次', 'error')
        return redirect(url_for('tournament_dashboard', tournament_id=tournament_id))
    
    last_round = Round.query.filter_by(tournament_id=tournament_id, number=current_round).first()
    
    # 删除相关结果记录
    for player in tournament.players:
        PlayerResult.query.filter_by(
            player_id=player.id,
            round_number=current_round
        ).delete()
    
    # 删除配对
    Pairing.query.filter_by(round_id=last_round.id).delete()
    
    # 删除轮次
    db.session.delete(last_round)
    db.session.commit()
    if 'current_round' in session:
        session['current_round'] = max(0, session['current_round'] - 1)
    flash(f'第{current_round}轮已删除', 'success')
    return redirect(url_for('tournament_dashboard', tournament_id=tournament_id))

if __name__ == '__main__':
    app.run(debug=True)