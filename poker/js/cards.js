(function() {
const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const SUIT_SYMBOLS = {
  's': '♠',
  'h': '♥',
  'd': '♦',
  'c': '♣'
};

const POKER_RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// 获取完整的一副牌 (52张)
function getDeck() {
  const deck = [];
  for (let s of SUITS) {
    for (let r of RANKS) {
      deck.push(r + s);
    }
  }
  return deck;
}

// 格式化卡牌用于显示
function formatCard(cardStr) {
  if (!cardStr || cardStr.length !== 2) return null;
  const rank = cardStr[0];
  const suit = cardStr[1];
  return {
    id: cardStr,
    rank: rank === 'T' ? '10' : rank,
    suit: suit,
    symbol: SUIT_SYMBOLS[suit],
    colorClass: `suit-${suit}` // 用于对应 CSS 中的颜色
  };
}

window.PokerCards = {
  SUITS,
  RANKS,
  SUIT_SYMBOLS,
  RANK_VALUES: POKER_RANK_VALUES,
  getDeck,
  formatCard
};
})();
