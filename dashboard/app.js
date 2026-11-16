// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol
// detail drawer with the model's own inputs and the protocol's farm plan. No
// network: every byte it shows is in data.js.
//
// The page carries the model twice over on purpose. It recomputes a row's
// implied value from the snapshot figures and the comparables the data file
// carries, and it derives each farm plan from the row's own record, so the
// numbers on the screen are the same arithmetic board.json carries. The two
// functions are exposed as window.__impliedOf and window.__farmSteps so a
// check can compare the page against the board without opening the drawer.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, minTvl: 0, verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the same arithmetic as lib/model.ts. The size
  // curve is fitted on the snapshot's live-token protocols: log(mcap) =
  // intercept + slope x log(tvl). A row's implied value is the curve's
  // prediction at its own TVL, with the implied multiple winsorized to the
  // curve's band. Growth and age are shown on the row for context, but the
  // blind tests dropped them as predictors, so they do not price it.
  function impliedOf(row) {
    var c = DATA.size_curve;
    var raw = Math.exp(c.intercept + c.slope * Math.log(row.tvl_usd));
    var multiple = Math.min(0.75, Math.max(0.005, raw / row.tvl_usd));
    return Math.max(1, Math.round(row.tvl_usd * multiple));
  }
  window.__impliedOf = impliedOf;

  // A dollar amount as the farm plan writes it, and a net with its sign.
  function money(n) {
    var r = Math.round(n * 100) / 100;
    return '$' + (Number.isInteger(r) ? String(r) : r.toFixed(2));
  }
  function signedMoney(n) {
    var r = Math.round(n * 100) / 100;
    if (r === 0) return '$0';
    var abs = Math.abs(r);
    return (r > 0 ? '+' : '-') + '$' + (Number.isInteger(abs) ? String(abs) : abs.toFixed(2));
  }
  function verdictFor(net) {
    if (net > DATA.netting.farm_threshold_usd) return 'FARM';
    if (net > 0) return 'THIN';
    return 'SKIP';
  }
  // The farm economics, the same derivation main.ts writes to board.json:
  // gas plus fees is the out-of-pocket cost; the expected airdrop is the
  // assumed community share of the implied value split among the assumed
  // farmers; net is expected minus cost, and the verdict follows the net.
  function farmEconomics(p) {
    var n = DATA.netting;
    var capital = capitalFor(p);
    var half = Math.max(25, Math.round(capital / 2));
    var gas = 3 + (capital >= 150 ? 8 : 4) + 2 + 2 + 4;
    var moved = capital + half + 25 + 25;
    var fees = Math.round(moved * n.fee_rate * 100) / 100 + (p.chains && p.chains.length > 1 ? n.bridge_toll_usd : 0);
    var cost = Math.round((gas + fees) * 100) / 100;
    var expected = Math.round(((p.implied_value_usd * n.airdrop_share) / n.farmers_assumed) * 100) / 100;
    var net = Math.round((expected - cost) * 100) / 100;
    var atStress = n.farmers_stress.map(function (f) {
      var e = Math.round(((p.implied_value_usd * n.airdrop_share) / f) * 100) / 100;
      return verdictFor(Math.round((e - cost) * 100) / 100);
    });
    return { capital: capital + half + 25, gas: gas, fees: fees, cost: cost, farmers: n.farmers_assumed, expected: expected, net: net, verdict: verdictFor(net), atStress: atStress };
  }
  window.__farmEconomics = farmEconomics;

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: the
  // category's family, the chains, the TVL and the age decide the action, the
  // capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function familyOf(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'lend';
    if (c.indexOf('dex') >= 0) return 'dex';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'yield';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('stak') >= 0) return 'stake';
    if (c.indexOf('deriv') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis') >= 0) return 'deriv';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'curator';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c.indexOf('stable') >= 0) return 'stable';
    if (c.indexOf('insurance') >= 0) return 'insurance';
    if (c.indexOf('payment') >= 0) return 'payments';
    if (c.indexOf('governance') >= 0) return 'governance';
    if (c.indexOf('index') >= 0) return 'index';
    if (c.indexOf('chain') >= 0) return 'chain';
    return 'default';
  }
  function actionFor(p, capital, chain) {
    var name = p.name;
    switch (familyOf(p)) {
      case 'lend': return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
      case 'dex': return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
      case 'yield': return 'Deposit $' + capital + ' of USDC into ' + name + "'s main yield vault on " + chain + ' and keep the shares.';
      case 'bridge': return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
      case 'stake': return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
      case 'deriv': return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
      case 'curator': return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
      case 'rwa': return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
      case 'stable': return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
      case 'insurance': return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
      case 'payments': return 'Send $' + capital + " through " + name + "'s payment rails on " + chain + '.';
      case 'governance': return 'Deposit $' + capital + ' and stake it for voting power on ' + name + '.';
      case 'index': return 'Buy $' + capital + ' of ' + name + "'s index tokens on " + chain + ' and hold them.';
      case 'chain': return 'Bridge $' + capital + ' of USDC to ' + chain + " and deposit it into the chain's largest app.";
      default: return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    }
  }
  function secondActionFor(p) {
    var name = p.name;
    switch (familyOf(p)) {
      case 'lend': return 'Borrow $25 of USDC against the supply and repay it within the week, so the position shows both sides of the market.';
      case 'dex': return 'Swap $25 through the pool, so the position shows trading activity as well as liquidity.';
      case 'yield': return 'Claim the first yield and redeposit it, so the position compounds instead of sitting idle.';
      case 'bridge': return 'Bridge $25 back to the starting chain, so the position shows a round trip.';
      case 'stake': return 'Restake the first rewards, so the staked balance grows instead of sitting idle.';
      case 'deriv': return 'Close the first hedge and open a fresh one, so the position shows repeated use.';
      case 'curator': return 'Deposit $25 into a second vault of the same curator, so the farm is not one vault only.';
      case 'rwa': return 'Check the yield accrual after the first week and leave the asset in place.';
      case 'stable': return 'Swap $25 of the stable asset into a second stablecoin ' + name + ' supports.';
      case 'insurance': return 'Add $25 of cover for a second risk, so the position is not a single policy.';
      case 'payments': return 'Send a second payment of $25 through the rails a week later.';
      case 'governance': return 'Vote on a second proposal once one opens.';
      case 'index': return 'Rebalance after the first week if the index weights moved.';
      case 'chain': return 'Use a second app on the chain with $25, so the farm touches more than one program.';
      default: return 'Make a second deposit of $25 a week later, so the position shows repeated use.';
    }
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var chain2 = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var half = Math.max(25, Math.round(capital / 2));
    var econ = farmEconomics(p);
    var n = DATA.netting;
    var stress = n.farmers_stress.map(function (f, i) { return f.toLocaleString('en-US') + ' farmers: ' + econ.atStress[i]; }).join('; ');
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p), cost: 'about $2 of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: chain2 !== null ? 'Repeat the core position on ' + chain2 + ' with $' + half + ', so the farm covers two chains instead of one.' : 'Open a second position of the same kind in a different pool or vault of ' + p.name + ', so the farm is not one position only.', cost: '$' + half + ' of capital and about $4 of gas', time: '15 minutes' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
      { text: 'Net this plan: out of pocket ' + money(econ.cost) + ' (gas ' + money(econ.gas) + ' + fees ' + money(econ.fees) + '). At a ' + Math.round(n.airdrop_share * 100) + '% community allocation split among ' + econ.farmers.toLocaleString('en-US') + ' farmers, the expected airdrop is ' + money(econ.expected) + ', so the net is ' + signedMoney(econ.net) + ' — verdict ' + econ.verdict + '. The count is an assumption: ' + stress + '.', cost: 'net ' + signedMoney(econ.net) + ' after ' + money(econ.cost) + ' out of pocket', time: 'read before you farm' }
    ].map(stepText);
  }
  window.__farmSteps = farmSteps;

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist')) state.watchlistOnly = params.get('watchlist') === '1';
    if (params.get('verdict')) state.verdict = params.get('verdict');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.watchlistOnly && !r.is_watchlist) return false;
      if (state.verdict !== 'all' && r.farm_verdict !== state.verdict) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else if (key === 'farm') { av = a.farm_capital_usd; bv = b.farm_capital_usd; }
      else if (key === 'net') { av = a.farm_net_usd; bv = b.farm_net_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, so the board covers every protocol the snapshot can rank. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Size curve, blind time split' }), el('b', { text: 'median error ' + DATA.backtest.time_split.median_abs_log_error.toFixed(2) + ' log (' + DATA.backtest.time_split.test_n + ' held-out tokens)' })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts, netted' }), el('b', { text: DATA.netting.verdict_counts.FARM + ' FARM / ' + DATA.netting.verdict_counts.THIN + ' THIN / ' + DATA.netting.verdict_counts.SKIP + ' SKIP' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catCounts = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; catCounts[c] = (catCounts[c] || 0) + 1; });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories (' + DATA.rows.length + ')' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + catCounts[c] + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'min-tvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }),
      el('option', { value: '50000000', text: 'TVL $50M and up' }),
      el('option', { value: '100000000', text: 'TVL $100M and up' }),
      el('option', { value: '500000000', text: 'TVL $500M and up' }),
      el('option', { value: '1000000000', text: 'TVL $1B and up' })
    );
    tvlSelect.value = String(state.minTvl);
    tvlSelect.addEventListener('change', function () { state.minTvl = Number(tvlSelect.value); render(); });
    var wl = el('input', { type: 'checkbox', id: 'watchlist-only', checked: state.watchlistOnly ? 'checked' : null });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    var vc = DATA.netting.verdict_counts;
    var verdictSelect = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' },
      el('option', { value: 'all', text: 'Any verdict (' + DATA.rows.length + ')' }),
      el('option', { value: 'FARM', text: 'FARM (' + vc.FARM + ')' }),
      el('option', { value: 'THIN', text: 'THIN (' + vc.THIN + ')' }),
      el('option', { value: 'SKIP', text: 'SKIP (' + vc.SKIP + ')' })
    );
    verdictSelect.value = state.verdict;
    verdictSelect.addEventListener('change', function () { state.verdict = verdictSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'min-tvl', text: 'TVL' }), tvlSelect),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Farm verdict' }), verdictSelect),
      el('label', { class: 'check', for: 'watchlist-only' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function filterNote() {
    if (state.tab !== 'pre-token') return null;
    var parts = [];
    if (state.category !== 'all') parts.push('category ' + state.category);
    if (state.chain !== 'all') parts.push('chain ' + state.chain);
    if (state.watchlistOnly) parts.push('watchlist only');
    if (state.verdict !== 'all') parts.push('verdict ' + state.verdict);
    if (state.minTvl > 0) parts.push('TVL ' + fmtUsd(state.minTvl) + ' and up');
    if (state.q.trim()) parts.push('matching "' + state.q.trim() + '"');
    var shown = rows().length;
    var text = shown === DATA.rows.length
      ? 'Showing all ' + DATA.rows.length + ' pre-token protocols.'
      : 'Showing ' + shown + ' of ' + DATA.rows.length + ' pre-token protocols' + (parts.length ? ' — ' + parts.join(', ') : '') + '.';
    return el('p', { class: 'filter-note', text: text });
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.minTvl = 0; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.is_watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.multiple.toFixed(3) + 'x' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: '$' + r.farm_capital_usd }),
        el('td', { class: 'num ' + (r.farm_net_usd > 25 ? 'pos' : r.farm_net_usd > 0 ? '' : 'neg'), text: signedMoney(r.farm_net_usd) }),
        el('td', null, el('span', { class: 'verdict v-' + r.farm_verdict.toLowerCase(), text: r.farm_verdict })),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Comp x'),
            sortHeader('implied', 'Implied value'),
            sortHeader('farm', 'Farm cost'),
            sortHeader('net', 'Farm net'),
            el('th', { scope: 'col', text: 'Verdict' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.tvl_usd > 0 && r.mcap_usd !== null ? (r.mcap_usd / r.tvl_usd).toFixed(3) + 'x' : 'n/a' }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their mcap-to-TVL ratios are the comparables the pre-token board is priced from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function backtestPanel() {
    var b = DATA.backtest;
    var c = DATA.size_curve;
    var n = DATA.netting;
    function splitRows(s, label) {
      return el('tr', null,
        el('td', { text: label }),
        el('td', { class: 'num', text: s.train_n + ' train / ' + s.test_n + ' test' }),
        el('td', { class: 'num', text: s.median_abs_log_error.toFixed(2) + ' log' }),
        el('td', { class: 'num', text: 'about ' + Math.round(s.median_abs_pct_error) + '%' }),
        el('td', { class: 'num', text: Math.round(s.within_2x * 100) + '%' }),
        el('td', { class: 'num', text: Math.round(s.within_1_5x * 100) + '%' })
      );
    }
    var sensRows = n.sensitivity.map(function (s) {
      return el('tr', null,
        el('td', { text: s.farmers.toLocaleString('en-US') + ' farmers' }),
        el('td', { class: 'num', text: String(s.FARM) }),
        el('td', { class: 'num', text: String(s.THIN) }),
        el('td', { class: 'num', text: String(s.SKIP) })
      );
    });
    return el('section', { class: 'panel backtest' },
      el('h2', { text: 'The size curve, tested blind' }),
      el('p', { class: 'sub', text: 'The curve is log(market cap) = ' + c.intercept.toFixed(2) + ' + ' + c.slope.toFixed(3) + ' x log(TVL), fitted by least squares on ' + c.n + ' live-token protocols with a market cap above zero. At TVL $5M the curve reads 0.70x, at $50M 0.21x, at $500M 0.06x, at $5B 0.02x: bigger protocols trade at a smaller multiple of their TVL, and the curve prices that in instead of one flat multiple.' }),
      el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Blind test' }), el('th', { scope: 'col', text: 'Split' }), el('th', { scope: 'col', text: 'Median |log error|' }), el('th', { scope: 'col', text: 'Median error' }), el('th', { scope: 'col', text: 'Within 2x' }), el('th', { scope: 'col', text: 'Within 1.5x' }))),
        el('tbody', null,
          splitRows(b.time_split, 'Time split: fit before 2024, test after'),
          splitRows(b.holdout, 'Holdout: every 5th live token by slug'),
          splitRows(b.retired_time_split, 'Retired model, same time split'),
          splitRows(b.retired_holdout, 'Retired model, same holdout')
        )
      ),
      el('p', { class: 'sub', text: 'The time split is the honest one: the curve predicts tokens listed after 2023 that its fit never saw, with a median error of ' + b.time_split.median_abs_log_error.toFixed(2) + ' in log terms (about ' + Math.round(b.time_split.median_abs_pct_error) + '%), against ' + b.retired_time_split.median_abs_log_error.toFixed(2) + ' for the retired constant-multiple model on the same tokens. The holdout is the weaker leg (' + b.holdout.median_abs_log_error.toFixed(2) + ' vs ' + b.retired_holdout.median_abs_log_error.toFixed(2) + '), and the dashboard says so rather than hiding it. ' + b.time_split_excluded_no_date + ' live tokens record no listed date and cannot join the time split; they are counted here, not hidden. Seven-day growth and age with no token were tested as extra predictors on both splits and dropped: neither improved the blind error, so the curve prices on TVL alone. The bootstrap over ' + b.bootstrap.runs + ' resamples puts the slope at ' + b.bootstrap.slope_median.toFixed(3) + ' (5th–95th percentile ' + b.bootstrap.slope_p5.toFixed(3) + '–' + b.bootstrap.slope_p95.toFixed(3) + ') and the intercept at ' + b.bootstrap.intercept_median.toFixed(2) + ' (' + b.bootstrap.intercept_p5.toFixed(2) + '–' + b.bootstrap.intercept_p95.toFixed(2) + '). Fourteen protocols record a market cap of zero or less — a truncated figure, not a price — and are left out of the fit.' }),
      el('h3', { text: 'Farm verdicts are netted, and the net depends on the farmer count' }),
      el('p', { class: 'sub', text: 'Every plan is costed (gas plus fees) and netted: the expected airdrop is ' + Math.round(n.airdrop_share * 100) + '% of the row’s implied value split among ' + n.farmers_assumed.toLocaleString('en-US') + ' farmers, a stated assumption the snapshot cannot see. FARM is a net above $' + n.farm_threshold_usd + ', THIN a net above $0, SKIP the rest. The counts below show how much rides on that one count:' }),
      el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Farmers assumed' }), el('th', { scope: 'col', text: 'FARM' }), el('th', { scope: 'col', text: 'THIN' }), el('th', { scope: 'col', text: 'SKIP' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: n.farmers_assumed.toLocaleString('en-US') + ' farmers (this board)' }), el('td', { class: 'num', text: String(n.verdict_counts.FARM) }), el('td', { class: 'num', text: String(n.verdict_counts.THIN) }), el('td', { class: 'num', text: String(n.verdict_counts.SKIP) })),
          sensRows
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var c = DATA.size_curve;
    var compsRows = DATA.comps_table.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: c.median.toFixed(3) + 'x' }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { text: 'reference only — the curve is fitted on all live tokens, not per category' })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one size curve fitted on the snapshot’s own live-token protocols. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x winsor( exp(' + c.intercept.toFixed(4) + ' + ' + c.slope.toFixed(4) + ' x ln(tvl_usd)) / tvl_usd, 0.005, 0.75 ) )'
      ),
      el('p', { class: 'sub', text: 'The curve is fitted on ' + c.n + ' live-token protocols with a market cap above zero, TVL above zero, and no exchange token. TVL comes from the snapshot; the implied multiple is the curve’s prediction at that TVL, winsorized to 0.005x–0.75x only as a guardrail against extrapolation. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Growth and age are shown on every row for context, but the blind tests dropped them as predictors, so they do not move the price. A row is rankable only when it records no token and is not a wrapped, staked or bridged product of a token that already trades, under the same rule that built the watchlist: WBTC, Binance staked ETH and USDT0 record no token either, and they are left out for that reason.' }),
      el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Live tokens' }), el('th', { scope: 'col', text: 'Role' }))),
        el('tbody', null, compsRows)
      ),
      el('p', { class: 'sub', text: 'The table above is the category medians for reference: the curve is fitted on all live tokens at once, not per category, because the per-category fits did not beat the single curve on the blind splits.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row);
    var econ = farmEconomics(row);
    var multipleNote = 'the size curve fitted on ' + DATA.size_curve.n + ' live-token protocols: at this TVL it reads ' + row.multiple.toFixed(3) + 'x';
    var chainsText = row.chains && row.chains.length
      ? row.chains.slice(0, 4).join(', ') + (row.chains.length > 4 ? ' + ' + (row.chains.length - 4) + ' more' : '')
      : 'an unnamed chain';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.is_watchlist ? ' - on the watchlist' : ' - early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainsText })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Size-curve multiple' }), el('b', { class: 'num', text: row.multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth (context)' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token (context)' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': ' + multipleNote + '. Growth and age are shown for context — the blind tests dropped both as predictors, so neither prices this row. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ' — the same number board.json carries.' : ' — which differs from the board: the data would be stale.') })
    ));
    var stressText = DATA.netting.farmers_stress.map(function (f, i) { return f.toLocaleString('en-US') + ' farmers: ' + econ.atStress[i]; }).join('; ');
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — netted' }),
      el('p', { class: 'sub', text: 'About $' + row.farm_capital_usd + ' of capital and $' + row.farm_gas_usd + ' of gas for the whole plan. The net below is the plan’s own arithmetic, not a promise: the expected airdrop is ' + Math.round(DATA.netting.airdrop_share * 100) + '% of the implied value split among ' + econ.farmers.toLocaleString('en-US') + ' farmers, a stated assumption.' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Gas' }), el('b', { class: 'num', text: money(econ.gas) })),
        el('div', null, el('span', { text: 'Fees' }), el('b', { class: 'num', text: money(econ.fees) })),
        el('div', null, el('span', { text: 'Out of pocket' }), el('b', { class: 'num', text: money(econ.cost) })),
        el('div', null, el('span', { text: 'Expected airdrop' }), el('b', { class: 'num', text: money(econ.expected) })),
        el('div', null, el('span', { text: 'Net' }), el('b', { class: 'num ' + (econ.net > 25 ? 'pos' : econ.net > 0 ? '' : 'neg'), text: signedMoney(econ.net) })),
        el('div', null, el('span', { text: 'Verdict' }), el('b', null, el('span', { class: 'verdict v-' + econ.verdict.toLowerCase(), text: econ.verdict })))
      ),
      el('p', { class: 'sub', text: 'Stress: ' + stressText + '. FARM is a net above $' + DATA.netting.farm_threshold_usd + ', THIN a net above $0, SKIP the rest.' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(filterNote());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') { shell.appendChild(backtestPanel()); shell.appendChild(modelPanel()); }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
    if (e.key === '/' && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
      e.preventDefault();
      var q = document.getElementById('q');
      if (q) q.focus();
    }
  });
})();
