(function () {
  'use strict';

  var STYLE_ID = 'rp-platform-style';
  var CSS = [
    '#ttl.rp-click,#grp.rp-click{cursor:pointer;position:relative;user-select:none}',
    '#ttl.rp-click:hover{opacity:.85}',
    '#ttl.rp-click::after{content:" ▾";font-size:.62em;color:var(--ink3,#6c766f);vertical-align:middle;font-family:var(--sans,system-ui,sans-serif)}',
    '#grp.rp-click{display:inline-block;padding:1px 7px;border-radius:6px;transition:background .15s}',
    '#grp.rp-click:hover{background:var(--mint,#e9f3ee);color:var(--green,#0d4736)}',
    '#grp.rp-click::after{content:" ▾";font-size:.85em;opacity:.7}',
    '.rp-menu{position:fixed;z-index:9999;min-width:220px;max-width:min(92vw,420px);max-height:60vh;overflow-y:auto;background:var(--card,#fff);border:1px solid var(--line,#e6dfd0);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.14);padding:6px}',
    '.rp-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;border:0;background:transparent;color:var(--ink,#17201a);font:400 13.5px/1.45 var(--sans,system-ui,sans-serif);padding:7px 10px;border-radius:7px;cursor:pointer}',
    '.rp-item:hover{background:var(--mint2,#f4f8f6);color:var(--green,#0d4736)}',
    '.rp-item.on{background:var(--mint,#e9f3ee);color:var(--green,#0d4736);font-weight:600}',
    '.rp-item-sub{font-size:11.5px;color:var(--ink3,#6c766f);white-space:nowrap}',
    '@media (prefers-color-scheme:dark){.rp-menu{background:#171c1a;border-color:#2a322e;box-shadow:0 10px 28px rgba(0,0,0,.45)}.rp-item{color:#e8ece7}.rp-item:hover{background:#1e2823;color:#93d3b6}.rp-item.on{background:#1b3a2e;color:#93d3b6}#grp.rp-click:hover{background:#1d2a25;color:#93d3b6}}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function eventKey(t) {
    return (t.year ? t.year + ' · ' : '') + (t.event || t.name || t.slug || t.id);
  }

  function latestRoundOf(t) {
    var rs = (t && t.rounds) || [];
    if (!rs.length) return 1;
    var fin = rs.filter(function (x) { return typeof x === 'object' && x.is_finished; });
    var pick = fin.length ? fin[fin.length - 1] : rs[rs.length - 1];
    return typeof pick === 'object' ? pick.round : pick;
  }

  function hasRound(t, rnd) {
    var rs = (t && t.rounds) || [];
    for (var i = 0; i < rs.length; i++) {
      var r = typeof rs[i] === 'object' ? rs[i].round : rs[i];
      if (r === rnd) return true;
    }
    return false;
  }

  var openMenu = null;
  function closeMenu() {
    if (openMenu && openMenu.parentNode) openMenu.parentNode.removeChild(openMenu);
    openMenu = null;
  }
  document.addEventListener('click', function (e) {
    if (!openMenu) return;
    if (openMenu.contains(e.target)) return;
    var ttl = document.getElementById('ttl');
    var grp = document.getElementById('grp');
    if ((ttl && ttl.contains(e.target)) || (grp && grp.contains(e.target))) return;
    closeMenu();
  });

  function showMenu(anchor, items, onPick) {
    closeMenu();
    var rect = anchor.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.className = 'rp-menu';
    menu.innerHTML = items.map(function (it, idx) {
      return '<button type="button" class="rp-item' + (it.active ? ' on' : '') + '" data-i="' + idx + '">' +
        '<span>' + esc(it.label) + '</span>' +
        (it.sub ? '<span class="rp-item-sub">' + esc(it.sub) + '</span>' : '') +
      '</button>';
    }).join('');
    document.body.appendChild(menu);
    var top = Math.min(window.innerHeight - menu.offsetHeight - 12, rect.bottom + 6);
    var left = Math.max(12, Math.min(window.innerWidth - menu.offsetWidth - 12, rect.left));
    menu.style.top = Math.max(12, top) + 'px';
    menu.style.left = left + 'px';
    Array.prototype.forEach.call(menu.querySelectorAll('.rp-item'), function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-i'), 10);
        closeMenu();
        onPick(items[idx]);
      });
    });
    openMenu = menu;
  }

  window.RenjuPlatform = {
    init: function (opts) {
      injectStyle();
      var indexUrl = opts.indexUrl || './api/index.json';
      var apiRoot = opts.apiRoot || './api/';
      var page = opts.page || 'matches';

      var qs = new URLSearchParams(location.search);
      var reqSlug = qs.get('t') || qs.get('slug') || '';
      var reqRound = parseInt(qs.get('r') || '0', 10);
      if (!(reqRound > 0)) reqRound = 0;

      fetchJson(indexUrl).then(function (idxData) {
        var tours = idxData.tournaments || [];
        if (!tours.length) throw new Error('索引中暂无赛事');

        var events = [];
        var eventMap = {};
        tours.forEach(function (t) {
          var key = eventKey(t);
          if (!eventMap[key]) {
            eventMap[key] = { key: key, label: (t.year ? '[' + t.year + '] ' : '') + (t.event || t.name), items: [] };
            events.push(eventMap[key]);
          }
          eventMap[key].items.push(t);
        });

        var curTour = tours[0];
        if (reqSlug) {
          for (var i = 0; i < tours.length; i++) {
            if (tours[i].slug === reqSlug || tours[i].id === reqSlug) {
              curTour = tours[i];
              break;
            }
          }
        }
        var curRound = (reqRound > 0 && hasRound(curTour, reqRound)) ? reqRound : latestRoundOf(curTour);

        var ttlEl = document.getElementById('ttl');
        var grpEl = document.getElementById('grp');
        if (ttlEl) {
          ttlEl.classList.add('rp-click');
          ttlEl.title = '点击切换赛事';
          ttlEl.addEventListener('click', function () {
            var curEvKey = eventKey(curTour);
            showMenu(ttlEl, events.map(function (ev) {
              var hasPred = ev.items.some(function (x) {
                return (x.rounds || []).some(function (r) { return r.predicted > 0; });
              });
              return {
                key: ev.key,
                label: ev.label,
                sub: ev.items.length > 1 ? (ev.items.length + ' 组别') : (hasPred ? '' : '无预测'),
                active: ev.key === curEvKey,
                ev: ev
              };
            }), function (picked) {
              var nextTour = picked.ev.items[0];
              selectState(nextTour, latestRoundOf(nextTour));
            });
          });
        }
        if (grpEl) {
          grpEl.classList.add('rp-click');
          grpEl.title = '点击切换组别';
          grpEl.addEventListener('click', function () {
            var curEv = eventMap[eventKey(curTour)] || events[0];
            showMenu(grpEl, curEv.items.map(function (it) {
              return {
                label: it.group || '公开组',
                sub: it.rule || '',
                active: it.slug === curTour.slug,
                tour: it
              };
            }), function (picked) {
              var nextR = hasRound(picked.tour, curRound) ? curRound : latestRoundOf(picked.tour);
              selectState(picked.tour, nextR);
            });
          });
        }

        function syncUrl() {
          if (!history.replaceState) return;
          var u = new URL(location.href);
          u.searchParams.set('t', curTour.slug);
          if (page !== 'metrics') u.searchParams.set('r', curRound);
          else u.searchParams.delete('r');
          history.replaceState(null, '', u.toString());
        }

        function selectState(tour, rnd) {
          curTour = tour;
          curRound = rnd;
          syncUrl();
          opts.onLoad({
            slug: curTour.slug,
            round: curRound,
            tournament: curTour,
            tournaments: tours,
            apiBase: apiRoot + curTour.slug + '/',
            setRound: function (r) {
              if (r !== curRound) selectState(curTour, r);
            }
          });
        }

        selectState(curTour, curRound);
      }).catch(function (err) {
        if (opts.onError) opts.onError(err);
      });
    }
  };
})();
