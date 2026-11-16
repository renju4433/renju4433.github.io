(function () {
  'use strict';

  var STYLE_ID = 'rp-platform-style';
  var CSS = [
    '.rp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--mint2,#f7faf8);border:1px solid var(--line,#e6dfd0);font:400 13px/1.4 var(--sans,system-ui,sans-serif)}',
    '.rp-field{display:inline-flex;align-items:center;gap:6px;min-width:0}',
    '.rp-lbl{font-size:12px;color:var(--ink3,#6c766f);white-space:nowrap}',
    '.rp-sel{font:500 13px/1.3 var(--sans,system-ui,sans-serif);color:var(--ink,#17201a);background:var(--card,#fff);border:1px solid var(--line,#dfd8c8);border-radius:7px;padding:4px 8px;max-width:340px;cursor:pointer}',
    '.rp-sel:focus{outline:none;border-color:var(--green,#0d4736)}',
    '.rp-rule{display:inline-block;padding:3px 9px;border-radius:999px;background:var(--mint,#e9f3ee);color:var(--green,#0d4736);font-size:12px;font-weight:600;white-space:nowrap}',
    '.rp-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto;align-items:center}',
    '.rp-tab{display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid var(--line,#e6dfd0);color:var(--ink3,#5c665f);text-decoration:none;font-size:12.5px;transition:all .15s}',
    '.rp-tab:hover{border-color:var(--green,#0d4736);color:var(--green,#0d4736)}',
    '.rp-tab.on{background:var(--green,#0d4736);border-color:var(--green,#0d4736);color:#fff;font-weight:600}',
    '@media (max-width:720px){.rp-bar{padding:8px 10px;gap:8px}.rp-sel{max-width:220px}.rp-tabs{margin-left:0;width:100%}}',
    '@media (prefers-color-scheme:dark){.rp-bar{background:#18211d;border-color:#2a322e}.rp-sel{background:#121715;color:#e8ece7;border-color:#2a322e}.rp-rule{background:#1b3a2e;color:#93d3b6}.rp-tab{border-color:#2a322e;color:#9aa79f}.rp-tab.on{background:#2c5b49;border-color:#2c5b49;color:#fff}}'
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

  window.RenjuPlatform = {
    init: function (opts) {
      injectStyle();
      var indexUrl = opts.indexUrl || './api/index.json';
      var apiRoot = opts.apiRoot || './api/';
      var page = opts.page || 'matches'; // 'matches' | 'standings' | 'metrics'
      var pages = opts.pages || {
        matches: 'index.html',
        standings: 'standings.html',
        metrics: 'metrics.html',
        predict: 'predict.html'
      };

      var hd = document.querySelector('.hd');
      var bar = document.createElement('div');
      bar.className = 'rp-bar';
      bar.id = 'rp-bar';
      if (hd) hd.appendChild(bar);

      var qs = new URLSearchParams(location.search);
      var reqSlug = qs.get('t') || qs.get('slug') || '';
      var reqRound = parseInt(qs.get('r') || '0', 10);
      if (!(reqRound > 0)) reqRound = 0;

      fetchJson(indexUrl).then(function (idxData) {
        var tours = idxData.tournaments || [];
        if (!tours.length) throw new Error('索引中暂无赛事');

        // 按赛事分组（同赛事不同组别聚合在一起）
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

        function renderBar() {
          var curEvKey = eventKey(curTour);
          var curEv = eventMap[curEvKey] || events[0];
          var evOpts = events.map(function (ev) {
            return '<option value="' + esc(ev.key) + '"' + (ev.key === curEvKey ? ' selected' : '') + '>' + esc(ev.label) + '</option>';
          }).join('');
          var grpOpts = curEv.items.map(function (it) {
            var gn = it.group || '公开组';
            return '<option value="' + esc(it.slug) + '"' + (it.slug === curTour.slug ? ' selected' : '') + '>' + esc(gn) + '</option>';
          }).join('');

          var qSuffix = '?t=' + encodeURIComponent(curTour.slug) + '&r=' + encodeURIComponent(curRound);
          var tOnly = '?t=' + encodeURIComponent(curTour.slug);

          bar.innerHTML =
            '<div class="rp-field"><span class="rp-lbl">赛事</span><select class="rp-sel" id="rp-event">' + evOpts + '</select></div>' +
            '<div class="rp-field"><span class="rp-lbl">组别</span><select class="rp-sel" id="rp-group">' + grpOpts + '</select></div>' +
            (curTour.rule ? '<span class="rp-rule">' + esc(curTour.rule) + '</span>' : '') +
            '<div class="rp-tabs">' +
              '<a class="rp-tab' + (page === 'matches' ? ' on' : '') + '" href="' + pages.matches + qSuffix + '">对阵与预测</a>' +
              '<a class="rp-tab' + (page === 'standings' ? ' on' : '') + '" href="' + pages.standings + qSuffix + '">积分与名次</a>' +
              '<a class="rp-tab' + (page === 'metrics' ? ' on' : '') + '" href="' + pages.metrics + tOnly + '">模型评估</a>' +
              (pages.predict ? '<a class="rp-tab" href="' + pages.predict + '">自定义预测 / API</a>' : '') +
            '</div>';

          document.getElementById('rp-event').addEventListener('change', function () {
            var ev = eventMap[this.value];
            if (!ev || !ev.items.length) return;
            selectState(ev.items[0], latestRoundOf(ev.items[0]));
          });
          document.getElementById('rp-group').addEventListener('change', function () {
            var slug = this.value;
            var found = tours.filter(function (x) { return x.slug === slug; })[0];
            if (!found) return;
            var nextR = hasRound(found, curRound) ? curRound : latestRoundOf(found);
            selectState(found, nextR);
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
          renderBar();
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
