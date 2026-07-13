/**
 * 界面交互与状态管理 (单对手 + 键盘选牌)
 */

document.addEventListener('DOMContentLoaded', () => {
  const { formatCard, SUITS, RANKS, SUIT_SYMBOLS } = window.PokerCards;
  const { calculateWinRate } = window.PokerCalculator;

  // 状态管理
  const state = {
    heroCards: [null, null],
    villainCards: [null, null],
    boardCards: [null, null, null, null, null],
    activeType: null, // 初始不选中，隐藏键盘
    activeIndex: -1
  };

  const deck = window.PokerCards.getDeck();

  // DOM 元素
  const elements = {
    picker: document.getElementById('card-picker'),
    btnCloseKb: document.getElementById('btn-close-kb'),
    fullKeyboard: document.getElementById('full-keyboard'),
    heroSlots: document.querySelectorAll('.hero-cards .card-slot'),
    villainSlots: document.querySelectorAll('.villain-cards .card-slot'),
    boardSlots: document.querySelectorAll('.board-cards .card-slot'),
    btnCalc: document.getElementById('btn-calculate'),
    btnReset: document.getElementById('btn-reset'),
    btnSwap: document.getElementById('btn-swap'),
    valWin: document.getElementById('val-win'),
    valTie: document.getElementById('val-tie'),
    valLose: document.getElementById('val-lose'),
    valOuts: document.getElementById('val-outs'),
    specificOutsContainer: document.getElementById('specific-outs-container'),
    specificOutsList: document.getElementById('specific-outs-list')
  };

  // 获取所有已被选中的牌
  function getUsedCards() {
    return new Set([
      ...state.heroCards.filter(Boolean),
      ...state.villainCards.filter(Boolean),
      ...state.boardCards.filter(Boolean)
    ]);
  }

  // 渲染虚拟键盘 (4x13)
  function renderKeyboard() {
    elements.fullKeyboard.innerHTML = '';
    const usedCards = getUsedCards();

    SUITS.forEach(suit => {
      const row = document.createElement('div');
      row.className = 'keyboard-row';
      
      RANKS.forEach(rank => {
        const cardStr = rank + suit;
        const cardData = formatCard(cardStr);
        const isUsed = usedCards.has(cardStr);

        const btn = document.createElement('button');
        // 已使用的牌添加 disabled 类，使其变暗且不可点击
        btn.className = `keyboard-btn ${cardData.colorClass} ${isUsed ? 'disabled' : ''}`;
        btn.dataset.card = cardStr;
        btn.innerHTML = `<span>${cardData.symbol}</span><span>${cardData.rank}</span>`;
        
        btn.onclick = (e) => {
          e.stopPropagation();
          if (!isUsed) {
            onPickCard(cardStr);
            renderKeyboard();
          }
        };
        row.appendChild(btn);
      });
      elements.fullKeyboard.appendChild(row);
    });
  }

  // 渲染槽位
  function renderSlots() {
    // 1. 渲染玩家手牌
    elements.heroSlots.forEach((slot, index) => {
      slot.className = 'card-slot' + (state.activeType === 'hero' && state.activeIndex === index ? ' active' : '');
      const card = state.heroCards[index];
      slot.innerHTML = card ? createCardHTML(card) : '';
      if (card) {
        slot.appendChild(createRemoveBtn(() => removeCard('hero', index)));
      }
      slot.onclick = (e) => {
        e.stopPropagation();
        activateSlot('hero', index);
      };
    });

    // 2. 渲染对手手牌
    elements.villainSlots.forEach((slot, index) => {
      slot.className = 'card-slot' + (state.activeType === 'villain' && state.activeIndex === index ? ' active' : '');
      const card = state.villainCards[index];
      slot.innerHTML = card ? createCardHTML(card) : '';
      if (card) {
        slot.appendChild(createRemoveBtn(() => removeCard('villain', index)));
      }
      slot.onclick = (e) => {
        e.stopPropagation();
        activateSlot('villain', index);
      };
    });

    // 3. 渲染公共牌
    elements.boardSlots.forEach((slot, index) => {
      slot.className = 'card-slot' + (state.activeType === 'board' && state.activeIndex === index ? ' active' : '');
      const card = state.boardCards[index];
      slot.innerHTML = card ? createCardHTML(card) : '';
      if (card) {
        slot.appendChild(createRemoveBtn(() => removeCard('board', index)));
      }
      slot.onclick = (e) => {
        e.stopPropagation();
        activateSlot('board', index);
      };
    });

    // 键盘显示/隐藏控制
    if (state.activeType) {
      elements.picker.classList.add('show');
    } else {
      elements.picker.classList.remove('show');
    }

    renderKeyboard();
  }

  function closeKeyboard() {
    state.activeType = null;
    state.activeIndex = -1;
    renderSlots();
  }

  function createCardHTML(cardStr) {
    const cardData = formatCard(cardStr);
    return `<div class="card-display ${cardData.colorClass}">
      <span>${cardData.rank}</span>
      <span>${cardData.symbol}</span>
    </div>`;
  }

  function createRemoveBtn(onClickCallback) {
    const btn = document.createElement('div');
    btn.className = 'card-remove';
    btn.innerHTML = '×';
    btn.onclick = (e) => {
      e.stopPropagation();
      onClickCallback();
    };
    return btn;
  }

  function activateSlot(type, index) {
    state.activeType = type;
    state.activeIndex = index;
    renderSlots();
  }

  // 检查是否允许计算并更新按钮状态
  function updateCalculateButtonState() {
    const validHoles = state.heroCards.filter(Boolean);
    const validVillains = state.villainCards.filter(Boolean);
    
    // 玩家和对手都必须选满 2 张牌才能计算
    if (validHoles.length === 2 && validVillains.length === 2) {
      elements.btnCalc.disabled = false;
      elements.btnCalc.textContent = '开始计算';
    } else {
      elements.btnCalc.disabled = true;
      elements.btnCalc.textContent = '请补全双方手牌';
    }
  }

  function removeCard(type, index) {
    if (type === 'hero') {
      state.heroCards[index] = null;
    } else if (type === 'villain') {
      state.villainCards[index] = null;
    } else {
      state.boardCards[index] = null;
    }
    activateSlot(type, index);
    resetResults();
    updateCalculateButtonState();
    updateUrl();
  }

  function autoAdvanceSlot() {
    // 固定的槽位顺序
    const order = [
      { type: 'hero', index: 0 },
      { type: 'hero', index: 1 },
      { type: 'villain', index: 0 },
      { type: 'villain', index: 1 },
      { type: 'board', index: 0 },
      { type: 'board', index: 1 },
      { type: 'board', index: 2 },
      { type: 'board', index: 3 },
      { type: 'board', index: 4 }
    ];

    // 找到当前选中的槽位在顺序中的位置
    let currentIndex = -1;
    for (let i = 0; i < order.length; i++) {
      if (order[i].type === state.activeType && order[i].index === state.activeIndex) {
        currentIndex = i;
        break;
      }
    }

    // 如果当前有选中的槽位，切换到下一个
    if (currentIndex !== -1) {
      if (currentIndex + 1 < order.length) {
        let next = order[currentIndex + 1];
        activateSlot(next.type, next.index);
      } else {
        // 已经是最后一个槽位，填完后自动关闭键盘
        closeKeyboard();
      }
    } else {
      // 异常情况，直接关闭
      closeKeyboard();
    }
  }

  function onPickCard(cardStr) {
    if (!state.activeType) return;
    
    if (state.activeType === 'hero') {
      state.heroCards[state.activeIndex] = cardStr;
    } else if (state.activeType === 'villain') {
      state.villainCards[state.activeIndex] = cardStr;
    } else if (state.activeType === 'board') {
      state.boardCards[state.activeIndex] = cardStr;
    }
    
    autoAdvanceSlot();
    resetResults();
    updateCalculateButtonState();
    updateUrl();
  }

  function resetResults() {
    elements.valWin.textContent = '--%';
    elements.valTie.textContent = '--%';
    elements.valLose.textContent = '--%';
    elements.valOuts.textContent = '--';
    elements.specificOutsContainer.style.display = 'none';
    elements.specificOutsList.innerHTML = '';
  }

  function updateUrl() {
    const params = new URLSearchParams();
    
    const hero = state.heroCards.filter(Boolean).join('');
    if (hero) params.set('hero', hero);
    
    const villain = state.villainCards.filter(Boolean).join('');
    if (villain) params.set('villain', villain);
    
    const board = state.boardCards.filter(Boolean).join('');
    if (board) params.set('board', board);
    
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', newUrl);
  }

  function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    
    const heroStr = params.get('hero');
    if (heroStr) {
      for (let i = 0; i < heroStr.length; i += 2) {
        if (i/2 < 2) state.heroCards[i/2] = heroStr.slice(i, i+2);
      }
    }
    
    const villainStr = params.get('villain');
    if (villainStr) {
      for (let i = 0; i < villainStr.length; i += 2) {
        if (i/2 < 2) state.villainCards[i/2] = villainStr.slice(i, i+2);
      }
    }
    
    const boardStr = params.get('board');
    if (boardStr) {
      for (let i = 0; i < boardStr.length; i += 2) {
        if (i/2 < 5) state.boardCards[i/2] = boardStr.slice(i, i+2);
      }
    }
    
    updateCalculateButtonState();
  }

  function doCalculate() {
    const validHoles = state.heroCards.filter(Boolean);
    const validVillains = state.villainCards.filter(Boolean);
    const validBoards = state.boardCards.filter(Boolean);

    // 双重保险，防止强制执行
    if (validHoles.length !== 2 || validVillains.length !== 2) {
      return;
    }

    elements.btnCalc.disabled = true;
    elements.btnCalc.textContent = '穷举计算中...';

    // 使用 setTimeout 避免阻塞 UI 渲染
    setTimeout(() => {
      // 传入穷举算法
      const result = calculateWinRate(validHoles, validVillains, validBoards, deck);
      
      elements.valWin.textContent = result.winRate.toFixed(1) + '%';
      elements.valTie.textContent = result.tieRate.toFixed(1) + '%';
      elements.valLose.textContent = result.loseRate.toFixed(1) + '%';
      
      // 只要玩家当前处于落后状态，就显示补牌(Outs)数
      if (result.isBehind) {
        elements.valOuts.textContent = result.outs.length;
        renderSpecificOuts(result.outs);
      } else {
        elements.valOuts.textContent = '--';
        elements.specificOutsContainer.style.display = 'none';
      }

      updateCalculateButtonState();
    }, 50);
  }

  function renderSpecificOuts(outsArray) {
    elements.specificOutsList.innerHTML = '';
    if (outsArray && outsArray.length > 0) {
      const renderOutItem = (outItem) => {
        const row = document.createElement('div');
        row.className = 'out-row';
        
        let cardsHtml = '<div class="out-cards">';
        outItem.cards.forEach(cardStr => {
          const cardData = formatCard(cardStr);
          cardsHtml += `<div class="out-card ${cardData.colorClass}"><span>${cardData.symbol}</span><span>${cardData.rank}</span></div>`;
        });
        cardsHtml += '</div>';

        const descHtml = `<div class="out-desc"><strong>${outItem.heroRank}</strong> vs <strong>${outItem.villainRank}</strong></div>`;

        row.innerHTML = cardsHtml + descHtml;
        return row;
      };

      let currentRenderedCount = 0;
      let btnExpand = null;

      const renderNextBatch = () => {
        const nextBatch = outsArray.slice(currentRenderedCount, currentRenderedCount + 1000);
        const fragment = document.createDocumentFragment();
        nextBatch.forEach(outItem => {
          fragment.appendChild(renderOutItem(outItem));
        });
        
        // 如果按钮存在，把它先移除，再插入新内容，然后再把它加到最后
        if (btnExpand && btnExpand.parentNode) {
          btnExpand.remove();
        }
        
        elements.specificOutsList.appendChild(fragment);
        currentRenderedCount += nextBatch.length;

        // 如果还没渲染完，继续显示按钮并更新文案
        if (currentRenderedCount < outsArray.length) {
          if (!btnExpand) {
            btnExpand = document.createElement('button');
            btnExpand.className = 'btn-expand-more';
            btnExpand.onclick = renderNextBatch;
          }
          btnExpand.innerHTML = `... 以及其他 <strong>${outsArray.length - currentRenderedCount}</strong> 种组合，点击继续展开 ${Math.min(outsArray.length - currentRenderedCount, 1000)} 条`;
          elements.specificOutsList.appendChild(btnExpand);
        }
      };

      // 首次渲染
      renderNextBatch();
      elements.specificOutsContainer.style.display = 'flex';
    } else {
      elements.specificOutsContainer.style.display = 'none';
    }
  }

  function doReset() {
    state.heroCards = [null, null];
    state.villainCards = [null, null];
    state.boardCards = [null, null, null, null, null];
    closeKeyboard();
    resetResults();
    updateCalculateButtonState();
    updateUrl();
  }

  function doSwap(e) {
    if (e) e.stopPropagation();
    
    const temp = [...state.heroCards];
    state.heroCards = [...state.villainCards];
    state.villainCards = temp;
    
    // 如果当前焦点在英雄或对手的卡槽上，根据交换的逻辑更新焦点类型
    if (state.activeType === 'hero') {
      state.activeType = 'villain';
    } else if (state.activeType === 'villain') {
      state.activeType = 'hero';
    }
    
    renderSlots();
    resetResults();
    updateCalculateButtonState();
    updateUrl();
  }

  // 事件绑定
  elements.btnCalc.addEventListener('click', doCalculate);
  elements.btnReset.addEventListener('click', doReset);
  elements.btnSwap.addEventListener('click', doSwap);
  elements.btnCloseKb.addEventListener('click', (e) => {
    e.stopPropagation();
    closeKeyboard();
  });

  // 为了防止点击键盘本身（如键盘按钮之间的空隙）导致键盘关闭
  elements.picker.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 全局点击事件处理：实现点击空白处收起键盘
  document.addEventListener('click', (e) => {
    // 如果键盘没打开，无视
    if (!state.activeType) return;
    
    // 如果点击的是重置按钮，无视（重置按钮会重新激活第一个卡槽）
    if (e.target.closest('#btn-reset')) return;
    
    // 点击其它任何地方（包括背景、结果区、计算按钮等），关闭键盘
    closeKeyboard();
  });

  // 初始渲染
  loadFromUrl();
  renderKeyboard();
  renderSlots();
  updateCalculateButtonState();
});
