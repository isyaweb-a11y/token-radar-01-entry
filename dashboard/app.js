// Token Launch Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders three views of one dataset: the ranked pre-token board, the live-token comparison set
// the model's multiples are priced from, and the method, with every category anchor printed.
// No network: every byte it shows arrived in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model;

  var state = { view: 'board', q: '', category: 'all', chain: 'all', watch: false, sort: 'rank', dir: 1, selected: null };

  // Deep links, so a reader (and a screenshot) can land on one exact view: #p=<slug> opens a
  // protocol, #live and #method pick a view, #watch=1, #cat=<category>, #q=<text> set filters.
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var k = kv[0];
      var v = decodeURIComponent(kv.slice(1).join('=') || '');
      if (k === 'p' && v) { state.selected = v; state.view = 'board'; }
      else if (k === 'live') state.view = 'live';
      else if (k === 'method') state.view = 'method';
      else if (k === 'watch') state.watch = v !== '0';
      else if (k === 'cat' && v) state.category = v;
      else if (k === 'q') state.q = v;
    });
  }
  function writeHash() {
    var parts = [];
    if (state.view === 'live') parts.push('live');
    if (state.view === 'method') parts.push('method');
    if (state.watch) parts.push('watch=1');
    if (state.category !== 'all') parts.push('cat=' + encodeURIComponent(state.category));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.selected) parts.push('p=' + encodeURIComponent(state.selected));
    var h = parts.join('&');
    if (window.location.hash.replace(/^#/, '') !== h) {
      try { history.replaceState(null, '', h ? '#' + h : window.location.pathname + window.location.search); } catch (e) { /* file pages */ }
    }
  }

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    return Math.max(0, Math.round(days)) + ' days';
  }
  function fmtMult(n) { return n.toFixed(2) + 'x'; }

  // The model, recomputed in the page from the row's own snapshot figures and the anchors in
  // data.js: if this number and board.json ever disagreed, the detail view would show it.
  function impliedOf(row) {
    var growth = Math.min(M.growth_cap, Math.max(M.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = Math.max(0.2, 1 + (growth / 100) * M.growth_weight);
    var age = row.age_days === null ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    var extra = Math.min(Math.max(row.chains.length - 1, 0), M.breadth_max_extra_chains);
    var breadth = 1 + extra * M.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function header() {
    var stats = [
      [String(DATA.board_size), 'pre-token protocols ranked'],
      [String(DATA.watchlist_size) + ' / ' + String(DATA.watchlist_size), 'watchlist covered'],
      [String(DATA.global_comps), 'traded tokens priced as comps'],
      [fmtMult(DATA.global_multiple), 'global median value / TVL'],
    ];
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', text: 'RADAR' }),
        el('h1', { text: 'Token Launch Radar' })),
      el('p', { class: 'tagline' },
        'Protocols that record no token yet, ranked by what a token would be worth if each one\'s record stayed as it is. ',
        el('strong', { text: 'The multiple is the market\'s own: ' }),
        'the median market-cap-to-TVL of the traded tokens in each category, shrunk toward the global median. Growth, years run tokenless and chain breadth adjust it. Every row carries its farm plan. Snapshot of ' + DATA.as_of + '.'),
      el('div', { class: 'stats' }, ...stats.map(function (s) {
        return el('div', { class: 'stat' }, el('b', { text: s[0] }), el('span', { text: s[1] }));
      })));
  }

  function tabs() {
    function tab(id, label) {
      return el('button', {
        type: 'button', 'aria-selected': state.view === id ? 'true' : 'false',
        onclick: function () { state.view = id; state.selected = null; render(); },
      }, label);
    }
    return el('nav', { class: 'tabs' }, tab('board', 'Pre-token board'), tab('live', 'Live tokens (the comps)'), tab('method', 'Method & anchors'));
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
  }

  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    implied: function (a, b) { return a.implied_value_usd - b.implied_value_usd; },
    tvl: function (a, b) { return a.tvl_usd - b.tvl_usd; },
    change: function (a, b) { return (a.change_7d === null ? -1e18 : a.change_7d) - (b.change_7d === null ? -1e18 : b.change_7d); },
    age: function (a, b) { return (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days); },
    multiple: function (a, b) { return a.category_multiple - b.category_multiple; },
  };

  function boardView() {
    var frag = document.createDocumentFragment();
    var search = el('input', { type: 'search', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; refreshTable(); writeHash(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      ...categories().map(function (c) { return el('option', { value: c, text: c }); }));
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; refreshTable(); writeHash(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      ...chains().map(function (c) { return el('option', { value: c, text: c }); }));
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; refreshTable(); writeHash(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watchonly' });
    watchBox.checked = state.watch;
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; refreshTable(); writeHash(); });
    var count = el('span', { class: 'count', id: 'rowcount' });
    frag.appendChild(el('div', { class: 'controls' },
      search, catSel, chainSel,
      el('label', { class: 'toggle', for: 'watchonly' }, watchBox, 'Watchlist only'),
      count));
    var holder = el('div', { id: 'tableholder' });
    frag.appendChild(holder);
    frag._fill = function () { fillTable(holder, count); };
    return frag;
  }

  function refreshTable() {
    var holder = document.getElementById('tableholder');
    var count = document.getElementById('rowcount');
    if (holder && count) fillTable(holder, count);
  }

  function fillTable(holder, count) {
    var rows = filtered().slice().sort(SORTS[state.sort]);
    if (state.dir < 0) rows.reverse();
    count.textContent = rows.length + ' of ' + DATA.board_size + ' protocols';
    holder.textContent = '';
    if (rows.length === 0) {
      holder.appendChild(el('p', { class: 'empty', text: 'No protocol matches these filters. Loosen one and the board fills again.' }));
      return;
    }
    function th(label, key, cls) {
      var attrs = { class: (cls || '') + (key ? ' sortable' : '') };
      var node = el('th', attrs, label);
      if (key) {
        if (state.sort === key) node.appendChild(el('span', { class: 'dir', text: state.dir > 0 ? ' ^' : ' v' }));
        node.addEventListener('click', function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
          refreshTable();
        });
      }
      return node;
    }
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        th('#', 'rank'), th('Protocol'), th('Chains'), th('TVL', 'tvl', 'num'),
        th('7d %', 'change', 'num'), th('Tokenless for', 'age'), th('Multiple', 'multiple', 'num'), th('Implied value', 'implied', 'num'))),
      el('tbody', {}, ...rows.map(function (r) {
        var pctCls = r.change_7d === null ? 'pct-flat' : r.change_7d > 0 ? 'pct-up' : r.change_7d < 0 ? 'pct-down' : 'pct-flat';
        var chainText = r.chains.slice(0, 3).join(', ');
        var tr = el('tr', { class: state.selected === r.slug ? 'selected' : '' },
          el('td', { class: 'rank num', text: String(r.rank) }),
          el('td', { class: 'proto' },
            el('b', { text: r.name }),
            r.watchlist ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null,
            el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' · ' + r.slug })),
          el('td', { class: 'chains' }, chainText, r.chains.length > 3 ? el('span', { class: 'more', text: ' +' + (r.chains.length - 3) }) : null),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num ' + pctCls, text: fmtPct(r.change_7d) }),
          el('td', { text: fmtAge(r.age_days) }),
          el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
          el('td', { class: 'num implied', text: fmtUsd(r.implied_value_usd) }));
        tr.addEventListener('click', function () { state.selected = r.slug; render(); });
        return tr;
      })));
    holder.appendChild(table);
  }

  function liveView() {
    var frag = document.createDocumentFragment();
    frag.appendChild(el('p', { class: 'tagline' },
      'These protocols\' tokens already trade, so the radar never ranks them. They are here because they price the board: each one\'s market-cap-to-TVL ratio is a comparison behind its category\'s multiple.'));
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Protocol' }), el('th', { text: 'Token' }), el('th', { text: 'Category' }),
        el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Value / TVL' }), el('th', { class: 'num', text: '7d %' }))),
      el('tbody', {}, ...DATA.live.map(function (r) {
        var pctCls = r.change_7d === null ? 'pct-flat' : r.change_7d > 0 ? 'pct-up' : r.change_7d < 0 ? 'pct-down' : 'pct-flat';
        return el('tr', {},
          el('td', { class: 'proto' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug })),
          el('td', { text: r.symbol || '—' }),
          el('td', { text: r.category || 'Uncategorised' }),
          el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num', text: r.mcap_tvl === null ? 'n/a' : fmtMult(r.mcap_tvl) }),
          el('td', { class: 'num ' + pctCls, text: fmtPct(r.change_7d) }));
      })));
    frag.appendChild(table);
    return frag;
  }

  function methodView() {
    var frag = document.createDocumentFragment();
    var box = el('div', { class: 'method' });
    box.appendChild(el('p', {},
      el('b', { text: 'What the board claims. ' }),
      'Each row\'s implied value is what a token would be worth if the protocol\'s record stayed exactly as the snapshot has it. It is this entry\'s own claim, derived only from the snapshot\'s figures: no outside price, no list of favoured names, and no guess about whether or when a token is issued.'));
    box.appendChild(el('p', {},
      el('b', { text: 'The anchor. ' }),
      'For every category, take the protocols in it whose token already trades and divide market cap by TVL. The category\'s multiple is the median of those ratios, shrunk toward the global median (' + fmtMult(DATA.global_multiple) + ' across ' + DATA.global_comps + ' traded tokens) by the count behind it: multiple = (n x median + ' + M.shrink_k + ' x global) / (n + ' + M.shrink_k + '). Ratios are winsorized at ' + fmtMult(DATA.ratio_cap) + ' first, the 90th percentile of them all, so one token trading on a sliver of recorded TVL cannot price a whole category. A category with no traded token is priced on the global median.'));
    var list = el('ul', {},
      el('li', {}, el('b', { text: 'Growth: ' }), 'the 7-day TVL change, clamped to ' + M.growth_floor + '%..+' + M.growth_cap + '%, moves the value by that change x ' + M.growth_weight + '. A protocol shrinking fast is worth less than its TVL alone says.'),
      el('li', {}, el('b', { text: 'Maturity: ' }), 'a protocol that has run ' + (M.maturity_days / 365) + ' years with no token earns the full multiple; a new one is discounted to ' + Math.round(M.maturity_floor * 100) + '% of it, because young TVL often leaves. Unknown listing dates are treated as one year.'),
      el('li', {}, el('b', { text: 'Breadth: ' }), 'each chain past the first adds ' + Math.round(M.breadth_per_chain * 100) + '%, up to ' + M.breadth_max_extra_chains + ' extra chains: more chains, more surface a launch can be priced on.'),
      el('li', {}, el('b', { text: 'Who is ranked: ' }), 'every protocol that records no token, minus exchanges, exchanges\' own products, versioned deployments of another product, and the wrapper categories (bridges, canonical bridges, liquid staking and restaking), whose value is an asset that already trades. All ' + DATA.watchlist_size + ' watchlist protocols are in, plus ' + DATA.early_size + ' more below the $' + (DATA.floor_usd / 1e6) + 'M floor. "Records no token" is DefiLlama\'s record, not proof a token does not exist.'));
    box.appendChild(list);
    box.appendChild(el('h3', { text: 'Category anchors derived from this snapshot' }));
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Traded comps' }),
        el('th', { class: 'num', text: 'Raw median' }), el('th', { class: 'num', text: 'Multiple used' }))),
      el('tbody', {}, ...DATA.categories.map(function (c) {
        return el('tr', {},
          el('td', { text: c.category }),
          el('td', { class: 'num', text: String(c.comps) }),
          el('td', { class: 'num', text: fmtMult(c.raw_median) }),
          el('td', { class: 'num', text: fmtMult(c.multiple) }));
      })));
    box.appendChild(table);
    frag.appendChild(box);
    return frag;
  }

  function bar(label, mult, max) {
    var pct = Math.max(2, Math.min(100, (mult / max) * 100));
    return el('div', { class: 'mrow' },
      el('span', { class: 'lab', text: label }),
      el('span', { class: 'bar' }, el('i', {})),
      el('span', { class: 'val', text: fmtMult(mult) }));
  }

  function drawer(row) {
    var frag = document.createDocumentFragment();
    frag.appendChild(el('div', { class: 'scrim', onclick: function () { state.selected = null; render(); } }));
    var recomputed = impliedOf(row);
    var d = el('aside', { class: 'drawer', 'aria-label': 'Protocol detail' },
      el('button', { class: 'close', type: 'button', onclick: function () { state.selected = null; render(); } }, 'Close'),
      el('h2', {}, row.name, row.watchlist ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null),
      el('p', { class: 'dsub', text: 'Rank #' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.category || 'Uncategorised') + ' · records no token' }),
      el('div', { class: 'kv' },
        el('div', {}, el('b', { text: fmtUsd(row.implied_value_usd) }), el('span', { text: 'Implied value' })),
        el('div', {}, el('b', { text: fmtUsd(row.tvl_usd) }), el('span', { text: 'TVL' })),
        el('div', {}, el('b', { text: fmtPct(row.change_7d) }), el('span', { text: 'TVL change, 7d' })),
        el('div', {}, el('b', { text: fmtAge(row.age_days) }), el('span', { text: 'Run with no token' }))),
      el('h3', { text: 'How the value is built' }),
      el('p', { class: 'formula' },
        'TVL ', el('b', { text: fmtUsd(row.tvl_usd) }),
        ' x category multiple ', el('b', { text: fmtMult(row.category_multiple) }),
        ' (median of ' + row.category_comps + ' traded ' + (row.category || 'protocol') + ' tokens)',
        ' x growth ', el('b', { text: fmtMult(row.growth_multiplier) }),
        ' x maturity ', el('b', { text: fmtMult(row.maturity_multiplier) }),
        ' x breadth ', el('b', { text: fmtMult(row.breadth_multiplier) }),
        ' = ', el('b', { text: fmtUsd(row.implied_value_usd) }),
        recomputed === row.implied_value_usd ? '' : ' (page recompute: ' + fmtUsd(recomputed) + ')'),
      bar('Category', row.category_multiple, 3),
      bar('Growth', row.growth_multiplier, 1.6),
      bar('Maturity', row.maturity_multiplier, 1.1),
      bar('Breadth', row.breadth_multiplier, 1.15),
      el('h3', { text: 'Where it runs' }),
      el('p', { class: 'note', text: 'Chains: ' + (row.chains.length ? row.chains.join(', ') : 'none recorded') + '. First tracked ' + (row.listed_at || 'on an unrecorded date') + '; snapshot ' + DATA.as_of + '.' }),
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'plan' }, ...row.farm_steps.map(function (s) { return el('li', { text: s }); })),
      el('p', { class: 'note', text: 'Capital, gas and timing in each step are sized from this protocol\'s own TVL, first chain, category and age. A plan is preparation, not a promise: a protocol may never issue a token.' }));
    // Set the bar widths now that the nodes exist.
    var bars = d.querySelectorAll('.bar i');
    var mults = [row.category_multiple, row.growth_multiplier, row.maturity_multiplier, row.breadth_multiplier];
    var maxes = [3, 1.6, 1.1, 1.15];
    bars.forEach(function (b, i) { b.style.width = Math.max(2, Math.min(100, (mults[i] / maxes[i]) * 100)) + '%'; });
    frag.appendChild(d);
    return frag;
  }

  function render() {
    readHashOnce();
    writeHash();
    app.setAttribute('aria-busy', 'false');
    app.textContent = '';
    var wrap = el('div', { class: 'wrap' }, header(), tabs());
    var view = state.view === 'live' ? liveView() : state.view === 'method' ? methodView() : boardView();
    wrap.appendChild(view);
    wrap.appendChild(el('p', { class: 'foot', text: 'Source: ' + DATA.source + '. Model ' + DATA.model_version + ' (comps-anchored). Implied values are this dashboard\'s own claims about a hypothetical token, not prices and not advice.' }));
    app.appendChild(wrap);
    if (view._fill) view._fill();
    if (state.selected) {
      var row = null;
      DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
      if (row) app.appendChild(drawer(row));
      else state.selected = null;
    }
  }

  var hashRead = false;
  function readHashOnce() { if (!hashRead) { readHash(); hashRead = true; } }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; render(); }
  });

  render();
})();
