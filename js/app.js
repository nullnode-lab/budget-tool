/*
 * Grad Budget Planner: state, rendering and event handling.
 * Depends on js/tax.js (BudgetTax), js/defaults.js (BudgetDefaults) and,
 * optionally, Chart.js (window.Chart) for the spending chart.
 */
(function () {
  'use strict';

  var T = window.BudgetTax;
  var D = window.BudgetDefaults;

  var STORAGE_KEY = 'gradBudget.v1';
  var PERIODS = { monthly: 12, biweekly: 26, weekly: 52 };
  var PERIOD_NAME = { monthly: 'month', biweekly: 'paycheck', weekly: 'week' };
  var PERIOD_SHORT = { monthly: '/mo', biweekly: '/check', weekly: '/wk' };
  var TABS = ['dashboard', 'income', 'budget', 'goals', 'plan', 'settings'];
  var TYPES = ['need', 'want', 'save', 'debt'];
  var MAX_SLOTS = 8;

  var DEFAULT_CATS = {};
  var DEFAULT_ITEMS = {};
  D.CATEGORIES.forEach(function (c) {
    DEFAULT_CATS[c.id] = c;
    c.items.forEach(function (it) { DEFAULT_ITEMS[it.id] = it; });
  });

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 9); }
  function num(v, fallback) {
    var n = parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function sum(arr, fn) { return arr.reduce(function (a, x) { return a + fn(x); }, 0); }

  var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
  }

  var moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var centsFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(v) {
    var r = Math.round(v);
    if (r === 0) r = 0; // avoid "-$0"
    return moneyFmt.format(r);
  }
  function cents(v) { return centsFmt.format(Math.abs(v) < 0.005 ? 0 : v); }
  function pct(v) {
    var r = round1(v);
    if (r === 0) r = 0;
    return r.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
  }
  // Whole dollars for %-based lines; keep cents for small amounts and for
  // fixed bills the user typed (e.g. a $14.99 subscription).
  function amtInputValue(v, keepCents) {
    if (!isFinite(v)) return '';
    return Math.abs(v) >= 10 && !keepCents ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
  }
  function monthLabel(date) {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  function addMonths(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  // Tips and blurbs live in defaults.js (not in saved data) so they can be
  // improved later without overwriting anyone's numbers.
  function stripText(cat) {
    var c = clone(cat);
    delete c.blurb;
    c.items.forEach(function (it) { delete it.tip; });
    return c;
  }

  function defaultCategories() { return D.CATEGORIES.map(stripText); }

  function defaultState() {
    return {
      version: 1,
      payCycle: 'monthly',
      theme: 'auto',
      tab: 'dashboard',
      income: {
        basis: 'expected',
        expected: { type: 'salary', salary: 50000, hourly: 24, hours: 40 },
        actual: { type: 'hourly', salary: 0, hourly: 0, hours: 0 }
      },
      tax: {
        k401Pct: 5,
        k401Type: 'traditional',
        matchPct: 0,
        healthMonthly: 0,
        localPreset: 'es-borough',
        eitRate: 1.0,
        lstEnabled: true,
        lstAmount: 52,
        paForgiveness: false
      },
      categories: defaultCategories(),
      goals: D.GOALS.map(normalizeGoal),
      checklist: {},
      collapsed: {}
    };
  }

  function normalizeRange(r) {
    if (!Array.isArray(r) || r.length !== 2) return null;
    var a = num(r[0], NaN), b = num(r[1], NaN);
    if (!isFinite(a) || !isFinite(b)) return null;
    a = clamp(a, 0, 100); b = clamp(b, 0, 100);
    return a <= b ? [a, b] : [b, a];
  }

  function normalizeItem(it) {
    if (!it || typeof it !== 'object' || !it.id) return null;
    return {
      id: String(it.id),
      name: String(it.name || 'Line item').slice(0, 80),
      type: TYPES.indexOf(it.type) >= 0 ? it.type : 'want',
      enabled: it.enabled !== false,
      mode: it.mode === 'fixed' ? 'fixed' : 'pct',
      pct: Math.max(0, num(it.pct)),
      annual: Math.max(0, num(it.annual)),
      range: normalizeRange(it.range),
      custom: !!it.custom
    };
  }

  function normalizeCategory(c) {
    if (!c || typeof c !== 'object' || !c.id) return null;
    return {
      id: String(c.id),
      name: String(c.name || 'Category').slice(0, 60),
      emoji: String(c.emoji || '📦').slice(0, 4),
      slot: clamp(Math.round(num(c.slot)), 0, MAX_SLOTS),
      enabled: c.enabled !== false,
      range: normalizeRange(c.range),
      custom: !!c.custom,
      items: (Array.isArray(c.items) ? c.items : []).map(normalizeItem).filter(Boolean)
    };
  }

  function normalizeGoal(g) {
    if (!g || typeof g !== 'object' || !g.id) return null;
    return {
      id: String(g.id),
      name: String(g.name || 'Goal').slice(0, 60),
      emoji: String(g.emoji || '🎯').slice(0, 4),
      kind: String(g.kind || 'custom'),
      target: Math.max(0, num(g.target)),
      saved: Math.max(0, num(g.saved)),
      linkedItemId: g.linkedItemId ? String(g.linkedItemId) : '',
      manualMonthly: Math.max(0, num(g.manualMonthly)),
      targetDate: /^\d{4}-\d{2}$/.test(g.targetDate || '') ? g.targetDate : '',
      history: (Array.isArray(g.history) ? g.history : []).slice(-50).filter(function (h) {
        return h && isFinite(num(h.a, NaN));
      }).map(function (h) { return { d: String(h.d || ''), a: num(h.a) }; })
    };
  }

  function normalizeIncome(src, fallback) {
    var s = src && typeof src === 'object' ? src : {};
    return {
      type: s.type === 'hourly' ? 'hourly' : (s.type === 'salary' ? 'salary' : fallback.type),
      salary: Math.max(0, num(s.salary, fallback.salary)),
      hourly: Math.max(0, num(s.hourly, fallback.hourly)),
      hours: clamp(num(s.hours, fallback.hours), 0, 100)
    };
  }

  function normalize(s) {
    var d = defaultState();
    if (!s || typeof s !== 'object') return d;
    if (PERIODS[s.payCycle]) d.payCycle = s.payCycle;
    if (['auto', 'light', 'dark'].indexOf(s.theme) >= 0) d.theme = s.theme;
    if (TABS.indexOf(s.tab) >= 0) d.tab = s.tab;
    if (s.income && typeof s.income === 'object') {
      d.income.basis = s.income.basis === 'actual' ? 'actual' : 'expected';
      d.income.expected = normalizeIncome(s.income.expected, d.income.expected);
      d.income.actual = normalizeIncome(s.income.actual, d.income.actual);
    }
    if (s.tax && typeof s.tax === 'object') {
      var t = s.tax;
      d.tax.k401Pct = clamp(num(t.k401Pct, d.tax.k401Pct), 0, 100);
      d.tax.k401Type = t.k401Type === 'roth' ? 'roth' : 'traditional';
      d.tax.matchPct = clamp(num(t.matchPct, d.tax.matchPct), 0, 100);
      d.tax.healthMonthly = Math.max(0, num(t.healthMonthly, d.tax.healthMonthly));
      d.tax.localPreset = T.LOCAL_PRESETS.some(function (p) { return p.id === t.localPreset; }) ? t.localPreset : 'custom';
      d.tax.eitRate = clamp(num(t.eitRate, d.tax.eitRate), 0, 10);
      d.tax.lstEnabled = t.lstEnabled !== false;
      d.tax.lstAmount = clamp(num(t.lstAmount, d.tax.lstAmount), 0, T.TAX.local.lstMax);
      d.tax.paForgiveness = !!t.paForgiveness;
    }
    if (Array.isArray(s.categories)) d.categories = s.categories.map(normalizeCategory).filter(Boolean);
    if (Array.isArray(s.goals)) d.goals = s.goals.map(normalizeGoal).filter(Boolean);
    if (s.checklist && typeof s.checklist === 'object') {
      Object.keys(s.checklist).forEach(function (k) { d.checklist[k] = !!s.checklist[k]; });
    }
    if (s.collapsed && typeof s.collapsed === 'object') {
      Object.keys(s.collapsed).forEach(function (k) { d.collapsed[k] = !!s.collapsed[k]; });
    }
    return d;
  }

  var storageOk = true;
  var state = load();

  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageOk = false;
    }
    if (!raw) return defaultState();
    try {
      return normalize(JSON.parse(raw));
    } catch (e) {
      try { localStorage.setItem(STORAGE_KEY + '.corrupt', raw); } catch (e2) { /* ignore */ }
      return defaultState();
    }
  }

  var saveTimer = null;
  function scheduleSave() {
    setSaveStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
      setSaveStatus('Saved in this browser ✓');
    } catch (e) {
      storageOk = false;
      setSaveStatus('⚠ Not saved: browser storage is blocked or full');
    }
  }
  function setSaveStatus(text) {
    var el = $('#save-status');
    if (el) el.textContent = text;
  }

  /* ------------------------------------------------------------------ *
   * Calculations
   * ------------------------------------------------------------------ */

  function paycheckFor(which) {
    var gross = T.annualGross(state.income[which]);
    var t = state.tax;
    return T.estimatePaycheck({
      gross: gross,
      k401Pct: t.k401Pct,
      k401Type: t.k401Type,
      matchPct: t.matchPct,
      healthAnnual: t.healthMonthly * 12,
      eitRate: t.eitRate,
      lstEnabled: t.lstEnabled,
      lstAmount: t.lstAmount,
      paForgiveness: t.paForgiveness
    });
  }

  function itemAnnual(it, takeHome) {
    return it.mode === 'fixed' ? it.annual : takeHome * it.pct / 100;
  }
  function itemPct(it, takeHome) {
    if (it.mode === 'pct') return it.pct;
    return takeHome > 0 ? it.annual / takeHome * 100 : 0;
  }

  function categoryKind(cat) {
    if (cat.items.length && cat.items.every(function (it) { return it.type === 'save'; })) return 'save';
    return 'other';
  }

  // in | below | above | none, plus the badge tone for this kind of line.
  function rangeStatus(value, range, kind) {
    if (!range) return { key: 'none' };
    var eps = 0.05;
    if (value < range[0] - eps) {
      return kind === 'want'
        ? { key: 'below', tone: 'good', label: '▼ Under range: more to save' }
        : { key: 'below', tone: 'warn', label: '▼ Below range' };
    }
    if (value > range[1] + eps) {
      return kind === 'save'
        ? { key: 'above', tone: 'good', label: '▲ Above range: great' }
        : { key: 'above', tone: 'warn', label: '▲ Above range' };
    }
    return { key: 'in', tone: 'good', label: '✓ In range' };
  }

  function compute() {
    var pay = paycheckFor(state.income.basis);
    var takeHome = pay.takeHome;
    var n = PERIODS[state.payCycle];
    var items = {};
    var mix = { need: 0, want: 0, save: 0, debt: 0 };
    var mixAnnual = { need: 0, want: 0, save: 0, debt: 0 };

    var cats = state.categories.map(function (c) {
      var rows = c.items.map(function (it) {
        var row = {
          item: it,
          cat: c,
          active: c.enabled && it.enabled,
          annual: itemAnnual(it, takeHome),
          pct: itemPct(it, takeHome)
        };
        items[it.id] = row;
        if (row.active) {
          mix[it.type] += row.pct;
          mixAnnual[it.type] += row.annual;
        }
        return row;
      });
      var active = rows.filter(function (r) { return r.active; });
      var annual = sum(active, function (r) { return r.annual; });
      var p = sum(active, function (r) { return r.pct; });
      return {
        cat: c,
        rows: rows,
        annual: annual,
        pct: p,
        status: c.enabled ? rangeStatus(p, c.range, categoryKind(c)) : { key: 'off' }
      };
    });

    var activeCats = cats.filter(function (x) { return x.cat.enabled; });
    var allocatedAnnual = sum(activeCats, function (x) { return x.annual; });
    var allocatedPct = sum(activeCats, function (x) { return x.pct; });
    var leftAnnual = takeHome - allocatedAnnual;
    var leftPct = takeHome > 0 ? leftAnnual / takeHome * 100 : 100 - allocatedPct;

    return {
      pay: pay,
      takeHome: takeHome,
      n: n,
      per: PERIOD_SHORT[state.payCycle],
      cats: cats,
      items: items,
      allocatedAnnual: allocatedAnnual,
      allocatedPct: allocatedPct,
      leftAnnual: leftAnnual,
      leftPct: leftPct,
      mix: mix,
      mixAnnual: mixAnnual,
      essentialsMonthly: (mixAnnual.need + mixAnnual.debt) / 12
    };
  }

  function goalMonthly(goal, m) {
    if (goal.linkedItemId) {
      var row = m.items[goal.linkedItemId];
      if (row) return { amount: row.active ? row.annual / 12 : 0, row: row };
    }
    return { amount: goal.manualMonthly, row: null };
  }

  function goalProjection(goal, m) {
    var contrib = goalMonthly(goal, m);
    var remaining = Math.max(0, goal.target - goal.saved);
    var progress = goal.target > 0 ? clamp(goal.saved / goal.target, 0, 1) : 0;
    var now = new Date();
    var out = { contrib: contrib, remaining: remaining, progress: progress, done: remaining <= 0 && goal.target > 0 };
    if (!out.done && contrib.amount > 0) {
      out.months = Math.ceil(remaining / contrib.amount);
      out.eta = addMonths(now, out.months);
    }
    if (goal.targetDate && !out.done) {
      var parts = goal.targetDate.split('-');
      var target = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
      var monthsLeft = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
      out.targetLabel = monthLabel(target);
      if (monthsLeft <= 0) {
        out.deadlinePassed = true;
      } else {
        out.needed = remaining / monthsLeft;
        out.onTrack = contrib.amount + 0.5 >= out.needed;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Rendering: shared bits
   * ------------------------------------------------------------------ */

  function badge(tone, label) {
    return '<span class="badge badge-' + tone + '">' + esc(label) + '</span>';
  }

  var STATUS_ICON = { good: '✓', warn: '!', bad: '✕', info: 'i' };
  var STATUS_WORD = { good: 'Good', warn: 'Heads up', bad: 'Fix this', info: 'Note' };

  function seriesVar(slot) {
    return slot >= 1 && slot <= MAX_SLOTS ? 'var(--series-' + slot + ')' : 'var(--other)';
  }

  function tipFor(item) {
    var d = DEFAULT_ITEMS[item.id];
    return d && d.tip ? d.tip : '';
  }
  function blurbFor(cat) {
    var d = DEFAULT_CATS[cat.id];
    return d && d.blurb ? d.blurb : '';
  }

  function setSeg(container, attr, value) {
    $all('[' + attr + ']', container).forEach(function (b) {
      var on = b.getAttribute(attr) === value;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }

  /* ------------------------------------------------------------------ *
   * Dashboard
   * ------------------------------------------------------------------ */

  function renderDashboard(m) {
    var basis = state.income.basis;
    var gross = m.pay.gross;
    var banner = '';
    if (basis === 'actual' && gross <= 0) {
      banner = '<div class="banner banner-warn"><span class="banner-icon" aria-hidden="true">!</span><div>' +
        '<strong>Your actual income is $0, so there is nothing to budget yet.</strong> ' +
        'While you job hunt, plan with the salary you expect to earn.</div>' +
        '<button type="button" class="btn btn-primary" data-act="use-expected">Use expected income</button></div>';
    } else if (basis === 'expected') {
      banner = '<div class="banner"><span class="banner-icon" aria-hidden="true">i</span><div>' +
        '<strong>Planning mode:</strong> built on your expected income of ' + money(gross) + '/yr. ' +
        'When you are hired, enter your real pay under <a href="#income" data-goto="income">Income &amp; Taxes</a> and switch to Actual.</div></div>';
    }
    if (state.payCycle === 'biweekly' && m.takeHome > 0) {
      banner += '<div class="banner"><span class="banner-icon" aria-hidden="true">💡</span><div>' +
        '<strong>Bi-weekly tip:</strong> 26 paychecks a year means two months will have 3 paychecks. ' +
        'Budget your bills on 2 paychecks a month and send each "extra" paycheck (' + money(m.takeHome / 26) + ') straight to savings.</div></div>';
    } else if (state.payCycle === 'weekly' && m.takeHome > 0) {
      banner += '<div class="banner"><span class="banner-icon" aria-hidden="true">💡</span><div>' +
        '<strong>Weekly tip:</strong> 52 paychecks a year means four months have 5 paydays. Budget monthly bills on 4 paychecks ' +
        'and treat each 5th paycheck (' + money(m.takeHome / 52) + ') as a bonus for your goals.</div></div>';
    }
    $('#dash-banner').innerHTML = banner;

    var per = PERIOD_NAME[state.payCycle];
    var saveRate = m.takeHome > 0 ? m.mix.save : 0;
    var totalSaved = m.mixAnnual.save + m.pay.k401 + m.pay.employerMatch;
    var grossSaveRate = gross > 0 ? totalSaved / gross * 100 : 0;
    var left = m.leftAnnual / m.n;
    var leftTone = m.takeHome <= 0 ? 'info' : Math.abs(left) < 1 ? 'good' : (left > 0 ? 'warn' : 'bad');
    var leftLabel = m.takeHome <= 0 ? 'No income yet' : Math.abs(left) < 1 ? 'Every dollar has a job' : (left > 0 ? 'Not yet assigned' : 'Over budget');

    $('#dash-stats').innerHTML =
      stat('Take-home pay', money(m.takeHome / m.n), 'per ' + per + ' · ' + money(m.takeHome) + '/yr', true) +
      stat('Gross pay', money(gross / m.n), 'per ' + per + ' · ' + money(gross) + '/yr') +
      stat('Taxes', money(m.pay.totalTax / m.n), 'per ' + per + ' · ' + pct(m.pay.effectiveTaxRate * 100) + ' of gross') +
      stat('Savings rate', pct(saveRate), 'of take-home · ' + pct(grossSaveRate) + ' of gross incl. 401(k)') +
      stat('Left to assign', money(left), STATUS_ICON[leftTone] + ' ' + leftLabel, false, leftTone);

    $('#dash-chart-sub').textContent = 'Amounts per ' + per + '. Percentages are shares of take-home pay.';
    renderChart(m);
    renderLegend(m);
    renderChecks(m);
    renderMix(m);
    renderGoalMini(m);
  }

  function stat(label, value, sub, hero, tone) {
    return '<div class="stat' + (hero ? ' stat-hero' : '') + '">' +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value">' + esc(value) + '</div>' +
      '<div class="stat-sub' + (tone ? ' tone-' + tone : '') + '">' + esc(sub) + '</div></div>';
  }

  function chartSlices(m) {
    var slices = [];
    var other = 0;
    m.cats.forEach(function (x) {
      if (!x.cat.enabled || x.annual <= 0) return;
      if (x.cat.slot >= 1 && x.cat.slot <= MAX_SLOTS) {
        slices.push({ label: x.cat.emoji + ' ' + x.cat.name, value: x.annual / m.n, pct: x.pct, color: '--series-' + x.cat.slot });
      } else {
        other += x.annual;
      }
    });
    if (other > 0) {
      slices.push({ label: 'Other categories', value: other / m.n, pct: m.takeHome > 0 ? other / m.takeHome * 100 : 0, color: '--other' });
    }
    if (m.leftAnnual / m.n >= 1) {
      slices.push({ label: 'Not yet assigned', value: m.leftAnnual / m.n, pct: m.leftPct, color: '--unassigned' });
    }
    return slices;
  }

  var chart = null;
  function renderChart(m) {
    var canvas = $('#spend-chart');
    var center = $('#donut-center');
    var per = PERIOD_NAME[state.payCycle];
    center.innerHTML = '<span class="donut-amt">' + esc(money(m.takeHome / m.n)) + '</span>' +
      '<span class="donut-lbl">take-home per ' + esc(per) + '</span>';

    if (!window.Chart) {
      $('#chart-fallback').hidden = false;
      canvas.hidden = true;
      return;
    }
    var css = getComputedStyle(document.documentElement);
    var slices = chartSlices(m);
    var labels = slices.map(function (s) { return s.label; });
    var values = slices.map(function (s) { return Math.max(0, s.value); });
    var colors = slices.map(function (s) { return css.getPropertyValue(s.color).trim(); });
    var surface = css.getPropertyValue('--surface').trim();
    var ink = css.getPropertyValue('--ink').trim();
    var meta = slices.map(function (s) { return s.pct; });

    if (!slices.length) {
      labels = ['No spending yet'];
      values = [1];
      colors = [css.getPropertyValue('--unassigned').trim()];
      meta = [null];
    }

    if (!chart) {
      chart = new window.Chart(canvas, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderColor: surface, borderWidth: 2, hoverOffset: 6 }] },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          cutout: '64%',
          animation: { duration: 250 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: surface,
              titleColor: ink,
              bodyColor: ink,
              borderColor: css.getPropertyValue('--axis').trim(),
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: function (ctx) {
                  var p = chart.$pct ? chart.$pct[ctx.dataIndex] : null;
                  if (p == null) return ' Add income to see your budget';
                  return ' ' + money(ctx.parsed) + PERIOD_SHORT[state.payCycle] + ' (' + pct(p) + ')';
                }
              }
            }
          }
        }
      });
    } else {
      chart.data.labels = labels;
      var ds = chart.data.datasets[0];
      ds.data = values;
      ds.backgroundColor = colors;
      ds.borderColor = surface;
      var tt = chart.options.plugins.tooltip;
      tt.backgroundColor = surface;
      tt.titleColor = ink;
      tt.bodyColor = ink;
      tt.borderColor = css.getPropertyValue('--axis').trim();
      chart.update();
    }
    chart.$pct = meta;
  }

  function renderLegend(m) {
    var per = m.per;
    var rows = m.cats.filter(function (x) { return x.cat.enabled; }).map(function (x) {
      return '<tr>' +
        '<th scope="row"><span class="swatch" style="background:' + seriesVar(x.cat.slot) + '"></span>' +
        esc(x.cat.emoji + ' ' + x.cat.name) + '</th>' +
        '<td class="num">' + esc(money(x.annual / m.n)) + '<span class="per">' + per + '</span></td>' +
        '<td class="num">' + esc(pct(x.pct)) + '</td></tr>';
    }).join('');
    var left = m.leftAnnual / m.n;
    if (Math.abs(left) >= 1) {
      rows += '<tr class="' + (left < 0 ? 'row-bad' : '') + '"><th scope="row"><span class="swatch swatch-empty"></span>' +
        (left < 0 ? 'Over budget' : 'Not yet assigned') + '</th>' +
        '<td class="num">' + esc(money(left)) + '<span class="per">' + per + '</span></td>' +
        '<td class="num">' + esc(pct(m.leftPct)) + '</td></tr>';
    }
    $('#dash-legend').innerHTML =
      '<caption class="sr-only">Budget by category</caption>' +
      '<thead><tr><th scope="col">Category</th><th scope="col" class="num">Amount</th><th scope="col" class="num">Share</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr><th scope="row">Take-home pay</th><td class="num">' + esc(money(m.takeHome / m.n)) +
      '<span class="per">' + per + '</span></td><td class="num">100%</td></tr></tfoot>';
  }

  function findCat(m, id) {
    for (var i = 0; i < m.cats.length; i++) if (m.cats[i].cat.id === id) return m.cats[i];
    return null;
  }

  function healthChecks(m) {
    var checks = [];
    var per = m.per;
    if (m.takeHome <= 0) {
      checks.push({ tone: 'info', title: 'Add your income to start', body: 'Enter an expected salary on the Income & Taxes tab and the checks below come alive.' });
      return checks;
    }

    var left = m.leftAnnual / m.n;
    if (Math.abs(left) < 1) {
      checks.push({ tone: 'good', title: 'Every dollar has a job', body: 'Your plan assigns 100% of your take-home pay.' });
    } else if (left > 0) {
      checks.push({ tone: 'warn', title: money(left) + per + ' is not assigned yet', body: 'Unassigned money tends to disappear. Use "Send leftover to savings" on the Budget tab.' });
    } else {
      checks.push({ tone: 'bad', title: 'Over budget by ' + money(-left) + per, body: 'Your plan spends more than you take home. Trim wants first, then savings.' });
    }

    var s = m.mix.save;
    if (s >= 30) checks.push({ tone: 'good', title: 'Savings rate ' + pct(s) + ': excellent', body: 'Living at home, 30%+ of take-home is the sweet spot. Keep it up.' });
    else if (s >= 20) checks.push({ tone: 'warn', title: 'Savings rate ' + pct(s) + ': good start', body: 'Your costs are low right now. Push toward 30% or more while you can.' });
    else checks.push({ tone: 'bad', title: 'Savings rate ' + pct(s) + ': too low for living at home', body: 'Aim for at least 20–30% of take-home pay while your housing costs are low.' });

    var parents = findCat(m, 'parents');
    var housing = findCat(m, 'housing');
    var pOn = parents && parents.cat.enabled;
    var hOn = housing && housing.cat.enabled;
    if (pOn && hOn) {
      checks.push({ tone: 'warn', title: 'Both housing categories are on', body: 'Parental Contribution and Future Rent are both active. Usually you only need one.' });
    } else if (pOn) {
      var pr = parents.cat.range || [10, 20];
      if (parents.pct < pr[0] - 0.05) checks.push({ tone: 'warn', title: 'Household contribution ' + pct(parents.pct) + ' is below ' + pr[0] + '–' + pr[1] + '%', body: 'Contributing helps your family and builds the habit of paying rent.' });
      else if (parents.pct > pr[1] + 0.05) checks.push({ tone: 'warn', title: 'Household contribution ' + pct(parents.pct) + ' is above ' + pr[0] + '–' + pr[1] + '%', body: 'Generous! Just make sure your own savings and emergency fund are not squeezed.' });
      else checks.push({ tone: 'good', title: 'Household contribution ' + pct(parents.pct) + ' (' + money(parents.annual / m.n) + per + ')', body: 'Inside the recommended ' + pr[0] + '–' + pr[1] + '% for living at home.' });
    } else if (hOn) {
      var hp = housing.pct;
      if (hp <= 35.05) checks.push({ tone: 'good', title: 'Housing ' + pct(hp) + ' of take-home', body: 'At or under the ~35% guideline.' });
      else if (hp <= 40) checks.push({ tone: 'warn', title: 'Housing ' + pct(hp) + ' of take-home', body: 'A little high. Consider a roommate or a cheaper place.' });
      else checks.push({ tone: 'bad', title: 'Housing ' + pct(hp) + ' of take-home', body: 'Over 40% leaves too little for savings. A roommate or cheaper place would help.' });
    } else {
      checks.push({ tone: 'warn', title: 'No housing cost budgeted', body: 'Turn on Parental Contribution (living at home) or Future Rent (moved out).' });
    }

    var car = findCat(m, 'car');
    if (car && car.cat.enabled) {
      var running = sum(car.rows.filter(function (r) { return r.active && r.item.type !== 'save'; }), function (r) { return r.pct; });
      if (running <= 15.05) checks.push({ tone: 'good', title: 'Car running costs ' + pct(running) + ' of take-home', body: 'Insurance, gas, upkeep and any payment are within the ~15% comfort zone.' });
      else if (running <= 20.05) checks.push({ tone: 'warn', title: 'Car running costs ' + pct(running) + ' of take-home', body: 'Close to the 20% ceiling. Shop insurance and keep any loan short.' });
      else checks.push({ tone: 'bad', title: 'Car running costs ' + pct(running) + ' of take-home', body: 'Above 20%. A cheaper car or insurance quote would free up a lot of money.' });
    }

    var w = m.mix.want;
    if (w <= 20.05) checks.push({ tone: 'good', title: 'Wants ' + pct(w) + ' of take-home', body: 'Fun money is budgeted and under control (target: 20% or less).' });
    else if (w <= 30) checks.push({ tone: 'warn', title: 'Wants ' + pct(w) + ' of take-home', body: 'Above 20%. Fine occasionally, but it slows down your goals.' });
    else checks.push({ tone: 'bad', title: 'Wants ' + pct(w) + ' of take-home', body: 'Over 30% is a lot while living at home. Move some to savings.' });

    var rothAnnual = 0;
    Object.keys(m.items).forEach(function (id) {
      var r = m.items[id];
      if (r.active && (id === 'save-roth' || /roth\s*ira/i.test(r.item.name))) rothAnnual += r.annual;
    });
    var iraLimit = T.TAX.limits.ira;
    if (rothAnnual > iraLimit + 1) {
      checks.push({ tone: 'warn', title: 'Roth IRA plan ' + money(rothAnnual) + '/yr is over the ' + money(iraLimit) + ' limit', body: 'Redirect the extra ' + money(rothAnnual - iraLimit) + '/yr to your brokerage or 401(k).' });
    } else if (rothAnnual > 0) {
      checks.push({ tone: 'good', title: 'Roth IRA: ' + money(rothAnnual) + '/yr', body: 'Within the 2026 limit of ' + money(iraLimit) + '. Low tax bracket now makes this a great deal.' });
    }

    if (state.tax.matchPct > 0 && m.pay.gross > 0) {
      if (m.pay.missedMatch > 0.5) checks.push({ tone: 'bad', title: 'Missing ' + money(m.pay.missedMatch) + '/yr of free employer match', body: 'Raise your 401(k) to at least ' + state.tax.matchPct + '% on the Income & Taxes tab.' });
      else checks.push({ tone: 'good', title: 'Getting the full employer match', body: 'Your employer adds about ' + money(m.pay.employerMatch) + '/yr on top of your pay.' });
    }

    var ef = state.goals.filter(function (g) { return g.kind === 'emergency'; })[0];
    if (ef && m.essentialsMonthly > 0) {
      var months = ef.saved / m.essentialsMonthly;
      checks.push({
        tone: months >= 3 ? 'good' : 'info',
        title: 'Emergency fund covers ' + round1(months) + ' months of essentials',
        body: 'Goal: 3–6 months (' + money(m.essentialsMonthly * 3) + '–' + money(m.essentialsMonthly * 6) + '). Log deposits on the Savings Goals tab.'
      });
    }
    return checks;
  }

  function renderChecks(m) {
    $('#dash-checks').innerHTML = healthChecks(m).map(function (c) {
      return '<li class="check check-' + c.tone + '">' +
        '<span class="check-icon" aria-hidden="true">' + STATUS_ICON[c.tone] + '</span>' +
        '<div><div class="check-title"><span class="sr-only">' + STATUS_WORD[c.tone] + ': </span>' + esc(c.title) + '</div>' +
        '<div class="check-body">' + esc(c.body) + '</div></div></li>';
    }).join('');
  }

  function renderMix(m) {
    var tg = D.MIX_TARGETS;
    var parts = [
      { label: tg.need.label, value: m.mix.need, annual: m.mixAnnual.need, hint: tg.need.hint, ok: m.mix.need <= tg.need.max + 0.05, marker: tg.need.max },
      { label: tg.want.label, value: m.mix.want, annual: m.mixAnnual.want, hint: tg.want.hint, ok: m.mix.want <= tg.want.max + 0.05, marker: tg.want.max },
      { label: tg.saveDebt.label, value: m.mix.save + m.mix.debt, annual: m.mixAnnual.save + m.mixAnnual.debt, hint: tg.saveDebt.hint, ok: m.mix.save + m.mix.debt >= tg.saveDebt.min - 0.05, marker: tg.saveDebt.min }
    ];
    $('#dash-mix').innerHTML = parts.map(function (p) {
      var tone = m.takeHome <= 0 ? 'info' : (p.ok ? 'good' : 'warn');
      var w = clamp(p.value, 0, 100);
      return '<div class="mix">' +
        '<div class="mix-top"><span class="mix-label">' + esc(p.label) + '</span>' +
        '<span class="badge badge-' + tone + '">' + STATUS_ICON[tone] + ' ' + (tone === 'good' ? 'On target' : tone === 'warn' ? 'Off target' : 'No income') + '</span></div>' +
        '<div class="mix-value">' + esc(pct(p.value)) + '<span class="mix-amt">' + esc(money(p.annual / m.n)) + m.per + '</span></div>' +
        '<div class="meter" role="img" aria-label="' + esc(p.label + ' ' + pct(p.value) + ', target ' + p.hint) + '">' +
        '<span class="meter-fill tone-bg-' + tone + '" style="width:' + w + '%"></span>' +
        '<span class="meter-mark" style="left:' + p.marker + '%"></span></div>' +
        '<div class="mix-hint small muted">Target: ' + esc(p.hint) + ' of take-home</div></div>';
    }).join('');
  }

  function renderGoalMini(m) {
    if (!state.goals.length) {
      $('#dash-goals').innerHTML = '<p class="muted">No goals yet. Add one on the Savings Goals tab.</p>';
      return;
    }
    $('#dash-goals').innerHTML = state.goals.map(function (g) {
      var p = goalProjection(g, m);
      var eta = p.done ? 'Goal reached 🎉' : (p.eta ? 'On pace for ' + monthLabel(p.eta) : 'No monthly contribution yet');
      return '<div class="goal-mini">' +
        '<div class="goal-mini-top"><span>' + esc(g.emoji + ' ' + g.name) + '</span>' +
        '<span class="small muted">' + esc(money(g.saved)) + ' of ' + esc(money(g.target)) + '</span></div>' +
        progressBar(p.progress, g.name) +
        '<div class="small muted">' + esc(Math.round(p.progress * 100) + '% · ' + eta) + '</div></div>';
    }).join('');
  }

  function progressBar(fraction, name) {
    var w = Math.round(clamp(fraction, 0, 1) * 1000) / 10;
    return '<div class="progress" role="progressbar" aria-label="' + esc(name) + ' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(w) + '">' +
      '<span class="progress-fill' + (w >= 100 ? ' done' : '') + '" style="width:' + w + '%"></span></div>';
  }

  /* ------------------------------------------------------------------ *
   * Income & taxes
   * ------------------------------------------------------------------ */

  var SOURCE_INFO = {
    expected: { title: 'Expected income', hint: 'The salary or wage you are aiming for in your job search. Use it to plan before your first paycheck.' },
    actual: { title: 'Actual income', hint: 'What you earn right now: a part-time job, internship, or your new job once you start.' }
  };

  function renderIncomeSources() {
    $('#income-sources').innerHTML = ['expected', 'actual'].map(function (key) {
      var inc = state.income[key];
      var info = SOURCE_INFO[key];
      var fields = inc.type === 'hourly'
        ? '<label class="field"><span class="field-label">Hourly wage ($)</span>' +
          '<input type="number" min="0" step="0.25" inputmode="decimal" data-income="' + key + '.hourly" value="' + esc(inc.hourly) + '"></label>' +
          '<label class="field"><span class="field-label">Hours per week</span>' +
          '<input type="number" min="0" max="100" step="1" inputmode="decimal" data-income="' + key + '.hours" value="' + esc(inc.hours) + '"></label>'
        : '<label class="field"><span class="field-label">Annual salary ($)</span>' +
          '<input type="number" min="0" step="500" inputmode="decimal" data-income="' + key + '.salary" value="' + esc(inc.salary) + '"></label>';
      return '<div class="source-card" data-source="' + key + '">' +
        '<div class="source-head"><h3>' + info.title + '</h3><span class="pill" data-source-pill="' + key + '">Used for budget</span></div>' +
        '<p class="hint">' + info.hint + '</p>' +
        '<div class="seg seg-small" role="radiogroup" aria-label="' + info.title + ' pay type" data-income-type="' + key + '">' +
        '<button type="button" role="radio" data-type="salary">Salary</button>' +
        '<button type="button" role="radio" data-type="hourly">Hourly</button></div>' +
        '<div class="form-grid">' + fields + '</div>' +
        '<div class="source-out" data-source-out="' + key + '"></div></div>';
    }).join('');
    ['expected', 'actual'].forEach(function (key) {
      setSeg($('[data-income-type="' + key + '"]'), 'data-type', state.income[key].type);
    });
  }

  function renderIncomeInputs() {
    setSeg($('#income-basis'), 'data-basis', state.income.basis);
    renderIncomeSources();
    var t = state.tax;
    $('#k401Pct').value = t.k401Pct;
    $('#k401Type').value = t.k401Type;
    $('#matchPct').value = t.matchPct;
    $('#healthMonthly').value = t.healthMonthly;
    $('#localPreset').innerHTML = T.LOCAL_PRESETS.map(function (p) {
      var label = p.name + (p.eit != null ? ' (' + p.eit + '% EIT)' : '');
      return '<option value="' + esc(p.id) + '">' + esc(label) + '</option>';
    }).join('');
    $('#localPreset').value = t.localPreset;
    $('#eitRate').value = t.eitRate;
    $('#lstEnabled').checked = t.lstEnabled;
    $('#lstAmount').value = t.lstAmount;
    $('#paForgiveness').checked = t.paForgiveness;
    renderPresetHint();
  }

  function renderPresetHint() {
    var p = T.LOCAL_PRESETS.filter(function (x) { return x.id === state.tax.localPreset; })[0];
    $('#localPresetHint').textContent = p && p.psd
      ? 'PSD code ' + p.psd + '. Several townships share the "East Stroudsburg 18301" mailing address. Check your tax bill or W-2 to confirm which one you live in.'
      : 'Enter the resident EIT rate for where you live. Several townships share the "East Stroudsburg" mailing address.';
    $('#lstAmount').disabled = !state.tax.lstEnabled;
  }

  function renderIncomeOutputs(m) {
    var per = PERIOD_NAME[state.payCycle];
    var n = m.n;
    ['expected', 'actual'].forEach(function (key) {
      var card = $('[data-source="' + key + '"]');
      if (!card) return;
      var used = state.income.basis === key;
      card.classList.toggle('is-active', used);
      $('[data-source-pill="' + key + '"]').hidden = !used;
      var p = key === state.income.basis ? m.pay : paycheckFor(key);
      $('[data-source-out="' + key + '"]').innerHTML = p.gross > 0
        ? '<div><span class="muted small">Gross</span><strong>' + esc(money(p.gross)) + '</strong><span class="muted small">/yr</span></div>' +
          '<div><span class="muted small">Take-home</span><strong>' + esc(money(p.takeHome / n)) + '</strong><span class="muted small">per ' + per + '</span></div>'
        : '<div class="muted small">Enter pay above to see your estimated take-home.</div>';
    });

    var pay = m.pay;
    var rows = [
      { label: 'Gross pay', v: pay.gross, cls: 'row-strong' },
      { label: 'Federal income tax', v: -pay.federalTax, note: 'after the ' + money(T.TAX.federal.standardDeduction) + ' standard deduction' },
      { label: 'Social Security (6.2%)', v: -pay.socialSecurity },
      { label: 'Medicare (1.45%)', v: -pay.medicare },
      { label: 'PA income tax (3.07%)', v: -pay.paTax, note: pay.paForgiven > 0 ? money(pay.paForgiven) + '/yr forgiven' : '' },
      { label: 'Local earned income tax (' + state.tax.eitRate + '%)', v: -pay.localEit },
      { label: 'Local Services Tax', v: -pay.lst, note: state.tax.lstEnabled && pay.gross > 0 && pay.gross < T.TAX.local.lstExemptBelow ? 'exempt under $12,000' : '' },
      { label: 'PA unemployment (0.07%)', v: -pay.paUC },
      { label: (pay.k401Type === 'roth' ? 'Roth' : 'Traditional') + ' 401(k) (' + state.tax.k401Pct + '%)', v: -pay.k401, note: pay.k401 > 0 ? 'this is savings, not a tax' : '' },
      { label: 'Pre-tax health insurance', v: -pay.health },
      { label: 'Take-home pay', v: pay.takeHome, cls: 'row-total' }
    ];
    $('#paycheck-table').innerHTML =
      '<thead><tr><th scope="col">Line</th><th scope="col" class="num">Per ' + esc(per) + '</th>' +
      '<th scope="col" class="num">Per year</th><th scope="col" class="num">% of gross</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var share = pay.gross > 0 ? Math.abs(r.v) / pay.gross * 100 : 0;
        return '<tr class="' + (r.cls || '') + '"><th scope="row">' + esc(r.label) +
          (r.note ? '<span class="row-note">' + esc(r.note) + '</span>' : '') + '</th>' +
          '<td class="num">' + esc(cents(r.v / n)) + '</td><td class="num">' + esc(money(r.v)) + '</td>' +
          '<td class="num">' + esc(pct(share)) + '</td></tr>';
      }).join('') + '</tbody>';

    $('#paycheck-sub').textContent = (state.income.basis === 'expected' ? 'Based on your expected income' : 'Based on your actual income') +
      ', shown per ' + per + ' (' + n + ' paychecks a year).';

    var notes = [];
    if (pay.gross > 0) {
      notes.push('<p><strong>Effective tax rate:</strong> ' + pct(pay.effectiveTaxRate * 100) + ' of gross pay. ' +
        '<strong>On your next dollar earned</strong> you keep about ' + Math.round((1 - pay.marginalRate) * 100) + '¢ (federal bracket ' +
        Math.round(pay.federalMarginal * 100) + '%).</p>');
    }
    if (pay.employerMatch > 0) {
      notes.push('<p><strong>Employer match:</strong> +' + money(pay.employerMatch) + '/yr goes into your 401(k) on top of your pay. That\'s free money.</p>');
    }
    if (pay.missedMatch > 0.5) {
      notes.push('<p class="tone-bad"><strong>You are leaving ' + money(pay.missedMatch) + '/yr of free match on the table.</strong> Raise your 401(k) to ' + state.tax.matchPct + '%.</p>');
    }
    if (pay.k401 > 0 && state.tax.k401Type === 'traditional') {
      notes.push('<p><strong>PA note:</strong> Pennsylvania and local EIT tax your 401(k) contributions now, so traditional 401(k) only lowers your federal tax.</p>');
    }
    if (state.tax.k401Pct > 0 && pay.gross * state.tax.k401Pct / 100 > T.TAX.limits.k401) {
      notes.push('<p><strong>401(k) capped</strong> at the 2026 limit of ' + money(T.TAX.limits.k401) + '.</p>');
    }
    notes.push('<p class="muted small">Estimate for budgeting only. Your real paycheck depends on your W-4, benefits, and employer payroll timing.</p>');
    $('#paycheck-notes').innerHTML = notes.join('');
  }

  /* ------------------------------------------------------------------ *
   * Budget editor
   * ------------------------------------------------------------------ */

  function sliderMax(it, p) {
    var base = it.range ? Math.max(10, Math.ceil(it.range[1] * 2 / 5) * 5) : 20;
    return Math.max(base, Math.ceil((p + 0.01) / 5) * 5);
  }

  function renderBudget() {
    var html = state.categories.map(function (c) {
      var r = c.range;
      var rangeTxt = r ? 'Recommended ' + r[0] + '–' + r[1] + '% of take-home' : 'No recommended range set';
      var blurb = blurbFor(c);
      var title = c.custom
        ? '<input type="text" class="name-input cat-name" data-act="cat-name" value="' + esc(c.name) + '" aria-label="Category name" maxlength="60">'
        : '<h3>' + esc(c.name) + '</h3>';
      var emoji = c.custom
        ? '<input type="text" class="emoji-input" data-act="cat-emoji" value="' + esc(c.emoji) + '" aria-label="Category emoji" maxlength="4">'
        : '<span class="cat-emoji" aria-hidden="true">' + esc(c.emoji) + '</span>';
      var items = c.items.map(function (it) { return renderItem(c, it); }).join('');
      var customTools = c.custom
        ? '<div class="custom-tools">' +
          '<label class="inline-field">Recommended range ' +
          '<input type="number" min="0" max="100" step="0.5" data-act="cat-range-min" value="' + (r ? r[0] : '') + '" aria-label="Recommended minimum percent">' +
          '–<input type="number" min="0" max="100" step="0.5" data-act="cat-range-max" value="' + (r ? r[1] : '') + '" aria-label="Recommended maximum percent">%</label>' +
          '<button type="button" class="btn btn-ghost btn-small btn-danger-text" data-act="cat-delete">Delete category</button></div>'
        : '';
      return '<article class="card cat-card" data-cat="' + esc(c.id) + '" style="--cat-color:' + seriesVar(c.slot) + '">' +
        '<header class="cat-head">' +
        '<label class="switch" title="Include this category in your budget">' +
        '<input type="checkbox" data-act="cat-toggle"' + (c.enabled ? ' checked' : '') + '>' +
        '<span class="switch-track" aria-hidden="true"></span><span class="sr-only">Include ' + esc(c.name) + '</span></label>' +
        '<span class="cat-swatch" aria-hidden="true"></span>' + emoji +
        '<div class="cat-title">' + title + '<p class="small muted">' + esc(rangeTxt) + '</p></div>' +
        '<div class="cat-total"><div class="cat-amt" data-cat-amt></div><div class="small muted" data-cat-pct></div><div data-cat-badge></div></div>' +
        '<button type="button" class="icon-btn" data-act="cat-collapse" aria-label="Show or hide line items">▾</button>' +
        '</header>' +
        (r ? '<div class="range-meter" data-cat-meter aria-hidden="true"><span class="range-band"></span><span class="range-mark"></span></div>' : '') +
        '<div class="cat-body" data-cat-body>' +
        (blurb ? '<p class="cat-blurb">' + esc(blurb) + '</p>' : '') +
        '<div class="cat-off-note" data-cat-off>This category is turned off and isn\'t counted in your budget.</div>' +
        '<div class="items" data-cat-items>' + items +
        '<div class="items-foot"><button type="button" class="btn btn-ghost btn-small" data-act="item-add">+ Add line item</button></div>' +
        customTools + '</div></div></article>';
    }).join('');
    $('#category-list').innerHTML = html;
    syncBudget(compute());
  }

  function renderItem(c, it) {
    var tip = tipFor(it);
    var typeOpts = TYPES.map(function (t) {
      return '<option value="' + t + '"' + (it.type === t ? ' selected' : '') + '>' + D.TYPE_LABELS[t] + '</option>';
    }).join('');
    var rangeAttr = it.range ? ' data-has-range' : '';
    return '<div class="item" data-item="' + esc(it.id) + '">' +
      '<div class="item-top">' +
      '<input type="checkbox" class="item-check" data-act="item-toggle"' + (it.enabled ? ' checked' : '') + ' aria-label="Include ' + esc(it.name) + '">' +
      '<input type="text" class="name-input" data-act="item-name" value="' + esc(it.name) + '" aria-label="Line item name" maxlength="80">' +
      '<select class="type-select type-' + it.type + '" data-act="item-type" aria-label="Type of spending" title="Need, want, savings or debt payment">' + typeOpts + '</select>' +
      (tip ? '<button type="button" class="icon-btn icon-btn-small" data-act="item-tip" aria-expanded="false" aria-label="Explain this line" title="What is this?">?</button>' : '') +
      '<button type="button" class="icon-btn icon-btn-small" data-act="item-delete" aria-label="Remove ' + esc(it.name) + '" title="Remove line">✕</button>' +
      '</div>' +
      '<div class="item-controls">' +
      '<input type="range" class="slider" data-act="item-slider" min="0" step="0.5"' + rangeAttr + ' aria-label="' + esc(it.name) + ', percent of take-home">' +
      '<label class="num-field"><input type="number" data-act="item-pct" min="0" max="100" step="0.5" inputmode="decimal" aria-label="' + esc(it.name) + ' percent"><span>%</span></label>' +
      '<label class="num-field money"><span>$</span><input type="number" data-act="item-amt" min="0" step="1" inputmode="decimal" aria-label="' + esc(it.name) + ' dollars per pay period"><span class="per" data-per></span></label>' +
      '<div class="seg seg-mini" role="radiogroup" aria-label="When income changes, keep this line as">' +
      '<button type="button" role="radio" data-act="item-mode" data-mode="pct" title="Keep as a % of pay (grows with income)">%</button>' +
      '<button type="button" role="radio" data-act="item-mode" data-mode="fixed" title="Keep as a fixed $ amount (for set bills)">$</button></div>' +
      '</div>' +
      '<div class="item-meta small"><span class="muted" data-item-range></span><span data-item-badge></span></div>' +
      (tip ? '<p class="item-tip" hidden>' + esc(tip) + '</p>' : '') +
      '</div>';
  }

  function syncBudget(m, force) {
    var active = force ? null : document.activeElement;
    var per = m.per;
    m.cats.forEach(function (x) {
      var card = $('[data-cat="' + cssEsc(x.cat.id) + '"]');
      if (!card) return;
      var c = x.cat;
      card.classList.toggle('is-off', !c.enabled);
      var collapsed = !!state.collapsed[c.id];
      $('[data-cat-body]', card).hidden = collapsed;
      var colBtn = $('[data-act="cat-collapse"]', card);
      colBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      colBtn.classList.toggle('is-collapsed', collapsed);
      $('[data-cat-off]', card).hidden = c.enabled;
      $('[data-cat-items]', card).hidden = !c.enabled;
      $('[data-cat-amt]', card).innerHTML = c.enabled
        ? esc(money(x.annual / m.n)) + '<span class="per">' + per + '</span>'
        : '<span class="muted">Off</span>';
      $('[data-cat-pct]', card).textContent = c.enabled ? pct(x.pct) + ' of take-home' : '';
      $('[data-cat-badge]', card).innerHTML = x.status.label ? badge(x.status.tone, x.status.label) : '';
      var meter = $('[data-cat-meter]', card);
      if (meter && c.range) {
        var max = Math.max(60, Math.ceil(c.range[1] * 1.6 / 10) * 10, Math.ceil(x.pct / 10) * 10);
        $('.range-band', meter).style.left = (c.range[0] / max * 100) + '%';
        $('.range-band', meter).style.width = ((c.range[1] - c.range[0]) / max * 100) + '%';
        var mark = $('.range-mark', meter);
        mark.style.left = clamp(x.pct / max * 100, 0, 100) + '%';
        mark.hidden = !c.enabled;
      }

      x.rows.forEach(function (row) {
        var it = row.item;
        var el = $('[data-item="' + cssEsc(it.id) + '"]', card);
        if (!el) return;
        el.classList.toggle('is-off', !it.enabled);
        var slider = $('[data-act="item-slider"]', el);
        var pctIn = $('[data-act="item-pct"]', el);
        var amtIn = $('[data-act="item-amt"]', el);
        var max = sliderMax(it, row.pct);
        slider.max = max;
        if (it.range) {
          slider.style.setProperty('--b0', (it.range[0] / max * 100) + '%');
          slider.style.setProperty('--b1', (it.range[1] / max * 100) + '%');
        }
        var noIncome = m.takeHome <= 0;
        slider.disabled = !it.enabled || (noIncome && it.mode === 'fixed');
        pctIn.disabled = slider.disabled;
        amtIn.disabled = !it.enabled || (noIncome && it.mode === 'pct');
        if (active !== slider) slider.value = row.pct;
        if (active !== pctIn) pctIn.value = noIncome && it.mode === 'fixed' ? '' : round1(row.pct);
        if (active !== amtIn) amtIn.value = amtInputValue(row.annual / m.n, it.mode === 'fixed');
        $('[data-per]', el).textContent = per;
        $all('[data-act="item-mode"]', el).forEach(function (b) {
          var on = b.getAttribute('data-mode') === it.mode;
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        var rangeEl = $('[data-item-range]', el);
        if (it.range) {
          var lo = m.takeHome * it.range[0] / 100 / m.n;
          var hi = m.takeHome * it.range[1] / 100 / m.n;
          rangeEl.textContent = 'Recommended ' + it.range[0] + '–' + it.range[1] + '%' +
            (m.takeHome > 0 ? ' (' + money(lo) + '–' + money(hi) + per + ')' : '');
        } else {
          rangeEl.textContent = it.mode === 'fixed' ? 'Fixed amount' : 'Custom line';
        }
        var st = it.enabled ? rangeStatus(row.pct, it.range, it.type) : { key: 'off' };
        $('[data-item-badge]', el).innerHTML = st.label && !(noIncome && it.mode === 'fixed') ? badge(st.tone, st.label) : '';
        var typeSel = $('[data-act="item-type"]', el);
        typeSel.className = 'type-select type-' + it.type;
      });
    });
    renderBudgetSummary(m);
  }

  function cssEsc(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  function renderBudgetSummary(m) {
    var per = m.per;
    var left = m.leftAnnual / m.n;
    var tone = m.takeHome <= 0 ? 'info' : Math.abs(left) < 1 ? 'good' : (left > 0 ? 'warn' : 'bad');
    var segs = m.cats.filter(function (x) { return x.cat.enabled && x.annual > 0; }).map(function (x) {
      var w = m.takeHome > 0 ? x.annual / Math.max(m.takeHome, m.allocatedAnnual) * 100 : 0;
      return '<span class="alloc-seg" style="width:' + w + '%;background:' + seriesVar(x.cat.slot) + '" title="' +
        esc(x.cat.name + ': ' + money(x.annual / m.n) + per + ' (' + pct(x.pct) + ')') + '"></span>';
    }).join('');
    var leftText = m.takeHome <= 0 ? 'No income yet'
      : Math.abs(left) < 1
      ? STATUS_ICON.good + ' Every dollar has a job'
      : (left > 0 ? money(left) + per + ' left to assign (' + pct(m.leftPct) + ')' : STATUS_ICON.bad + ' Over by ' + money(-left) + per);
    var noIncome = m.takeHome <= 0
      ? '<p class="banner banner-warn"><span class="banner-icon" aria-hidden="true">!</span><span>No income to budget yet. Add an expected salary on <a href="#income" data-goto="income">Income &amp; Taxes</a>, or switch to Expected income. Percentages are kept so your plan is ready.</span></p>'
      : '';
    $('#budget-summary').innerHTML =
      '<div class="summary-row">' +
      '<div><div class="stat-label">Take-home pay</div><div class="summary-num">' + esc(money(m.takeHome / m.n)) + '<span class="per">' + per + '</span></div></div>' +
      '<div><div class="stat-label">Planned</div><div class="summary-num">' + esc(money(m.allocatedAnnual / m.n)) + '<span class="per">' + per + '</span></div><div class="small muted">' + esc(pct(m.allocatedPct)) + ' of take-home</div></div>' +
      '<div><div class="stat-label">Status</div><div class="summary-left tone-' + tone + '">' + esc(leftText) + '</div></div>' +
      '<div class="summary-actions">' +
      (left >= 1 ? '<button type="button" class="btn btn-primary" data-act="sweep">Send leftover to savings</button>' : '') +
      '</div></div>' +
      '<div class="alloc-bar" aria-hidden="true">' + segs + '</div>';
    $('#budget-help').innerHTML = noIncome +
      '<p class="small muted">Slide or type a % <em>or</em> a dollar amount. Use the <strong>% / $</strong> switch to choose whether a line grows with your pay (%) or stays a fixed bill ($). The green band on each slider is the recommended range.</p>';
  }

  function findItem(itemId) {
    for (var i = 0; i < state.categories.length; i++) {
      var c = state.categories[i];
      for (var j = 0; j < c.items.length; j++) {
        if (c.items[j].id === itemId) return { cat: c, item: c.items[j], index: j };
      }
    }
    return null;
  }
  function findCategory(catId) {
    return state.categories.filter(function (c) { return c.id === catId; })[0] || null;
  }

  function setItemPct(it, p, takeHome) {
    p = clamp(p, 0, 100);
    if (it.mode === 'pct') it.pct = p;
    else if (takeHome > 0) it.annual = takeHome * p / 100;
  }
  function setItemAmount(it, perPeriod, takeHome, n) {
    var annual = Math.max(0, perPeriod) * n;
    if (it.mode === 'fixed') it.annual = annual;
    else if (takeHome > 0) it.pct = clamp(annual / takeHome * 100, 0, 100);
  }

  function nextFreeSlot() {
    var used = {};
    state.categories.forEach(function (c) { used[c.slot] = true; });
    for (var s = 1; s <= MAX_SLOTS; s++) if (!used[s]) return s;
    return 0;
  }

  function sweepLeftover() {
    var m = compute();
    if (m.leftAnnual / m.n < 1 || m.takeHome <= 0) return;
    var target = null;
    var prefer = ['save-invest', 'save-emergency'];
    prefer.forEach(function (id) {
      var r = m.items[id];
      if (!target && r && r.active) target = r.item;
    });
    if (!target) {
      Object.keys(m.items).forEach(function (id) {
        var r = m.items[id];
        if (!target && r.active && r.item.type === 'save') target = r.item;
      });
    }
    if (!target) {
      window.alert('Turn on a savings line first (for example in "Aggressive Savings & Investing").');
      return;
    }
    if (target.mode === 'pct') target.pct += m.leftPct;
    else target.annual += m.leftAnnual;
    refresh();
  }

  /* ------------------------------------------------------------------ *
   * Goals
   * ------------------------------------------------------------------ */

  function renderGoals(m) {
    var ef = state.goals.filter(function (g) { return g.kind === 'emergency'; })[0];
    var essentials = m.essentialsMonthly;
    var rentRow = m.items['housing-rent'];
    var rentMonthly = rentRow ? rentRow.annual / 12 : 0;
    var tips = [];
    tips.push('<div class="tip"><h3>🛟 Emergency fund</h3><p>Aim for 3–6 months of essential expenses (needs + loan payments). In your budget that\'s about ' +
      '<strong>' + esc(money(essentials)) + '/month</strong>, so a target of <strong>' + esc(money(essentials * 3)) + '–' + esc(money(essentials * 6)) + '</strong>. ' +
      'Your costs will rise when you move out, so lean toward the high end.</p>' +
      (ef && essentials > 0 ? '<button type="button" class="btn btn-small" data-act="goal-suggest" data-goal="' + esc(ef.id) + '" data-amount="' + Math.round(essentials * 6 / 100) * 100 + '">Set target to ' + esc(money(Math.round(essentials * 6 / 100) * 100)) + '</button>' : '') +
      '</div>');
    tips.push('<div class="tip"><h3>🚗 Car down payment</h3><p>Put at least 20% down on a reliable used car: a $20,000 car means about <strong>$4,000</strong>. ' +
      'Also set aside PA\'s 6% sales tax plus title and registration fees (about $1,300–$1,500 on a $20,000 car) so they don\'t end up in the loan.</p></div>');
    tips.push('<div class="tip"><h3>🔑 First apartment</h3><p>Pennsylvania caps a security deposit at 2 months\' rent in the first year of a lease. Plan for first month + deposit + about $1,200 for moving and basics' +
      (rentMonthly > 0 ? ': with rent of ' + esc(money(rentMonthly)) + '/mo (your Future Rent line), that\'s up to <strong>' + esc(money(rentMonthly * 3 + 1200)) + '</strong>.' : '.') +
      '</p></div>');
    $('#goal-tips').innerHTML = tips.join('');

    if (!state.goals.length) {
      $('#goal-list').innerHTML = '<div class="card empty"><p>No goals yet.</p><button type="button" class="btn btn-primary" data-act="goal-new">+ Create your first goal</button></div>';
      return;
    }
    $('#goal-list').innerHTML = state.goals.map(function (g) {
      var p = goalProjection(g, m);
      var src;
      if (p.contrib.row) {
        src = 'Funded by <strong>' + esc(p.contrib.row.item.name) + '</strong>: ' + esc(money(p.contrib.amount)) + '/mo' +
          (p.contrib.row.active ? '' : ' <span class="muted">(this line is turned off)</span>');
      } else if (g.linkedItemId) {
        src = 'Linked budget line was removed. ' + esc(money(g.manualMonthly)) + '/mo planned.';
      } else {
        src = 'Manual contribution: ' + esc(money(g.manualMonthly)) + '/mo';
      }
      var status;
      if (p.done) {
        status = badge('good', '✓ Goal reached') + ' <span>Nice work! Consider raising the target or starting your next goal.</span>';
      } else if (p.deadlinePassed) {
        status = badge('warn', '! Target date passed') + ' <span>Pick a new date to get a monthly target.</span>';
      } else if (p.needed != null) {
        status = (p.onTrack ? badge('good', '✓ On track') : badge('warn', '! Behind')) +
          ' <span>To reach it by ' + esc(p.targetLabel) + ' you need ' + esc(money(p.needed)) + '/mo' +
          (p.onTrack ? '.' : ': ' + esc(money(p.needed - p.contrib.amount)) + '/mo more than planned.') + '</span>';
      } else if (p.eta) {
        status = badge('info', '↗ On pace') + ' <span>At ' + esc(money(p.contrib.amount)) + '/mo you\'ll get there in ' +
          p.months + ' month' + (p.months === 1 ? '' : 's') + ' (' + esc(monthLabel(p.eta)) + ').</span>';
      } else {
        status = badge('warn', '! No contribution') + ' <span>Link a budget line or add a monthly amount to see when you\'ll get there.</span>';
      }
      var last = g.history.length ? g.history[g.history.length - 1] : null;
      return '<article class="card goal-card" data-goal="' + esc(g.id) + '">' +
        '<div class="goal-head"><span class="goal-emoji" aria-hidden="true">' + esc(g.emoji) + '</span>' +
        '<div class="goal-title"><h3>' + esc(g.name) + '</h3><p class="small muted">' + src + '</p></div>' +
        '<div class="goal-actions">' +
        '<button type="button" class="btn btn-primary btn-small" data-act="goal-deposit">+ Log money</button>' +
        '<button type="button" class="btn btn-small" data-act="goal-edit">Edit</button>' +
        '<button type="button" class="btn btn-ghost btn-small btn-danger-text" data-act="goal-delete" aria-label="Delete ' + esc(g.name) + '">Delete</button>' +
        '</div></div>' +
        '<div class="goal-amounts"><span class="goal-saved">' + esc(money(g.saved)) + '</span>' +
        '<span class="muted"> of ' + esc(money(g.target)) + '</span><span class="goal-pct">' + Math.round(p.progress * 100) + '%</span></div>' +
        progressBar(p.progress, g.name) +
        '<p class="goal-status">' + status + '</p>' +
        (last ? '<p class="small muted">Last logged: ' + (last.a >= 0 ? '+' : '−') + esc(cents(Math.abs(last.a))) + (last.d ? ' on ' + esc(last.d) : '') + '</p>' : '') +
        '</article>';
    }).join('');
  }

  var editingGoalId = null;
  function openGoalDialog(goalId) {
    var dlg = $('#goal-dialog');
    var form = $('#goal-form');
    var g = goalId ? state.goals.filter(function (x) { return x.id === goalId; })[0] : null;
    editingGoalId = g ? g.id : null;
    $('#goal-dialog-title').textContent = g ? 'Edit goal' : 'New savings goal';
    var opts = '<option value="">Not linked (use monthly amount below)</option>';
    state.categories.forEach(function (c) {
      var its = c.items.filter(function (it) { return it.type === 'save' || (g && g.linkedItemId === it.id); });
      if (!its.length) return;
      opts += '<optgroup label="' + esc(c.emoji + ' ' + c.name) + '">' + its.map(function (it) {
        return '<option value="' + esc(it.id) + '">' + esc(it.name) + '</option>';
      }).join('') + '</optgroup>';
    });
    var f = form.elements;
    f.goalLink.innerHTML = opts;
    f.goalEmoji.value = g ? g.emoji : '🎯';
    f.goalName.value = g ? g.name : '';
    f.goalTarget.value = g ? g.target : '';
    f.goalSaved.value = g ? g.saved : 0;
    f.goalDate.value = g ? g.targetDate : '';
    f.goalLink.value = g && findItem(g.linkedItemId) ? g.linkedItemId : '';
    f.goalMonthly.value = g ? g.manualMonthly : 0;
    showDialog(dlg);
    f.goalName.focus();
  }

  function saveGoalFromForm() {
    var f = $('#goal-form').elements;
    var data = {
      emoji: (f.goalEmoji.value || '🎯').trim().slice(0, 4) || '🎯',
      name: f.goalName.value.trim().slice(0, 60) || 'Savings goal',
      target: Math.max(1, num(f.goalTarget.value, 1)),
      saved: Math.max(0, num(f.goalSaved.value)),
      targetDate: /^\d{4}-\d{2}$/.test(f.goalDate.value) ? f.goalDate.value : '',
      linkedItemId: f.goalLink.value,
      manualMonthly: Math.max(0, num(f.goalMonthly.value))
    };
    if (editingGoalId) {
      var g = state.goals.filter(function (x) { return x.id === editingGoalId; })[0];
      if (g) Object.keys(data).forEach(function (k) { g[k] = data[k]; });
    } else {
      data.id = uid('goal');
      data.kind = 'custom';
      data.history = [];
      state.goals.push(data);
    }
    refresh();
  }

  var depositGoalId = null;
  var depositKind = 'add';
  function openDepositDialog(goalId) {
    var g = state.goals.filter(function (x) { return x.id === goalId; })[0];
    if (!g) return;
    depositGoalId = goalId;
    depositKind = 'add';
    setSeg($('#deposit-kind'), 'data-kind', 'add');
    $('#deposit-goal-name').textContent = g.emoji + ' ' + g.name + ': ' + money(g.saved) + ' saved so far';
    var amountIn = $('#deposit-form').elements.depositAmount;
    amountIn.value = '';
    showDialog($('#deposit-dialog'));
    amountIn.focus();
  }

  function saveDeposit() {
    var g = state.goals.filter(function (x) { return x.id === depositGoalId; })[0];
    var amount = num($('#deposit-form').elements.depositAmount.value);
    if (!g || !(amount > 0)) return;
    var signed = depositKind === 'withdraw' ? -Math.min(amount, g.saved) : amount;
    g.saved = Math.max(0, Math.round((g.saved + signed) * 100) / 100);
    g.history.push({ d: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), a: signed });
    if (g.history.length > 50) g.history = g.history.slice(-50);
    refresh();
  }

  function showDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }

  /* ------------------------------------------------------------------ *
   * Game plan
   * ------------------------------------------------------------------ */

  function renderPlan() {
    var total = 0, done = 0;
    var html = D.CHECKLIST.map(function (group) {
      return '<div class="plan-group"><h3>' + esc(group.group) + '</h3><ul class="plan-list">' +
        group.steps.map(function (s) {
          total++;
          var on = !!state.checklist[s.id];
          if (on) done++;
          return '<li class="plan-step' + (on ? ' is-done' : '') + '"><label>' +
            '<input type="checkbox" data-plan="' + esc(s.id) + '"' + (on ? ' checked' : '') + '>' +
            '<span><span class="plan-title">' + esc(s.title) + '</span><span class="plan-body">' + esc(s.body) + '</span></span>' +
            '</label></li>';
        }).join('') + '</ul></div>';
    }).join('');
    $('#plan-checklist').innerHTML = html;
    $('#plan-progress').innerHTML = '<div class="progress-line-top"><strong>' + done + ' of ' + total + ' steps done</strong></div>' +
      progressBar(total ? done / total : 0, 'Game plan');
  }

  /* ------------------------------------------------------------------ *
   * Header, tabs, theme
   * ------------------------------------------------------------------ */

  function renderHeader() {
    setSeg($('#pay-cycle'), 'data-cycle', state.payCycle);
    $('#theme-select').value = state.theme;
  }

  function setTab(tab, focus) {
    if (TABS.indexOf(tab) < 0) tab = 'dashboard';
    state.tab = tab;
    TABS.forEach(function (t) {
      var btn = $('#tab-' + t);
      var panel = $('#panel-' + t);
      var on = t === tab;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
    if (focus) $('#tab-' + tab).focus();
    if (history.replaceState) history.replaceState(null, '', '#' + tab);
    if (tab === 'dashboard' && chart) chart.resize();
    scheduleSave();
  }

  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function effectiveTheme() {
    if (state.theme === 'light' || state.theme === 'dark') return state.theme;
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }
  function applyTheme() {
    var root = document.documentElement;
    if (state.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
    var btn = $('#theme-toggle');
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.title = 'Switch to ' + next + ' theme';
    btn.textContent = effectiveTheme() === 'dark' ? '☀' : '☾';
    if (chart) renderChart(compute());
  }

  /* ------------------------------------------------------------------ *
   * Refresh cycle
   * ------------------------------------------------------------------ */

  function refresh() {
    var m = compute();
    renderDashboard(m);
    renderIncomeOutputs(m);
    syncBudget(m);
    renderGoals(m);
    scheduleSave();
  }

  function renderAll() {
    renderHeader();
    renderIncomeInputs();
    renderBudget();
    renderPlan();
    applyTheme();
    refresh();
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  function bindSeg(container, attr, onPick) {
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[' + attr + ']');
      if (b && container.contains(b)) onPick(b.getAttribute(attr), b);
    });
    container.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
      var btns = $all('[' + attr + ']', container);
      var i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = btns[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + btns.length) % btns.length];
      next.focus();
      onPick(next.getAttribute(attr), next);
    });
  }

  function bindEvents() {
    // Pay cycle
    bindSeg($('#pay-cycle'), 'data-cycle', function (v) {
      if (!PERIODS[v]) return;
      state.payCycle = v;
      renderHeader();
      refresh();
    });

    // Theme
    $('#theme-toggle').addEventListener('click', function () {
      state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
      renderHeader();
      applyTheme();
      scheduleSave();
    });
    $('#theme-select').addEventListener('change', function (e) {
      state.theme = e.target.value;
      applyTheme();
      scheduleSave();
    });
    if (darkQuery) {
      var onScheme = function () { if (state.theme === 'auto') applyTheme(); };
      if (darkQuery.addEventListener) darkQuery.addEventListener('change', onScheme);
      else if (darkQuery.addListener) darkQuery.addListener(onScheme);
    }

    // Tabs
    var tablist = $('.tabs');
    tablist.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) setTab(b.getAttribute('data-tab'));
    });
    tablist.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      var i = TABS.indexOf(state.tab);
      var next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowLeft' ? -1 : 1) + TABS.length) % TABS.length;
      e.preventDefault();
      setTab(TABS[next], true);
    });
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto]');
      if (g) {
        e.preventDefault();
        setTab(g.getAttribute('data-goto'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (e.target.closest('[data-act="use-expected"]')) {
        state.income.basis = 'expected';
        setSeg($('#income-basis'), 'data-basis', 'expected');
        refresh();
      }
    });
    window.addEventListener('hashchange', function () {
      var t = location.hash.replace('#', '');
      if (TABS.indexOf(t) >= 0 && t !== state.tab) setTab(t);
    });

    // Income
    bindSeg($('#income-basis'), 'data-basis', function (v) {
      state.income.basis = v === 'actual' ? 'actual' : 'expected';
      setSeg($('#income-basis'), 'data-basis', state.income.basis);
      refresh();
    });
    var sources = $('#income-sources');
    sources.addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      var seg = b && b.closest('[data-income-type]');
      if (!seg) return;
      var key = seg.getAttribute('data-income-type');
      state.income[key].type = b.getAttribute('data-type') === 'hourly' ? 'hourly' : 'salary';
      renderIncomeSources();
      refresh();
      var again = $('[data-income-type="' + key + '"] [data-type="' + state.income[key].type + '"]');
      if (again) again.focus();
    });
    sources.addEventListener('input', function (e) {
      var path = e.target.getAttribute('data-income');
      if (!path) return;
      var parts = path.split('.');
      var v = Math.max(0, num(e.target.value));
      if (parts[1] === 'hours') v = Math.min(v, 100);
      state.income[parts[0]][parts[1]] = v;
      refresh();
    });

    function bindNumber(id, key, lo, hi) {
      $('#' + id).addEventListener('input', function (e) {
        state.tax[key] = clamp(num(e.target.value), lo, hi);
        if (key === 'eitRate') {
          var p = T.LOCAL_PRESETS.filter(function (x) { return x.id === state.tax.localPreset; })[0];
          if (p && p.eit != null && p.eit !== state.tax.eitRate) {
            state.tax.localPreset = 'custom';
            $('#localPreset').value = 'custom';
            renderPresetHint();
          }
        }
        refresh();
      });
    }
    bindNumber('k401Pct', 'k401Pct', 0, 100);
    bindNumber('matchPct', 'matchPct', 0, 100);
    bindNumber('healthMonthly', 'healthMonthly', 0, 1e6);
    bindNumber('eitRate', 'eitRate', 0, 10);
    bindNumber('lstAmount', 'lstAmount', 0, T.TAX.local.lstMax);
    $('#k401Type').addEventListener('change', function (e) {
      state.tax.k401Type = e.target.value === 'roth' ? 'roth' : 'traditional';
      refresh();
    });
    $('#lstEnabled').addEventListener('change', function (e) {
      state.tax.lstEnabled = e.target.checked;
      renderPresetHint();
      refresh();
    });
    $('#paForgiveness').addEventListener('change', function (e) {
      state.tax.paForgiveness = e.target.checked;
      refresh();
    });
    $('#localPreset').addEventListener('change', function (e) {
      var p = T.LOCAL_PRESETS.filter(function (x) { return x.id === e.target.value; })[0];
      if (!p) return;
      state.tax.localPreset = p.id;
      if (p.eit != null) {
        state.tax.eitRate = p.eit;
        state.tax.lstAmount = p.lst;
        $('#eitRate').value = p.eit;
        $('#lstAmount').value = p.lst;
      }
      renderPresetHint();
      refresh();
    });
    // Tidy number fields when the user leaves them.
    $all('#panel-income input[type="number"]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (inp.value === '') inp.value = 0;
      });
    });

    // Budget editor (event delegation)
    var list = $('#category-list');
    list.addEventListener('input', function (e) {
      var act = e.target.getAttribute('data-act');
      var itemEl = e.target.closest('[data-item]');
      var catEl = e.target.closest('[data-cat]');
      var m;
      if (act === 'item-slider' || act === 'item-pct' || act === 'item-amt') {
        var f = findItem(itemEl.getAttribute('data-item'));
        if (!f) return;
        m = compute();
        if (act === 'item-amt') setItemAmount(f.item, num(e.target.value), m.takeHome, m.n);
        else setItemPct(f.item, num(e.target.value), m.takeHome);
        refresh();
      } else if (act === 'item-name') {
        var fi = findItem(itemEl.getAttribute('data-item'));
        if (fi) { fi.item.name = e.target.value.slice(0, 80); refresh(); }
      } else if (act === 'cat-name' || act === 'cat-emoji') {
        var c = findCategory(catEl.getAttribute('data-cat'));
        if (!c) return;
        if (act === 'cat-name') c.name = e.target.value.slice(0, 60);
        else c.emoji = e.target.value.slice(0, 4);
        refresh();
      } else if (act === 'cat-range-min' || act === 'cat-range-max') {
        var cc = findCategory(catEl.getAttribute('data-cat'));
        if (!cc) return;
        var minIn = $('[data-act="cat-range-min"]', catEl).value;
        var maxIn = $('[data-act="cat-range-max"]', catEl).value;
        cc.range = minIn === '' || maxIn === '' ? null : normalizeRange([minIn, maxIn]);
        refresh();
      }
    });
    list.addEventListener('change', function (e) {
      var act = e.target.getAttribute('data-act');
      var itemEl = e.target.closest('[data-item]');
      var catEl = e.target.closest('[data-cat]');
      if (act === 'item-toggle') {
        var f = findItem(itemEl.getAttribute('data-item'));
        if (f) f.item.enabled = e.target.checked;
        refresh();
      } else if (act === 'cat-toggle') {
        var c = findCategory(catEl.getAttribute('data-cat'));
        if (c) c.enabled = e.target.checked;
        refresh();
      } else if (act === 'item-type') {
        var fi = findItem(itemEl.getAttribute('data-item'));
        if (fi && TYPES.indexOf(e.target.value) >= 0) fi.item.type = e.target.value;
        refresh();
      } else if (act === 'item-pct' || act === 'item-amt') {
        // Tidy the number the user just committed (e.g. "10.25" -> "10.3").
        syncBudget(compute(), true);
      } else if (act === 'item-name') {
        var fn = findItem(itemEl.getAttribute('data-item'));
        if (fn && !fn.item.name.trim()) { fn.item.name = 'Line item'; e.target.value = fn.item.name; refresh(); }
      } else if (act === 'cat-name') {
        var cn = findCategory(catEl.getAttribute('data-cat'));
        if (cn && !cn.name.trim()) { cn.name = 'Custom category'; e.target.value = cn.name; refresh(); }
      } else if (act === 'cat-range-min' || act === 'cat-range-max') {
        renderBudget();
      }
    });
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn || btn.tagName === 'INPUT' || btn.tagName === 'SELECT') return;
      var act = btn.getAttribute('data-act');
      var itemEl = btn.closest('[data-item]');
      var catEl = btn.closest('[data-cat]');
      var cat = catEl ? findCategory(catEl.getAttribute('data-cat')) : null;
      if (act === 'item-mode') {
        var f = findItem(itemEl.getAttribute('data-item'));
        var mode = btn.getAttribute('data-mode');
        if (!f || f.item.mode === mode) return;
        var m = compute();
        var row = m.items[f.item.id];
        if (mode === 'fixed') {
          f.item.annual = row.annual;
        } else if (m.takeHome > 0) {
          f.item.pct = round1(row.pct);
        }
        f.item.mode = mode;
        refresh();
      } else if (act === 'item-tip') {
        var tip = $('.item-tip', itemEl);
        if (!tip) return;
        tip.hidden = !tip.hidden;
        btn.setAttribute('aria-expanded', tip.hidden ? 'false' : 'true');
      } else if (act === 'item-delete') {
        var fd = findItem(itemEl.getAttribute('data-item'));
        if (!fd || !window.confirm('Remove "' + fd.item.name + '" from ' + fd.cat.name + '?')) return;
        fd.cat.items.splice(fd.index, 1);
        unlinkGoals(fd.item.id);
        renderBudget();
        refresh();
      } else if (act === 'item-add' && cat) {
        var type = cat.items.length ? cat.items[cat.items.length - 1].type : 'want';
        var it = { id: uid('item'), name: 'New line item', type: type, enabled: true, mode: 'pct', pct: 0, annual: 0, range: null, custom: true };
        cat.items.push(it);
        state.collapsed[cat.id] = false;
        renderBudget();
        refresh();
        var inp = $('[data-item="' + cssEsc(it.id) + '"] [data-act="item-name"]');
        if (inp) { inp.focus(); inp.select(); }
      } else if (act === 'cat-collapse' && cat) {
        state.collapsed[cat.id] = !state.collapsed[cat.id];
        syncBudget(compute());
        scheduleSave();
      } else if (act === 'cat-delete' && cat) {
        if (!window.confirm('Delete the "' + cat.name + '" category and all its lines?')) return;
        cat.items.forEach(function (x) { unlinkGoals(x.id); });
        state.categories = state.categories.filter(function (c) { return c.id !== cat.id; });
        renderBudget();
        refresh();
      }
    });

    $('#budget-summary').addEventListener('click', function (e) {
      if (e.target.closest('[data-act="sweep"]')) sweepLeftover();
    });

    $('#add-category').addEventListener('click', function () {
      var c = {
        id: uid('cat'), name: 'New category', emoji: '📦', slot: nextFreeSlot(), enabled: true, range: null, custom: true,
        items: [{ id: uid('item'), name: 'New line item', type: 'want', enabled: true, mode: 'pct', pct: 0, annual: 0, range: null, custom: true }]
      };
      state.categories.push(c);
      renderBudget();
      refresh();
      var inp = $('[data-cat="' + cssEsc(c.id) + '"] [data-act="cat-name"]');
      if (inp) { inp.focus(); inp.select(); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    });
    $('#reset-budget').addEventListener('click', function () {
      if (!window.confirm('Reset every category and line item to the recommended defaults? Your income, taxes and goals are kept.')) return;
      state.categories = defaultCategories();
      state.collapsed = {};
      renderBudget();
      refresh();
    });

    // Goals
    $('#add-goal').addEventListener('click', function () { openGoalDialog(null); });
    $('#panel-goals').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var card = btn.closest('[data-goal]');
      var id = card ? card.getAttribute('data-goal') : btn.getAttribute('data-goal');
      if (act === 'goal-new') openGoalDialog(null);
      else if (act === 'goal-edit') openGoalDialog(id);
      else if (act === 'goal-deposit') openDepositDialog(id);
      else if (act === 'goal-delete') {
        var g = state.goals.filter(function (x) { return x.id === id; })[0];
        if (!g || !window.confirm('Delete the goal "' + g.name + '"?')) return;
        state.goals = state.goals.filter(function (x) { return x.id !== id; });
        refresh();
      } else if (act === 'goal-suggest') {
        var sg = state.goals.filter(function (x) { return x.id === btn.getAttribute('data-goal'); })[0];
        if (sg) { sg.target = Math.max(100, num(btn.getAttribute('data-amount'))); refresh(); }
      }
    });
    $('#goal-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      saveGoalFromForm();
      closeDialog($('#goal-dialog'));
    });
    $('#deposit-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      saveDeposit();
      closeDialog($('#deposit-dialog'));
    });
    bindSeg($('#deposit-kind'), 'data-kind', function (v) {
      depositKind = v === 'withdraw' ? 'withdraw' : 'add';
      setSeg($('#deposit-kind'), 'data-kind', depositKind);
    });
    $all('dialog [data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeDialog(b.closest('dialog')); });
    });

    // Game plan
    $('#plan-checklist').addEventListener('change', function (e) {
      var id = e.target.getAttribute('data-plan');
      if (!id) return;
      state.checklist[id] = e.target.checked;
      renderPlan();
      scheduleSave();
    });

    // Data
    $('#export-data').addEventListener('click', exportData);
    $('#import-data').addEventListener('change', importData);
    $('#reset-all').addEventListener('click', function () {
      if (!window.confirm('Erase ALL your budget data in this browser and start fresh? Download a backup first if you might want it.')) return;
      var theme = state.theme;
      state = defaultState();
      state.theme = theme;
      renderAll();
      setTab('dashboard');
      saveNow();
    });

    window.addEventListener('beforeunload', function () { if (saveTimer) saveNow(); });
  }

  function unlinkGoals(itemId) {
    state.goals.forEach(function (g) {
      if (g.linkedItemId === itemId) g.linkedItemId = '';
    });
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = 'grad-budget-backup-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importData(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.categories)) throw new Error('missing categories');
        if (!window.confirm('Replace your current budget with this backup?')) return;
        state = normalize(parsed);
        renderAll();
        setTab(state.tab);
        saveNow();
      } catch (err) {
        window.alert('That file doesn\'t look like a Grad Budget backup.');
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  // Keep the sticky budget summary tucked right under the sticky header.
  function trackHeaderHeight() {
    var header = $('.app-header');
    var set = function () { document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px'); };
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(header);
    else window.addEventListener('resize', set);
  }

  function init() {
    trackHeaderHeight();
    bindEvents();
    renderAll();
    var fromHash = location.hash.replace('#', '');
    setTab(TABS.indexOf(fromHash) >= 0 ? fromHash : state.tab);
    if (!storageOk) setSaveStatus('⚠ Not saved: browser storage is blocked');
    else setSaveStatus('Saved in this browser ✓');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
