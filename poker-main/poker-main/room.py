import random
import asyncio


class User:
    def __init__(self, id, send, seat=None, room=None):
        self.id = id
        self.send = send
        self.online = True
        self.state = 0
        self.seat = seat
        self.room = room

    @property
    def name(self):
        if self.seat is not None:
            return f'玩家{self.seat}'
        return '访客'

    async def set_online(self, online):
        if self.online != online:
            self.online = online
            if self.room is not None:
                if self.seat is not None:
                    if 0 < self.room.state < 999:
                        if self.online:
                            await self.room.send_all({'type': 'room.user.back', 'seat': self.seat}, exclude_user_id=self.id)
                        else:
                            await self.room.send_all({'type': 'room.user.leave', 'seat': self.seat}, exclude_user_id=self.id)
                    elif self.room.state == 0:
                        if not self.online:
                            await self.room.remove_user(self)
                else:
                    if not self.online:
                        await self.room.remove_user(self)

    async def send_data(self, data):
        if self.online:
            from server import send_data as origin_send_data
            await origin_send_data(self.send, data)

    async def send_response(self, request_data, data):
        await self.send_data({**data, 'type': f'response.{request_data["_id"]}'})

    async def send_message(self, *args, **kwargs):
        from server import send_message
        if self.online:
            await send_message(self.send, *args, **kwargs)

    def to_dict(self):
        return {
            'seat': self.seat,
            'name': self.name,
            'online': self.online,
            'state': self.state,
            'is_creator': self.room.creator is self,
        }


class Room:
    def __init__(self, id: str, creator: User, mode=3):
        self.id = id
        self.creator = creator
        self.users = {creator.id: creator}
        self.state = 0
        self.mode = mode
        self.game = None

    @property
    def max_seats(self):
        return 2  # Fox in the Forest is a 2-player game

    @property
    def suit(self):
        return 3  # Represents the 3 suits: Spades, Hearts, Clubs

    def __getitem__(self, item):
        if isinstance(item, str):
            if item in self.users.keys():
                return self.users[item]
        elif isinstance(item, int):
            if item == 0:
                return None
            for user in self.users.values():
                if user.seat == item:
                    return user
        return None

    def __contains__(self, item):
        return item in self.users.keys()

    def add_visitor(self, user):
        user.seat = None
        self.users[user.id] = user

    async def remove_user(self, user):
        if user.seat is not None:
            if self.state == 0:
                del self.users[user.id]
                if len(self.users) == 0:
                    self.creator = None
                else:
                    if self.creator.id == user.id:
                        for i in range(1, self.max_seats + 1):
                            new_creator = self[i]
                            if new_creator is not None:
                                self.creator = new_creator
                                await self.send_all({'type': 'room.creator.quit', 'seat': user.seat, 'new_creator_seat': i})
                                break
                        else:
                            self.creator = None
                            await self.send_all({'type': 'room.creator.quit', 'seat': user.seat, 'new_creator_seat': None})
                    else:
                        await self.send_all({'type': 'room.user.quit', 'seat': user.seat})
        else:
            del self.users[user.id]

    async def add_user(self, user, chosen_seat=None):
        if self.state == 999:
            return
        seats = self.seats
        if self.state == 0 and 0 < len(seats) < self.max_seats:
            if chosen_seat is not None:
                user.seat = chosen_seat
            else:
                for i in range(1, self.max_seats + 1):
                    if i not in seats:
                        user.seat = i
                        break
            self.users[user.id] = user
            await self.send_all({'type': 'room.user.join', 'seat': user.seat, 'user': user.to_dict()}, exclude_user_id=user.id)
        elif self.state == 0 and len(seats) == 0:
            user.seat = chosen_seat or 1
            self.users[user.id] = user
            self.creator = user
            await self.send_all({'type': 'room.user.join', 'seat': user.seat, 'user': user.to_dict(), 'creator': user.seat}, exclude_user_id=user.id)
        else:
            self.add_visitor(user)

    def start_game(self):
        if self.state == 0:
            self.state = 1
            self.game = Game(self, self.suit)

    async def end_game(self):
        if self.state == 1:
            self.state = 999
            await self.send_all({'type': 'room.state.end'})
            for user in self.users.values():
                if user.online:
                    from server import make_data
                    make_data(user.send, {'type': 'server.close', 'code': 1000}, True)

    @property
    def seats(self):
        return {user.seat: user for user in self.users.values() if user.seat is not None}

    async def send_all(self, data, exclude_user_id=None):
        users = [user for user in self.users.values() if user.id != exclude_user_id]
        for user in users:
            await user.send_data(data)

    async def send_players(self, data, exclude_user_id=None):
        users = [user for user in self.users.values() if user.seat is not None and user.id != exclude_user_id]
        for user in users:
            await user.send_data(data)

    async def send_visitors(self, data, exclude_user_id=None):
        users = [user for user in self.users.values() if user.seat is None and user.id != exclude_user_id]
        for user in users:
            await user.send_data(data)

    def to_dict(self):
        return {
            'id': self.id,
            'creator': self.creator and self.creator.seat,
            'players': [self[i].to_dict() if self[i] is not None else None for i in range(0, self.max_seats + 1)],
            'state': self.state,
        }


class Game:
    def __init__(self, room, suit=3):
        self.room = room
        self.state = 1  # 1: Dealing, 2: Playing tricks, 3: Round ended
        self.suit = suit
        self.total = 33  # 33 cards (A-J of Spades, Hearts, Clubs)
        self.deck = []
        self.trump_card = None
        self.trump_suit = None
        self.player_cards = [[] for _ in range(room.max_seats + 1)]
        self.current_trick = []
        self.tricks_won = [0, 0, 0]  # Index 0 unused, 1 and 2 for players
        self.scores = [0, 0, 0]  # Cumulative scores
        self.lead_player = random.randint(1, 2) if room.game is None else 3 - room.game.lead_player
        self.turn = self.lead_player
        self.seven_played = [False, False, False]  # Track 7s for bonus
        self.deliver_cards()

    def card_to_value(self, card):
        """Convert card number to value and suit. Cards 1-11: Spades A-J, 12-22: Hearts A-J, 23-33: Clubs A-J."""
        value = (card - 1) % 11 + 1  # 1=A, 2=2, ..., 11=J
        suit = (card - 1) // 11  # 0=Spades, 1=Hearts, 2=Clubs
        return value, suit

    def suit_name(self, suit):
        return ['spades', 'hearts', 'clubs'][suit]

    def deliver_cards(self):
        self.deck = list(range(1, 34))  # 33 cards
        random.shuffle(self.deck)
        # Deal 13 cards to each player
        self.player_cards[1] = self.deck[:13]
        self.player_cards[2] = self.deck[13:26]
        self.deck = self.deck[26:33]  # 7 cards remain
        # Flip one card as trump
        self.trump_card = self.deck.pop()
        _, self.trump_suit = self.card_to_value(self.trump_card)

    async def reset_game(self):
        self.state = 1
        self.deck.clear()
        self.trump_card = None
        self.trump_suit = None
        for cards in self.player_cards:
            cards.clear()
        self.current_trick.clear()
        self.tricks_won = [0, 0, 0]
        self.lead_player = 3 - self.lead_player  # Swap leader
        self.turn = self.lead_player
        self.seven_played = [False, False, False]
        self.deliver_cards()
        await self.send_game_data({'type': 'game.reset'})

    async def send_game_data(self, data):
        users = [(user, self.to_dict(user)) for user in self.room.users.values()]
        for user, game_data in users:
            await user.send_data({**data, 'game': game_data})

    async def play_card(self, user, card):
        if self.state != 2:
            await user.send_message('游戏未在出牌阶段')
            return
        if self.turn != user.seat:
            await user.send_message('轮到您出牌')
            return
        if card not in self.player_cards[user.seat]:
            await user.send_message('您没有这张牌')
            return

        value, suit = self.card_to_value(card)
        must_follow = False
        if self.current_trick:
            lead_card = self.current_trick[0][1]
            _, lead_suit = self.card_to_value(lead_card)
            # Check J ability: must play highest or A of same suit
            if value == 11 and any(c for c in self.player_cards[user.seat] if self.card_to_value(c)[1] == suit and c != card):
                await user.send_message('您必须出同花色的最大牌或A')
                return
            # Must follow suit if possible
            if any(c for c in self.player_cards[user.seat] if self.card_to_value(c)[1] == lead_suit):
                if suit != lead_suit and suit != self.trump_suit:
                    await user.send_message('您必须跟同花色')
                    return
                must_follow = True

        self.player_cards[user.seat].remove(card)
        self.current_trick.append((user.seat, card))

        # Handle special abilities
        if value == 9:  # 9 is treated as trump suit
            suit = self.trump_suit
        if value == 7:  # Track 7 for bonus
            self.seven_played[user.seat] = True
        if value == 5:  # Draw a card and place one at bottom
            if self.deck:
                drawn_card = self.deck.pop(0)
                self.player_cards[user.seat].append(drawn_card)
                await user.send_data({'type': 'game.draw', 'card': drawn_card})
                # Assume client sends bottom card immediately
                # Placeholder for bottom card logic
        if value == 3:  # Take trump card and replace
            if self.trump_card:
                self.player_cards[user.seat].append(self.trump_card)
                self.trump_card = None  # Client must send new trump card
                await self.send_game_data({'type': 'game.trump.taken', 'seat': user.seat})
        if value == 1:  # Ace: Must lead next trick
            self.lead_player = user.seat

        if len(self.current_trick) == 2:
            await self.resolve_trick()
        else:
            self.turn = 3 - self.turn  # Switch turn
            await self.send_game_data({'type': 'game.play.card', 'seat': user.seat, 'card': card})

    async def place_bottom_card(self, user, card):
        """Handle card placed at bottom after 5."""
        if card not in self.player_cards[user.seat]:
            await user.send_message('无效的牌')
            return
        self.player_cards[user.seat].remove(card)
        self.deck.append(card)
        await self.send_game_data({'type': 'game.bottom.card', 'seat': user.seat})

    async def replace_trump(self, user, card):
        """Handle trump replacement after 3."""
        if card not in self.player_cards[user.seat]:
            await user.send_message('无效的牌')
            return
        self.player_cards[user.seat].remove(card)
        self.trump_card = card
        _, self.trump_suit = self.card_to_value(card)
        await self.send_game_data({'type': 'game.trump.replaced', 'seat': user.seat, 'card': card})

    async def resolve_trick(self):
        card1, card2 = self.current_trick
        _, c1 = card1
        _, c2 = card2
        v1, s1 = self.card_to_value(c1)
        v2, s2 = self.card_to_value(c2)
        if v1 == 9:
            s1 = self.trump_suit
        if v2 == 9:
            s2 = self.trump_suit

        winner = None
        if s1 == s2:
            winner = card1[0] if v1 > v2 else card2[0]
        elif s1 == self.trump_suit:
            winner = card1[0]
        elif s2 == self.trump_suit:
            winner = card2[0]
        else:
            winner = card1[0]  # Follow suit wins

        self.tricks_won[winner] += 1
        self.current_trick.clear()
        self.turn = winner
        self.lead_player = winner

        if not self.player_cards[1] and not self.player_cards[2]:
            await self.end_round()
        else:
            await self.send_game_data({'type': 'game.trick.won', 'seat': winner})

    async def end_round(self):
        self.state = 3
        # Scoring
        for seat in [1, 2]:
            tricks = self.tricks_won[seat]
            if 0 <= tricks <= 3:
                self.scores[seat] += 6
            elif tricks == 4:
                self.scores[seat] += 1
            elif tricks == 5:
                self.scores[seat] += 2
            elif tricks == 6:
                self.scores[seat] += 3
            elif 7 <= tricks <= 9:
                self.scores[seat] += 6
            elif 10 <= tricks <= 13:
                self.scores[seat] += 0
            if self.seven_played[seat]:
                self.scores[seat] += 1
        await self.send_game_data({'type': 'game.round.end', 'scores': self.scores})
        # Auto reset for next round
        await self.reset_game()

    def to_dict(self, user):
        return {
            'state': self.state,
            'total': self.total,
            'deck_size': len(self.deck),
            'trump_card': self.trump_card,
            'trump_suit': self.suit_name(self.trump_suit) if self.trump_suit is not None else None,
            'my_cards': self.player_cards[user.seat] if user.seat is not None else [],
            'current_trick': self.current_trick,
            'tricks_won': self.tricks_won,
            'scores': self.scores,
            'lead_player': self.lead_player,
            'turn': self.turn,
        }