/* ============================================================
   PawPal — state, router, sheets, gestures, counters, charts
   No dependencies, no modules, no network. Runs from file://
   ES5 only, so it works on older browsers too.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inr(n) { return Number(n).toLocaleString('en-IN'); }
  function cap(v) { return v ? v.charAt(0).toUpperCase() + v.slice(1) : v; }

  /* ============================================================
     1. State
     Everything the owner types in onboarding lives here, and every
     screen reads from it. Nothing about the pet is hard-coded in
     the markup any more.
     ============================================================ */

  var SPECIES = {
    dog: { one: 'dog', many: 'dogs', kcalPerKg: 67, food: 'kibble' },
    cat: { one: 'cat', many: 'cats', kcalPerKg: 60, food: 'wet food' },
    rabbit: { one: 'rabbit', many: 'rabbits', kcalPerKg: 45, food: 'pellets' },
    bird: { one: 'bird', many: 'birds', kcalPerKg: 80, food: 'seed mix' }
  };

  var OWNER = 'Aarav';

  var PETS = [
    {
      name: 'Bruno', species: 'dog', breed: 'Indie', sex: 'male',
      age: '4 yr', years: 4, weight: 18.4, since: 'March 2022',
      allergies: 'Chicken, dust mites', grams: 360,
      lastSeen: 'Koramangala 5th Block', reward: '5,000'
    },
    {
      name: 'Mishti', species: 'cat', breed: 'Indian shorthair', sex: 'female',
      age: '2 yr', years: 2, weight: 4.2, since: 'July 2024',
      allergies: 'None on file', grams: 230,
      lastSeen: 'Koramangala 5th Block', reward: '3,000'
    }
  ];
  var petIndex = 0;
  function pet() { return PETS[petIndex]; }

  var SPEND = [
    { name: 'Food', value: 1650, colour: '#23372B' },
    { name: 'Vet', value: 890, colour: '#E8A33D' },
    { name: 'Medicines', value: 300, colour: '#E7C8BE' },
    { name: 'Grooming', value: 0, colour: '#C9C2B2' },
    { name: 'Treats', value: 0, colour: '#A9BBA2' }
  ];
  function spendTotal() {
    var t = 0;
    for (var i = 0; i < SPEND.length; i++) { t += SPEND[i].value; }
    return t;
  }

  /* how every bound span in the markup gets its text */
  var BIND = {
    name: function (p) { return p.name; },
    'name-poss': function (p) { return p.name + '’s'; },
    owner: function () { return OWNER; },
    greeting: function () {
      var h = new Date().getHours();
      return h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
    },
    today: function () {
      var d = new Date();
      var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var mons = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];
      return days[d.getDay()] + ', ' + d.getDate() + ' ' + mons[d.getMonth()];
    },
    species: function (p) { return SPECIES[p.species].one; },
    speciesPlural: function (p) { return SPECIES[p.species].many; },
    breed: function (p) { return p.breed; },
    sex: function (p) { return cap(p.sex); },
    sexLower: function (p) { return p.sex; },
    age: function (p) { return p.age; },
    weight: function (p) { return p.weight.toFixed(1); },
    since: function (p) { return p.since; },
    allergies: function (p) { return p.allergies; },
    grams: function (p) { return String(p.grams); },
    halfGrams: function (p) { return String(Math.round(p.grams / 2)); },
    kcal: function (p) { return inr(Math.round(p.weight * SPECIES[p.species].kcalPerKg)); },
    spend: function () { return inr(spendTotal()); },
    lastSeen: function (p) { return p.lastSeen; },
    reward: function (p) { return p.reward; },
    they: function (p) { return p.sex === 'female' ? 'she' : 'he'; },
    They: function (p) { return p.sex === 'female' ? 'She' : 'He'; },
    their: function (p) { return p.sex === 'female' ? 'her' : 'his'; },
    them: function (p) { return p.sex === 'female' ? 'her' : 'him'; },
    askPlaceholder: function (p) { return 'Ask about ' + p.name; }
  };

  /* numeric bindings feed the count-up figures */
  var BIND_COUNT = {
    weight: function (p) { return p.weight; },
    years: function (p) { return p.years; },
    grams: function (p) { return p.grams; }
  };

  function render() {
    var p = pet();

    $$('[data-bind]').forEach(function (el) {
      var fn = BIND[el.getAttribute('data-bind')];
      if (fn) { el.textContent = fn(p); }
    });

    $$('[data-ph]').forEach(function (el) {
      var fn = BIND[el.getAttribute('data-ph')];
      if (fn) { el.placeholder = fn(p); }
    });

    $$('[data-bind-count]').forEach(function (el) {
      var fn = BIND_COUNT[el.getAttribute('data-bind-count')];
      if (!fn) return;
      var v = fn(p);
      el.setAttribute('data-count', v);
      /* show the true value at rest, and let it count up again on next entry */
      var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
      el.textContent = v.toFixed(dec) + (el.getAttribute('data-suffix') || '');
      el.dataset.done = '0';
      el.dataset.from = '0';
      el.dataset.run = 'rebound-' + (++runSeq);
    });

    /* every drawing of the pet follows the species that was picked */
    $$('.pet-use').forEach(function (u) {
      u.setAttribute('href', '#pup-' + p.species);
      u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#pup-' + p.species);
    });

    renderPetRow();
    renderSpend();
  }

  /* re-run the figures on whichever screen the user is looking at */
  function refreshCounts() {
    if (!current) return;
    var el = screenEl(current);
    $$('[data-count]', el).forEach(function (n) { n.dataset.done = '0'; });
    countUp(el);
  }

  var RING = {
    dog: 'linear-gradient(150deg,#F2DDD6,#E7C8BE)',
    cat: 'linear-gradient(150deg,#E6E9E2,#CFC5B7)',
    rabbit: 'linear-gradient(150deg,#F3EAE7,#D8CBC6)',
    bird: 'linear-gradient(150deg,#E7EEE2,#BCCBB2)'
  };

  function renderPetRow() {
    var row = $('#petRow');
    if (!row) return;
    var html = '';
    PETS.forEach(function (p, i) {
      html += '<button class="pet' + (i === petIndex ? ' on' : '') + '" data-pet-index="' + i + '">'
        + '<span class="ring" style="background:' + RING[p.species] + '">'
        + '<svg width="36" height="32" viewBox="30 20 200 170"><use href="#pup-' + p.species + '"/></svg>'
        + '</span>' + esc(p.name)
        + '</button>';
    });
    html += '<button class="pet" data-sheet="add-pet">'
      + '<span class="ring add"><svg width="20" height="20"><use href="#i-plus"/></svg></span>Add'
      + '</button>';
    row.innerHTML = html;
  }

  /* ============================================================
     2. Router
     ============================================================ */

  var ORDER = ['s-signin', 's-onboard', 's-home', 's-assistant', 's-emergency', 's-profile',
    's-vaccines', 's-records', 's-feeding', 's-growth', 's-spending', 's-poster',
    's-community', 's-settings'];

  var SHORT = {
    's-home': 'Care thread', 's-assistant': 'Assistant', 's-profile': '',
    's-vaccines': 'Vaccinations', 's-records': 'Records', 's-feeding': 'Feeding',
    's-growth': 'Growth', 's-spending': 'Spending', 's-poster': 'Lost poster',
    's-community': 'Community', 's-settings': 'Settings'
  };

  var TAB_ROOTS = ['s-home', 's-spending', 's-community', 's-profile'];

  var viewport = $('#viewport');
  var tabbar = $('#tabbar');
  var statusbar = $('#statusbar');
  var homeInd = $('#homeIndicator');
  var compact = $('#compactBar');
  var toastEl = $('#toast');

  var current = null;
  var stack = [];
  var busy = false;
  var pending = null;
  var scrollMem = {};

  function fit() {
    var pad = window.innerHeight > 900 ? 96 : 40;
    var s = Math.min(1, (window.innerHeight - pad) / 872);
    $('#phoneWrap').style.setProperty('--fit', Math.max(0.45, s));
  }
  window.addEventListener('resize', fit);
  fit();

  function screenEl(id) { return document.getElementById(id); }

  function kindFor(to) {
    if (to === 's-emergency') return 'sheet';
    if (current === 's-emergency') return 'unsheet';
    if (TAB_ROOTS.indexOf(to) > -1 && TAB_ROOTS.indexOf(current) > -1) return 'fade';
    if (stack.indexOf(to) > -1) return 'pop';
    return 'push';
  }

  var CLASSES = {
    push: ['push-in', 'push-out'],
    pop: ['pop-in', 'pop-out'],
    sheet: ['sheet-in', 'under-out'],
    unsheet: ['under-in', 'sheet-out'],
    fade: ['fade-in', 'fade-out']
  };

  function go(to, kind) {
    if (to === current || !screenEl(to)) return;
    if (busy) { pending = to; return; }
    closeSheet(true);
    kind = kind || kindFor(to);

    var inEl = screenEl(to);
    var outEl = current ? screenEl(current) : null;

    if (outEl) { scrollMem[current] = outEl.scrollTop; }

    if (kind === 'pop') { stack = stack.slice(0, stack.indexOf(to)); }
    else if (kind === 'unsheet') { stack.pop(); }
    else if (current) { stack.push(current); }

    /* Going back should return you to the page exactly as you left it.
       Resetting the scroll and replaying the entrances made it look like
       a brand new screen every time, which read as a glitch. */
    var returning = (kind === 'pop' || kind === 'unsheet');
    if (returning) {
      inEl.scrollTop = scrollMem[to] || 0;
    } else {
      inEl.scrollTop = 0;
      inEl.classList.remove('settled');
    }

    inEl.classList.add('is-active');
    chrome(to);

    if (reduced || !outEl) {
      if (outEl) { outEl.classList.remove('is-active', 'is-moving'); }
      current = to; settle(inEl, returning); return;
    }

    busy = true;
    var cls = CLASSES[kind];
    outEl.classList.add('is-moving', cls[1]);
    outEl.classList.remove('is-active');
    inEl.classList.add(cls[0]);

    var done = function () {
      inEl.classList.remove(cls[0]);
      outEl.classList.remove('is-moving', cls[1]);
      busy = false;
      settle(inEl, returning);
      if (pending) { var q = pending; pending = null; go(q); }
    };
    var t = setTimeout(done, 700);
    inEl.addEventListener('animationend', function h() {
      inEl.removeEventListener('animationend', h); clearTimeout(t); done();
    });
    current = to;
  }

  function back() {
    if (stack.length) { go(stack[stack.length - 1], current === 's-emergency' ? 'unsheet' : 'pop'); }
    else { go('s-home', 'pop'); }
  }

  function settle(el, returning) {
    if (returning) { el.classList.add('settled'); return; }
    void el.offsetWidth;
    el.classList.add('settled');
    countUp(el);
    if (el.id === 's-assistant') runAssistant();
  }

  function chrome(id) {
    var el = screenEl(id);
    var dark = el.getAttribute('data-dark') === '1';
    statusbar.classList.toggle('on-dark', dark);
    homeInd.classList.toggle('on-dark', dark);

    var tab = el.getAttribute('data-tab');
    tabbar.classList.toggle('hidden', TAB_ROOTS.indexOf(id) < 0);
    $$('.tab').forEach(function (t) {
      t.classList.toggle('active', !!tab && t.getAttribute('data-tab-id') === tab);
    });

    compact.textContent = SHORT[id] === '' ? pet().name : (SHORT[id] || '');
    compact.classList.remove('show');

    var i = ORDER.indexOf(id);
    $('#capName').textContent = (el.getAttribute('data-name') || '').replace(/&middot;/g, '·');
    $('#capIdx').textContent = (i + 1) + ' / ' + ORDER.length;
    $$('#jumplist button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-jump') === id);
    });
  }

  $$('.screen').forEach(function (s) {
    s.addEventListener('scroll', function () {
      if (s.id !== current) return;
      var label = SHORT[s.id] === '' ? pet().name : SHORT[s.id];
      if (!label) return;
      compact.textContent = label;
      compact.classList.toggle('show', s.scrollTop > 52);
    }, { passive: true });
  });

  /* ============================================================
     3. Counters and charts
     ============================================================ */

  var runSeq = 0;

  function countUp(root) {
    $$('[data-count]', root).forEach(function (el) {
      if (el.dataset.done === '1' && el.dataset.replay !== '1') { return; }
      /* tag this run: if the value is rebound while a count is in flight,
         the older run must not write its stale number back over the new one */
      var myRun = String(++runSeq);
      el.dataset.run = myRun;
      var to = parseFloat(el.getAttribute('data-count'));
      var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
      var suf = el.getAttribute('data-suffix') || '';
      var com = el.getAttribute('data-comma') === '1';
      var from = parseFloat(el.dataset.from || '0');
      var dur = reduced ? 0 : 1100, t0 = null;

      var fmt = function (v) {
        var s = v.toFixed(dec);
        if (com) s = inr(s);
        return s + suf;
      };
      if (!dur) { el.textContent = fmt(to); el.dataset.done = '1'; el.dataset.from = to; return; }

      var stopped = false;
      function stale() { return el.dataset.run !== myRun; }
      function finish() {
        stopped = true;
        if (stale()) return;
        el.textContent = fmt(to);
        el.dataset.done = '1';
        el.dataset.from = to;
        el.dataset.replay = '0';
      }
      function step(ts) {
        if (stopped || stale()) return;
        if (t0 === null) t0 = ts;
        var q = Math.min(1, (ts - t0) / dur);
        var e = 1 - Math.pow(1 - q, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (q < 1) requestAnimationFrame(step); else finish();
      }
      requestAnimationFrame(step);
      setTimeout(function () { if (!stopped) finish(); }, dur + 700);
    });
  }

  $$('.chart .line').forEach(function (p) {
    p.style.setProperty('--len', Math.ceil(p.getTotalLength()));
  });

  function drawDonut() {
    var svg = $('.donut');
    if (!svg) return;
    $$('.seg', svg).forEach(function (c) { c.parentNode.removeChild(c); });

    var R = 68, C = 2 * Math.PI * R;
    var total = spendTotal() || 1;
    var start = 0, i = 0;

    SPEND.forEach(function (s) {
      if (s.value <= 0) return;
      var frac = s.value / total, len = frac * C;
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'seg');
      c.setAttribute('cx', 79); c.setAttribute('cy', 79); c.setAttribute('r', R);
      c.setAttribute('stroke', s.colour);
      c.setAttribute('transform', 'rotate(' + (start * 360) + ' 79 79)');
      c.style.setProperty('--dash', len.toFixed(2) + ' ' + C.toFixed(2));
      c.style.setProperty('--len', len.toFixed(2));
      c.style.setProperty('--d', i++);
      svg.appendChild(c);
      start += frac;
    });
  }

  /* the legend and the category list are both generated, so a new
     category added from the sheet shows up in each of them */
  function renderSpend() {
    var total = spendTotal() || 1;

    var key = $('.donut-key');
    if (key) {
      var kh = '';
      SPEND.forEach(function (s) {
        if (s.value <= 0) return;
        kh += '<div><i style="background:' + s.colour + '"></i>' + esc(s.name)
          + '<span class="num">' + Math.round(s.value / total * 100) + '%</span></div>';
      });
      key.innerHTML = kh;
    }

    var rows = $('#spendRows');
    if (rows) {
      var rh = '';
      SPEND.forEach(function (s) {
        rh += '<div class="row' + (s.value ? '' : ' faded') + '">'
          + '<span class="k"' + (s.value ? ' style="color:var(--ink)"' : '') + '>' + esc(s.name) + '</span>'
          + '<span class="v num">₹' + inr(s.value) + '</span>'
          + '</div>';
      });
      rows.innerHTML = rh;
    }

    var t = $('#spendTotal');
    if (t) {
      t.setAttribute('data-count', spendTotal());
      if (t.dataset.done === '1') { t.textContent = inr(spendTotal()); }
    }
    drawDonut();
  }

  /* ============================================================
     4. Toast and bottom sheet
     ============================================================ */

  var toastT;
  function toast(msg) {
    toastEl.innerHTML = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  var sheetEl = $('#sheet'), scrimEl = $('#scrim'), sheetBody = $('#sheetBody');
  var sheetOpen = false;

  function openSheet(html, after) {
    sheetBody.innerHTML = html;
    sheetEl.classList.add('on');
    sheetEl.setAttribute('aria-hidden', 'false');
    scrimEl.classList.add('on');
    sheetOpen = true;
    if (after) after(sheetBody);
    var first = sheetBody.querySelector('input, textarea');
    if (first) { setTimeout(function () { first.focus(); }, 380); }
  }

  function closeSheet(silent) {
    if (!sheetOpen) return;
    sheetEl.classList.remove('on');
    sheetEl.setAttribute('aria-hidden', 'true');
    scrimEl.classList.remove('on');
    sheetOpen = false;
    if (!silent) { setTimeout(function () { sheetBody.innerHTML = ''; }, 420); }
    else { sheetBody.innerHTML = ''; }
  }
  scrimEl.addEventListener('click', function () { closeSheet(); });

  /* ============================================================
     5. Sheets, one per real action
     ============================================================ */

  var expenseDraft = { amount: 0, cat: 0 };

  /* the add button always says exactly what it is about to do */
  function syncExpenseButton() {
    var b = document.getElementById('expAdd');
    if (!b) return;
    if (expenseDraft.amount > 0) {
      b.disabled = false;
      b.textContent = 'Add ₹' + inr(expenseDraft.amount) + ' to ' + SPEND[expenseDraft.cat].name;
    } else {
      b.disabled = true;
      b.textContent = 'Enter an amount';
    }
  }

  var SHEETS = {

    'add-expense': function () {
      expenseDraft = { amount: 0, cat: 0 };
      var chips = '';
      SPEND.forEach(function (s, i) {
        chips += '<button class="chip' + (i === 0 ? ' on' : '') + '" data-exp-cat="' + i + '">'
          + esc(s.name) + '</button>';
      });
      var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'];
      var pad = '';
      keys.forEach(function (k) { pad += '<button data-key="' + k + '">' + k + '</button>'; });
      pad += '<button data-key="del" aria-label="Delete">&#9003;</button>';

      return '<h3>Add expense</h3>'
        + '<p class="sub">It lands on this month’s total straight away.</p>'
        + '<p class="amount" id="amtBox"><span class="cur">₹</span><span class="val" id="amtVal">0</span></p>'
        + '<label class="form-label eyebrow">Category</label>'
        + '<div class="chip-row" id="expCats">' + chips + '</div>'
        + '<div class="keypad" id="expPad">' + pad + '</div>'
        + '<button class="btn pine" id="expAdd" disabled>Enter an amount</button>';
    },

    'edit-pet': function () {
      var p = pet();
      return '<h3>Edit details</h3>'
        + '<p class="sub">Changing these updates every screen in the app.</p>'
        + '<div class="field-pair">'
        + '<div><label class="form-label eyebrow" for="e-name">Name</label>'
        + '<input class="field" id="e-name" maxlength="18" value="' + esc(p.name) + '"></div>'
        + '<div><label class="form-label eyebrow" for="e-breed">Breed</label>'
        + '<input class="field" id="e-breed" maxlength="20" value="' + esc(p.breed) + '"></div>'
        + '</div>'
        + '<label class="form-label eyebrow">Species</label>'
        + '<div class="chip-row" id="e-species">'
        + ['dog', 'cat', 'rabbit', 'bird'].map(function (k) {
          return '<button class="chip' + (p.species === k ? ' on' : '') + '" data-species="' + k + '">' + cap(k) + '</button>';
        }).join('')
        + '</div>'
        + '<label class="form-label eyebrow">Sex</label>'
        + '<div class="chip-row" id="e-sex">'
        + '<button class="chip' + (p.sex === 'male' ? ' on' : '') + '" data-sex="male">Male</button>'
        + '<button class="chip' + (p.sex === 'female' ? ' on' : '') + '" data-sex="female">Female</button>'
        + '</div>'
        + '<button class="btn pine" id="e-save">Save changes</button>';
    },

    'add-pet': function () {
      return '<h3>Add a pet</h3>'
        + '<p class="sub">They get their own care thread.</p>'
        + '<label class="form-label eyebrow" for="n-name">Name</label>'
        + '<input class="field" id="n-name" maxlength="18" placeholder="Their name">'
        + '<label class="form-label eyebrow">Species</label>'
        + '<div class="chip-row" id="n-species">'
        + ['dog', 'cat', 'rabbit', 'bird'].map(function (k, i) {
          return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-species="' + k + '">' + cap(k) + '</button>';
        }).join('')
        + '</div>'
        + '<button class="btn pine" id="n-save">Add to the family</button>';
    },

    'allergies': function () {
      return '<h3>Allergies</h3>'
        + '<p class="sub">Shown on the emergency screen for the vet to read.</p>'
        + '<label class="form-label eyebrow" for="a-val">Known allergies</label>'
        + '<input class="field" id="a-val" maxlength="60" value="' + esc(pet().allergies) + '">'
        + '<button class="btn pine" data-save="allergies">Save</button>';
    },

    'last-seen': function () {
      return '<h3>Last seen</h3>'
        + '<p class="sub">This goes on the poster and into the alert radius.</p>'
        + '<label class="form-label eyebrow" for="ls-val">Place</label>'
        + '<input class="field" id="ls-val" maxlength="40" value="' + esc(pet().lastSeen) + '">'
        + '<button class="btn pine" data-save="lastSeen">Update poster</button>';
    },

    'reward': function () {
      return '<h3>Reward</h3>'
        + '<p class="sub">Optional, but it doubles the number of replies.</p>'
        + '<label class="form-label eyebrow" for="rw-val">Amount in rupees</label>'
        + '<input class="field" id="rw-val" type="number" min="0" step="500" value="'
        + String(pet().reward).replace(/,/g, '') + '">'
        + '<button class="btn pine" data-save="reward">Update poster</button>';
    },

    'log-weight': function () {
      return '<h3>Log today’s weight</h3>'
        + '<p class="sub">It joins the growth curve and the records page.</p>'
        + '<div class="stepper">'
        + '<button data-step-w="-0.1" aria-label="Less"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h10"/></svg></button>'
        + '<span class="read"><span id="wVal">' + pet().weight.toFixed(1) + '</span><small>kg</small></span>'
        + '<button data-step-w="0.1" aria-label="More"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4v10M4 9h10"/></svg></button>'
        + '</div>'
        + '<button class="btn pine" id="wSave">Save weight</button>';
    },

    'log-portion': function () {
      return '<h3>Daily portion</h3>'
        + '<p class="sub">Split across two meals. We recalculate the calories.</p>'
        + '<div class="stepper">'
        + '<button data-step-g="-10" aria-label="Less"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h10"/></svg></button>'
        + '<span class="read"><span id="gVal">' + pet().grams + '</span><small>g per day</small></span>'
        + '<button data-step-g="10" aria-label="More"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 4v10M4 9h10"/></svg></button>'
        + '</div>'
        + '<button class="btn pine" id="gSave">Save portion</button>';
    },

    'add-record': function () {
      var kinds = ['Vet visit', 'Prescription', 'Test result', 'Grooming'];
      return '<h3>Add a record</h3>'
        + '<p class="sub">Filed under ' + esc(pet().name) + '’s history.</p>'
        + '<label class="form-label eyebrow">Kind</label>'
        + '<div class="chip-row" id="r-kind">'
        + kinds.map(function (k, i) {
          return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-kind="' + esc(k) + '">' + esc(k) + '</button>';
        }).join('')
        + '</div>'
        + '<label class="form-label eyebrow" for="r-note">Note</label>'
        + '<input class="field" id="r-note" maxlength="48" placeholder="Annual check, all clear">'
        + '<button class="btn pine" id="r-save">File it</button>';
    },

    'answer': function () {
      return '<h3>Your answer</h3>'
        + '<p class="sub">Posted to the Koramangala circle under your name.</p>'
        + '<textarea class="field" id="ansText" maxlength="240" placeholder="What worked for you?"></textarea>'
        + '<button class="btn pine" id="ansPost">Post answer</button>';
    },

    'ask-question': function () {
      return '<h3>Ask the circle</h3>'
        + '<p class="sub">Goes to owners within 3 km of you.</p>'
        + '<textarea class="field" id="qText" maxlength="240" placeholder="Vet who is good with anxious cats?"></textarea>'
        + '<button class="btn pine" id="qPost">Post question</button>';
    },

    'share-poster': function () {
      var groups = ['Koramangala Pets', 'HSR Dog Parents', 'Indiranagar Strays', 'Family'];
      return '<h3>Share poster</h3>'
        + '<p class="sub">Reaches 142 owners within 3 km.</p>'
        + groups.map(function (g, i) {
          return '<button class="opt' + (i < 2 ? ' on' : '') + '" data-multi="1">' + esc(g)
            + '<span class="tick"><svg width="19" height="19"><use href="#i-check"/></svg></span></button>';
        }).join('')
        + '<button class="btn pine" id="shareGo">Send poster</button>';
    },

    'language': function () {
      var langs = [['English', 'Default'], ['ಕನ್ನಡ', 'Kannada'], ['हिन्दी', 'Hindi']];
      return '<h3>Language</h3>'
        + '<p class="sub">Reminders and the lost poster use this.</p>'
        + langs.map(function (l, i) {
          return '<button class="opt' + (i === 0 ? ' on' : '') + '" data-one="lang">' + esc(l[0])
            + '<span class="sub2">' + esc(l[1]) + '</span>'
            + '<span class="tick"><svg width="19" height="19"><use href="#i-check"/></svg></span></button>';
        }).join('')
        + '<button class="btn pine" data-close="1">Done</button>';
    },

    'family': function () {
      return '<h3>Family sharing</h3>'
        + '<p class="sub">Everyone here sees the same care thread.</p>'
        + '<button class="opt on"><span class="avatar" style="width:34px;height:34px;font-size:14px;background:#EFD8D0">A</span>'
        + esc(OWNER) + '<span class="sub2">Owner</span></button>'
        + '<button class="opt on"><span class="avatar" style="width:34px;height:34px;font-size:14px;background:#DCE4DA">M</span>'
        + 'Meera<span class="sub2">Can edit</span></button>'
        + '<button class="btn ghost" data-toast="Invite link copied">Invite someone</button>'
        + '<button class="btn pine" data-close="1">Done</button>';
    },

    'reminders': function () {
      var items = [['Meals', true], ['Medicines', true], ['Vaccinations', true], ['Walks', false], ['Grooming', false]];
      return '<h3>Reminders</h3>'
        + '<p class="sub">Each one becomes an entry on the care thread.</p>'
        + items.map(function (it) {
          return '<button class="opt' + (it[1] ? ' on' : '') + '" data-multi="1">' + esc(it[0])
            + '<span class="tick"><svg width="19" height="19"><use href="#i-check"/></svg></span></button>';
        }).join('')
        + '<button class="btn pine" data-close="1">Done</button>';
    },

    'contacts': function () {
      return '<h3>Emergency contacts</h3>'
        + '<p class="sub">Called in this order from the emergency screen.</p>'
        + '<button class="opt on">City Pet Hospital<span class="sub2">2.4 km</span></button>'
        + '<button class="opt on">Dr. Menon<span class="sub2">Your vet</span></button>'
        + '<button class="opt on">Meera<span class="sub2">Family</span></button>'
        + '<button class="btn ghost" data-toast="Pick a contact from your phone book">Add a contact</button>'
        + '<button class="btn pine" data-close="1">Done</button>';
    },

    'forgot': function () {
      return '<h3>Reset password</h3>'
        + '<p class="sub">We send a one-time link. It expires in 15 minutes.</p>'
        + '<label class="form-label eyebrow" for="f-mail">Email</label>'
        + '<input class="field" id="f-mail" type="email" value="aarav@pawpal.in">'
        + '<button class="btn pine" data-toast="Reset link sent" data-close="1">Send the link</button>';
    },
    'signup': function () {
      return '<h3>Create your account</h3>'
        + '<p class="sub">Then add your first pet.</p>'
        + '<label class="form-label eyebrow" for="su-name">Your name</label>'
        + '<input class="field" id="su-name" maxlength="40" autocomplete="name">'
        + '<label class="form-label eyebrow" for="su-mail">Email</label>'
        + '<input class="field" id="su-mail" type="email" autocomplete="email">'
        + '<label class="form-label eyebrow" for="su-pw">Password (8+ characters)</label>'
        + '<input class="field" id="su-pw" type="password" autocomplete="new-password">'
        + '<button class="btn pine" id="signupGo">Create account</button>';
    },

    'book-vax': function () {
      var slots = ['Thu 28 Aug, 10:00 am', 'Thu 28 Aug, 5:30 pm', 'Fri 29 Aug, 11:15 am'];
      return '<h3>Book at Paws Clinic</h3>'
        + '<p class="sub">1.2 km away. Rabies booster, about 15 minutes.</p>'
        + slots.map(function (s, i) {
          return '<button class="opt' + (i === 1 ? ' on' : '') + '" data-one="slot">' + esc(s)
            + '<span class="tick"><svg width="19" height="19"><use href="#i-check"/></svg></span></button>';
        }).join('')
        + '<button class="btn pine" id="vaxBook">Confirm booking</button>';
    }
  };

  function showSheet(name) {
    var fn = SHEETS[name];
    if (!fn) { return; }
    openSheet(fn());
  }

  /* ============================================================
     6. Care thread helpers
     ============================================================ */

  function addThreadEntry(title, meta, tone) {
    var thread = $('#s-home .thread');
    if (!thread) return;
    var b = document.createElement('button');
    b.className = 'entry landed' + (tone ? ' ' + tone : '');
    b.innerHTML = '<span class="node' + (tone === 'due' ? ' due' : '') + '"></span>'
      + '<h4>' + esc(title) + '</h4><p>' + esc(meta) + '</p>';
    thread.appendChild(b);
  }

  /* ============================================================
     7. Emergency
     ============================================================ */

  function emergency(ev) {
    if (reduced) { go('s-emergency', 'sheet'); return; }
    var r = viewport.getBoundingClientRect();
    var x = ev ? ev.clientX - r.left : 196;
    var y = ev ? ev.clientY - r.top : 120;
    var far = Math.max(
      Math.sqrt(x * x + y * y),
      Math.sqrt((r.width - x) * (r.width - x) + y * y),
      Math.sqrt(x * x + (r.height - y) * (r.height - y)),
      Math.sqrt((r.width - x) * (r.width - x) + (r.height - y) * (r.height - y))
    );
    var w = document.createElement('div');
    w.className = 'wash';
    w.style.left = x + 'px'; w.style.top = y + 'px';
    w.style.width = w.style.height = (far * 2) + 'px';
    viewport.appendChild(w);
    setTimeout(function () { go('s-emergency', 'fade'); }, 380);
    setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 900);
  }

  /* a call button that actually looks like it is calling */
  function placeCall(btn, who) {
    if (btn.dataset.calling === '1') return;
    btn.dataset.calling = '1';
    var original = btn.innerHTML;
    var secs = 0;
    btn.innerHTML = '<span class="spinner" style="border-color:rgba(192,64,43,.25);border-top-color:var(--signal)"></span>Calling ' + esc(who);
    var tick = setInterval(function () {
      secs++;
      btn.innerHTML = '<svg width="21" height="21"><use href="#i-phone"/></svg>' + esc(who)
        + ' · ' + (secs < 10 ? '0:0' + secs : '0:' + secs);
    }, 1000);
    setTimeout(function () {
      clearInterval(tick);
      btn.innerHTML = original;
      btn.dataset.calling = '0';
      toast('Call ended · records were shared');
    }, 6000);
  }

  /* ============================================================
     8. One delegated click handler
     ============================================================ */

  document.addEventListener('click', function (e) {
    var t;

    /* --- sheet-local controls first --- */

    /* one rule for every chip row: pick one, drop the others */
    if ((t = e.target.closest('.chip-row .chip'))) {
      $$('.chip', t.parentNode).forEach(function (c) { c.classList.remove('on'); });
      t.classList.add('on');
      if (t.hasAttribute('data-exp-cat')) {
        expenseDraft.cat = parseInt(t.getAttribute('data-exp-cat'), 10);
        syncExpenseButton();
      }
      return;
    }
    if ((t = e.target.closest('[data-key]'))) {
      var k = t.getAttribute('data-key');
      var cur = String(expenseDraft.amount);
      if (k === 'del') { cur = cur.length > 1 ? cur.slice(0, -1) : '0'; }
      else { cur = (cur === '0' ? '' : cur) + k; }
      expenseDraft.amount = Math.min(999999, parseInt(cur || '0', 10));
      var box = $('#amtBox'), val = $('#amtVal');
      if (val) { val.textContent = inr(expenseDraft.amount); }
      if (box) { box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse'); }
      syncExpenseButton();
      return;
    }
    if ((t = e.target.closest('#expAdd'))) {
      if (!expenseDraft.amount) return;
      var cat = SPEND[expenseDraft.cat];
      cat.value += expenseDraft.amount;
      var amt = expenseDraft.amount;
      if (pet().id) { PawPalAPI.addExpense(pet().id, cat.name, amt).catch(notSaved); }
      var tot = $('#spendTotal');
      if (tot) { tot.dataset.from = spendTotal() - amt; tot.dataset.replay = '1'; }
      renderSpend();
      render();
      if (tot) { countUp($('#s-spending')); }
      var scr = $('#s-spending');
      scr.classList.remove('settled'); void scr.offsetWidth; scr.classList.add('settled');
      closeSheet();
      toast('₹' + inr(amt) + ' added to ' + esc(cat.name));
      return;
    }

    if ((t = e.target.closest('[data-step-w]'))) {
      var wv = $('#wVal');
      var nw = Math.max(0.2, Math.round((parseFloat(wv.textContent) + parseFloat(t.getAttribute('data-step-w'))) * 10) / 10);
      wv.textContent = nw.toFixed(1);
      return;
    }
    if ((t = e.target.closest('#wSave'))) {
      var newW = parseFloat($('#wVal').textContent);
      pet().weight = newW;
      if (pet().id) { PawPalAPI.logWeight(pet().id, newW).catch(notSaved); }
      var gr = $('#s-growth .rows');
      if (gr) {
        var row = document.createElement('div');
        row.className = 'row landed';
        row.innerHTML = '<span class="k">Today</span><span class="v num">' + newW.toFixed(1) + ' kg</span>';
        gr.insertBefore(row, gr.firstChild);
      }
      render();
      refreshCounts();
      closeSheet();
      toast('Weight logged · ' + newW.toFixed(1) + ' kg');
      return;
    }

    if ((t = e.target.closest('[data-step-g]'))) {
      var gv = $('#gVal');
      var ng = Math.max(20, parseInt(gv.textContent, 10) + parseInt(t.getAttribute('data-step-g'), 10));
      gv.textContent = ng;
      return;
    }
    if ((t = e.target.closest('#gSave'))) {
      pet().grams = parseInt($('#gVal').textContent, 10);
      render();
      var fs = $('#s-feeding');
      $$('[data-count]', fs).forEach(function (n) { n.dataset.from = '0'; n.dataset.done = '0'; });
      countUp(fs);
      closeSheet();
      toast('Portion set to ' + pet().grams + ' g a day');
      return;
    }

    if ((t = e.target.closest('#e-save'))) {
      var p = pet();
      var nm = $('#e-name').value.trim();
      if (nm) p.name = nm;
      var bd = $('#e-breed').value.trim();
      if (bd) p.breed = bd;
      var sp = $('#e-species .chip.on');
      if (sp) p.species = sp.getAttribute('data-species');
      var sx = $('#e-sex .chip.on');
      if (sx) p.sex = sx.getAttribute('data-sex');
      render();
      closeSheet();
      toast('Saved · ' + esc(p.name) + '’s details updated');
      return;
    }

    if ((t = e.target.closest('#n-save'))) {
      var nn = $('#n-name').value.trim();
      if (!nn) { $('#n-name').focus(); toast('Give them a name first'); return; }
      var ns = $('#n-species .chip.on');
      var sk = ns ? ns.getAttribute('data-species') : 'dog';
      PETS.push({
        name: nn, species: sk, breed: 'Not set', sex: 'male',
        age: '1 yr', years: 1, weight: sk === 'dog' ? 12 : 4, since: 'Today',
        allergies: 'None on file', grams: sk === 'dog' ? 260 : 200,
        lastSeen: 'Koramangala 5th Block', reward: '2,000'
      });
      petIndex = PETS.length - 1;
      render();
      closeSheet();
      toast(esc(nn) + ' joined the family');
      return;
    }

    if ((t = e.target.closest('[data-save]'))) {
      var field = t.getAttribute('data-save');
      var p2 = pet();
      if (field === 'allergies') { p2.allergies = $('#a-val').value.trim() || 'None on file'; }
      if (field === 'lastSeen') { p2.lastSeen = $('#ls-val').value.trim() || p2.lastSeen; }
      if (field === 'reward') { p2.reward = inr(parseInt($('#rw-val').value || '0', 10)); }
      render();
      closeSheet();
      toast('Updated');
      return;
    }

    if ((t = e.target.closest('#r-save'))) {
      var kind = ($('#r-kind .chip.on') || {}).textContent || 'Vet visit';
      var note = $('#r-note').value.trim() || 'No note';
      var rows2 = $('#s-records .rows');
      if (rows2) {
        var nr = document.createElement('div');
        nr.className = 'row landed';
        nr.innerHTML = '<span><span class="k">Today</span><br><span class="v">' + esc(kind) + ' · ' + esc(note) + '</span></span>';
        rows2.insertBefore(nr, rows2.firstChild);
      }
      closeSheet();
      toast('Record filed');
      return;
    }

    if ((t = e.target.closest('#ansPost'))) {
      var txt = $('#ansText').value.trim();
      if (!txt) { $('#ansText').focus(); return; }
      var target = $('#s-community .post[data-answering="1"] .acts b');
      if (target) {
        var n = parseInt(target.textContent, 10) + 1;
        target.textContent = n + (target.textContent.indexOf('repl') > -1 ? ' replies' : ' answers');
        target.classList.add('bump');
        setTimeout(function () { target.classList.remove('bump'); }, 500);
      }
      $$('#s-community .post').forEach(function (x) { x.removeAttribute('data-answering'); });
      closeSheet();
      toast('Answer posted');
      return;
    }

    if ((t = e.target.closest('#qPost'))) {
      var qt = $('#qText').value.trim();
      if (!qt) { $('#qText').focus(); return; }
      var feed = $('#s-community');
      var card = document.createElement('div');
      card.className = 'post landed';
      card.innerHTML = '<div class="who"><span class="avatar" style="background:#E7C8BE">'
        + esc(OWNER.charAt(0).toUpperCase()) + '</span><b>' + esc(OWNER) + ' · Koramangala · now</b></div>'
        + '<p class="said">' + esc(qt) + '</p>'
        + '<div class="acts"><b>0 answers</b><button data-like="1">Like</button></div>';
      feed.insertBefore(card, feed.querySelector('.post'));
      closeSheet();
      toast('Question posted to the circle');
      return;
    }

    if ((t = e.target.closest('#shareGo'))) {
      var n2 = $$('#sheetBody .opt.on').length;
      closeSheet();
      toast('Poster sent to ' + n2 + ' group' + (n2 === 1 ? '' : 's'));
      return;
    }
    if ((t = e.target.closest('#signupGo'))) {
      PawPalAPI.register({ name: $('#su-name').value.trim(), email: $('#su-mail').value.trim(), password: $('#su-pw').value })
        .then(function (u) {
          loadFromServer({ user: u, pets: [] });
          ['petname', 'breed', 'weight'].forEach(function (id) { $('#' + id).value = ''; });
          $('#ownername').value = OWNER;
          closeSheet();
          go('s-onboard');
        }).catch(function (err) { toast(esc(err.message)); });
      return;
    }

    if ((t = e.target.closest('#vaxBook'))) {
      var slot = ($('#sheetBody .opt.on') || {}).textContent || '';
      var card = $('#s-vaccines .vax-item.due');
      if (card) {
        card.classList.remove('due');
        card.querySelector('.when').textContent = 'Booked';
        card.querySelector('.node').classList.remove('due');
        var bb = card.querySelector('.btn');
        bb.classList.add('pine');
        bb.innerHTML = '<svg width="19" height="19"><use href="#i-check"/></svg>' + esc(slot.split('·')[0].trim());
        bb.setAttribute('data-toast', 'Booked at Paws Clinic');
        bb.removeAttribute('data-sheet');
      }
      addThreadEntry('Rabies booster booked', esc(slot) + ' · Paws Clinic');
      closeSheet();
      if (pet().id) {
        var si = 0;
        $$('#sheetBody .opt').forEach(function (o, i) { if (o.classList.contains('on')) si = i; });
        var when = [[1, '10:00'], [1, '17:30'], [2, '11:15']][si] || [1, '10:00'];
        var dd = new Date(Date.now() + when[0] * 864e5);
        var ymd = dd.getFullYear() + '-' + ('0' + (dd.getMonth() + 1)).slice(-2) + '-' + ('0' + dd.getDate()).slice(-2);
        PawPalAPI.vaccinations(pet().id).then(function (list) {
          var v = list.filter(function (x) { return x.status === 'due'; })[0];
          if (v) { return PawPalAPI.bookVaccination(pet().id, v.id, ymd + ' ' + when[1], 'Paws Clinic'); }
        }).catch(notSaved);
      }
      toast('Booked · added to the care thread');
      return;
    }

    if ((t = e.target.closest('[data-multi]'))) { t.classList.toggle('on'); return; }
    if ((t = e.target.closest('[data-one]'))) {
      var grp = t.getAttribute('data-one');
      $$('[data-one="' + grp + '"]').forEach(function (o) { o.classList.remove('on'); });
      t.classList.add('on');
      return;
    }

    /* --- navigation --- */

    if ((t = e.target.closest('[data-emergency]'))) { emergency(e); return; }
    if ((t = e.target.closest('[data-back]'))) { back(); return; }
    if ((t = e.target.closest('[data-tab-go]'))) { go(t.getAttribute('data-tab-go')); return; }
    if ((t = e.target.closest('[data-jump]'))) { go(t.getAttribute('data-jump'), 'fade'); return; }

    /* --- app actions --- */

    if ((t = e.target.closest('[data-call]'))) { placeCall(t, t.getAttribute('data-call')); return; }

    if ((t = e.target.closest('[data-sheet]'))) { showSheet(t.getAttribute('data-sheet')); return; }
    if ((t = e.target.closest('[data-close]'))) {
      if (t.hasAttribute('data-toast')) { toast(t.getAttribute('data-toast')); }
      closeSheet(); return;
    }

    if ((t = e.target.closest('[data-pet-index]'))) {
      petIndex = parseInt(t.getAttribute('data-pet-index'), 10);
      render();
      var hs = $('#s-home');
      $$('[data-count]', hs).forEach(function (n) { n.dataset.done = '0'; n.dataset.from = '0'; });
      toast('Showing ' + esc(pet().name) + '’s thread');
      return;
    }

    if ((t = e.target.closest('[data-answer]'))) {
      var post = t.closest('.post');
      $$('#s-community .post').forEach(function (x) { x.removeAttribute('data-answering'); });
      if (post) { post.setAttribute('data-answering', '1'); }
      showSheet('answer');
      return;
    }

    if ((t = e.target.closest('[data-like]'))) {
      var on = t.classList.toggle('liked');
      t.textContent = on ? 'Liked' : 'Like';
      toast(on ? 'Liked' : 'Like removed');
      return;
    }

    if ((t = e.target.closest('[data-log-thread]'))) {
      addThreadEntry('Assistant note logged', t.getAttribute('data-log-meta') || 'Off food since last night · rice and curd tonight');
      t.disabled = true;
      t.innerHTML = '<svg width="19" height="19"><use href="#i-check"/></svg>Added to the thread';
      toast('Added to ' + esc(pet().name) + '’s care thread');
      return;
    }

    if ((t = e.target.closest('[data-meal]'))) {
      var given = t.classList.toggle('given');
      var word = t.querySelector('.word');
      word.textContent = given ? 'Given' : t.getAttribute('data-time');
      toast(given ? t.getAttribute('data-label') + ' logged · ' + Math.round(pet().grams / 2) + ' g'
        : t.getAttribute('data-label') + ' unlogged');
      return;
    }

    if ((t = e.target.closest('[data-switch]'))) {
      var sw = t.classList.toggle('on');
      toast(t.getAttribute('aria-label') + (sw ? ' on' : ' off'));
      return;
    }

    if ((t = e.target.closest('[data-pick]'))) {
      var group = t.getAttribute('data-pick');
      $$('[data-pick="' + group + '"]').forEach(function (c) { c.classList.remove('on'); });
      t.classList.add('on');
      if (group === 'species') { previewSpecies(t.getAttribute('data-species')); }
      return;
    }
    if ((t = e.target.closest('[data-toggle]'))) { t.classList.toggle('on'); return; }

    if ((t = e.target.closest('[data-go]'))) { go(t.getAttribute('data-go')); return; }
    if ((t = e.target.closest('[data-toast]'))) { toast(t.getAttribute('data-toast')); return; }
  }, false);

  /* picking a species in onboarding updates the copy on the next step
     straight away, so step two never says "dog" for a cat */
  function previewSpecies(sp) {
    if (!sp) return;
    pet().species = sp;
    render();
  }

  /* ripple */
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest('.btn, .call');
    if (!b || reduced) return;
    var r = b.getBoundingClientRect();
    var s = document.createElement('span');
    s.className = 'ripple';
    var d = Math.max(r.width, r.height) * 2.2;
    s.style.width = s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left) + 'px';
    s.style.top = (e.clientY - r.top) + 'px';
    b.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 640);
  });

  /* ============================================================
     9. Sign in and onboarding
     ============================================================ */

  $('#revealPw').addEventListener('click', function () {
    var f = $('#pw'), shown = f.type === 'text';
    f.type = shown ? 'password' : 'text';
    this.textContent = shown ? 'Show' : 'Hide';
    this.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
  });

  /* Driven by a click, not by a form submit. Some viewers open a local page
     inside a sandbox that blocks form submission outright, and the button
     then does nothing at all. The submit and Enter paths just call this. */
  /* copy what the server returned into the state the whole app already reads */
  function loadFromServer(d) {
    OWNER = String(d.user.name).split(' ')[0];
    PETS.length = 0;
    d.pets.forEach(function (p) { PETS.push(p); });
    if (!PETS.length) {
      PETS.push({
        name: 'your pet', species: 'dog', breed: 'Not set', sex: 'male', age: '1 yr', years: 1,
        weight: 12, since: 'Today', allergies: 'None on file', grams: 230, lastSeen: '', reward: ''
      });
      SPEND.forEach(function (c) { c.value = 0; });
    }
    petIndex = 0;
    render();
    $$('[data-count]').forEach(function (n) { n.dataset.done = '0'; n.dataset.from = '0'; });
    loadSpend();
  }

  function notSaved(err) { toast(esc('Not saved: ' + (err && err.message ? err.message : 'server error'))); }

  /* pull this pet's real spending into the donut */
  function loadSpend() {
    var p = pet();
    if (!p.id) return;
    PawPalAPI.spending(p.id).then(function (s) {
      SPEND.forEach(function (c) {
        var m = s.categories.filter(function (x) { return x.name === c.name; })[0];
        c.value = m ? m.value : 0;
      });
      renderSpend();
      render();
    }).catch(notSaved);
  }

  function doSignIn() {
    var b = $('#signinBtn');
    if (b.classList.contains('working')) return;
    var label = 'Sign in';
    b.classList.add('working');
    b.innerHTML = '<span class="spinner"></span>';

    var minWait = new Promise(function (r) { setTimeout(r, 1100); });
    var call = PawPalAPI.login($('#email').value.trim(), $('#pw').value).then(function (user) {
      return PawPalAPI.pets().then(function (list) { return { user: user, pets: list }; });
    });

    Promise.all([call, minWait]).then(function (res) {
      var hadPets = res[0].pets.length > 0;
      loadFromServer(res[0]);
      b.classList.add('done');
      b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.6 4.5L19 7"/></svg>';
      setTimeout(function () {
        go(hadPets ? 's-home' : 's-onboard');
        b.classList.remove('working', 'done');
        b.textContent = label;
      }, 650);
    }).catch(function (err) {
      b.classList.remove('working', 'done');
      b.textContent = label;
      toast(esc(err.message === 'Failed to fetch' ? 'Cannot reach the server' : err.message));
    });
  }
  $('#signinBtn').addEventListener('click', doSignIn);
  $('#signinForm').addEventListener('submit', function (e) { e.preventDefault(); doSignIn(); });
  $$('#signinForm .field').forEach(function (f) {
    f.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doSignIn(); }
    });
  });

  var step = 1;
  function setStep(n) {
    step = Math.max(1, Math.min(3, n));
    $$('#s-onboard .step').forEach(function (s) {
      s.classList.toggle('on', +s.getAttribute('data-step') === step);
    });
    $$('#s-onboard .steps i').forEach(function (i, n2) { i.classList.toggle('on', n2 < step); });
    $('#onboardNext').textContent = step === 3 ? 'Start the care thread' : 'Continue';
    $('#onboardBack').style.display = step === 1 ? 'none' : '';
    $('#s-onboard').scrollTop = 0;
  }

  /* pull what the owner typed into state, then repaint the whole app */
  function applyOnboarding() {
    var p = pet();
    var sp = $('#s-onboard [data-pick="species"].on');
    if (sp) { p.species = sp.getAttribute('data-species'); }

    var nm = $('#petname').value.trim();
    if (nm) { p.name = nm; }
    var ow = $('#ownername').value.trim();
    if (ow) { OWNER = ow; }
    var bd = $('#breed').value.trim();
    if (bd) { p.breed = bd; }

    var wt = parseFloat($('#weight').value);
    if (wt > 0) {
      p.weight = Math.round(wt * 10) / 10;
      p.grams = Math.max(40, Math.round(p.weight * 19.5 / 10) * 10);
    }
    var ag = $('#s-onboard [data-pick="age"].on');
    if (ag) { p.age = ag.getAttribute('data-age'); p.years = parseFloat(ag.getAttribute('data-years')); }
    var sx = $('#s-onboard [data-pick="sex"].on');
    if (sx) { p.sex = sx.getAttribute('data-sex'); }

    render();
    $$('[data-count]').forEach(function (n) { n.dataset.done = '0'; n.dataset.from = '0'; });
  }
  function saveOnboarding() {
    var p = pet();
    var body = { name: p.name, species: p.species, breed: p.breed, sex: p.sex, years: p.years, weight: p.weight, grams: p.grams };
    if (p.id) { PawPalAPI.updatePet(p.id, body).catch(notSaved); return; }
    PawPalAPI.addPet(body).then(function (saved) {
      p.id = saved.id;
      loadSpend();
    }).catch(notSaved);
    PawPalAPI.updateMe({ name: OWNER }).catch(notSaved);
  }

  $('#onboardNext').addEventListener('click', function () {
    if (step === 1) {
      var sp = $('#s-onboard [data-pick="species"].on');
      if (sp) { pet().species = sp.getAttribute('data-species'); render(); }
      setStep(2);
    } else if (step === 2) {
      applyOnboarding();
      setStep(3);
    } else {
      applyOnboarding();
      saveOnboarding();
      setStep(1);
      go('s-home');
      toast(esc(pet().name) + '’s thread is live');
    }
  });
  $('#onboardBack').addEventListener('click', function () { setStep(step - 1); });

  /* typing a name shows up immediately on the step-three copy */
  ['petname', 'ownername', 'breed'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', function () {
      if (id === 'ownername') { OWNER = el.value.trim() || 'there'; }
      if (id === 'petname') { pet().name = el.value.trim() || 'your pet'; }
      if (id === 'breed') { pet().breed = el.value.trim() || 'Not set'; }
      render();
    });
  });

  /* ============================================================
     10. Assistant
     ============================================================ */

  var assistantRan = false, assistantT = [];
  function runAssistant(force) {
    if (assistantRan && !force) return;
    assistantRan = true;
    assistantT.forEach(clearTimeout); assistantT = [];
    var typing = $('#typing'), answer = $('#answer'), label = $('#assistantLabel');
    typing.hidden = false; answer.hidden = true; label.hidden = true;
    assistantT.push(setTimeout(function () {
      typing.hidden = true; label.hidden = false; answer.hidden = false;
      $$('#answer .part').forEach(function (p) {
        p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
      });
    }, reduced ? 0 : 1500));
  }


  /* The Assistant talks to the PawPal chatbot service (api.py, POST /chat).
     Point it elsewhere with  window.PAWPAL_CHATBOT = 'https://...'  before this script. */
  var CHATBOT = window.PAWPAL_CHATBOT || 'http://localhost:8000';
  var chatHistories = {}, asking = false;

  function historyFor(p) {
    var k = p.id || p.name;
    return chatHistories[k] || (chatHistories[k] = []);
  }

  function chatScroll() {
    var s = $('#s-assistant');
    setTimeout(function () { s.scrollTop = s.scrollHeight; }, 60);
  }

  function addMyBubble(text) {
    var b = document.createElement('div');
    b.className = 'bubble-me';
    b.textContent = text;
    $('#thread-chat').appendChild(b);
    return b;
  }

  function addTyping() {
    var t = document.createElement('div');
    t.className = 'typing';
    t.innerHTML = '<i></i><i></i><i></i>';
    $('#thread-chat').appendChild(t);
    return t;
  }

  /* parts: [{label, text}]. cls: extra class. tail: optional trailing HTML. */
  function addAnswerCard(parts, cls, tail) {
    var card = document.createElement('div');
    card.className = 'card answer' + (cls ? ' ' + cls : '');
    var html = '';
    for (var i = 0; i < parts.length; i++) {
      html += '<div class="part" style="--d:' + i + '"><p class="eyebrow">' + esc(parts[i].label)
        + '</p><p>' + esc(parts[i].text) + '</p></div>';
    }
    if (tail) { html += '<div class="part" style="--d:' + parts.length + '">' + tail + '</div>'; }
    card.innerHTML = html;
    $('#thread-chat').appendChild(card);
    return card;
  }

  function showChatbotReply(r, p) {
    if (r.type === 'urgent') {
      var flags = (r.matched_red_flag_symptoms || []).join(', ');
      var parts = [{ label: 'Possible emergency', text: p.name + ' may need a vet now. ' + (r.message || '') }];
      if (flags) { parts.push({ label: 'What triggered this', text: flags }); }
      addAnswerCard(parts, 'urgent',
        '<button class="btn" data-go="s-emergency">Open emergency mode</button>');
      toast('This sounds urgent. Contact a vet now.');
    } else if (r.type === 'card') {
      var s = r.sections || {};
      var cp = [
        { label: 'What it might be', text: s.what_it_might_be },
        { label: 'What to do now', text: s.what_to_do },
        { label: 'When to see a vet', text: s.when_to_see_vet }
      ];
      if (r.diet_notes) { cp.push({ label: 'Food', text: r.diet_notes }); }
      var meta = (r.condition || 'Assistant note') + (r.matched_symptoms && r.matched_symptoms.length
        ? ' · ' + r.matched_symptoms.join(', ') : '');
      addAnswerCard(cp, '',
        '<button class="btn ghost" data-log-thread="1" data-log-meta="' + esc(meta) + '">Log this in the thread</button>');
    } else {
      addAnswerCard([{ label: 'Assistant', text: r.message || 'Could you tell me a bit more?' }]);
    }
  }

  function doAsk() {
    var v = $('#askInput').value.trim();
    if (!v || asking) return;
    var p = pet();
    addMyBubble(v);
    $('#askInput').value = '';
    var typing = addTyping();
    chatScroll();

    if (p.species !== 'dog' && p.species !== 'cat') {
      typing.parentNode.removeChild(typing);
      addAnswerCard([{ label: 'Assistant', text: 'The chatbot only covers dogs and cats for now. For ' + p.name + ', please check with your vet.' }]);
      chatScroll();
      return;
    }

    asking = true;
    var hist = historyFor(p);
    var sent = hist.slice();
    hist.push({ role: 'user', content: v });

    fetch(CHATBOT + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: v, species: p.species, pet_name: p.name, history: sent })
    }).then(function (res) {
      if (!res.ok) { throw new Error('The chatbot returned an error (' + res.status + ').'); }
      return res.json();
    }).then(function (r) {
      typing.parentNode.removeChild(typing);
      showChatbotReply(r, p);
      hist.push({ role: 'assistant', content: r.message || r.condition || '' });
    }).catch(function (err) {
      typing.parentNode.removeChild(typing);
      hist.pop();
      var offline = err instanceof TypeError;
      addAnswerCard([{ label: 'Assistant', text: offline
        ? 'I could not reach the chatbot. Check that it is running at ' + CHATBOT + ', then send that again.'
        : err.message }]);
    }).then(function () {
      asking = false;
      chatScroll();
    });
  }

  $('#askSend').addEventListener('click', doAsk);
  $('#askForm').addEventListener('submit', function (e) { e.preventDefault(); doAsk(); });
  $('#askInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doAsk(); }
  });

  /* ============================================================
     11. Pull to refresh
     ============================================================ */

  (function () {
    var home = $('#s-home'), knob = $('#refresh');
    var y0 = null, pull = 0;
    home.addEventListener('pointerdown', function (e) {
      if (home.scrollTop > 0) return;
      y0 = e.clientY; pull = 0;
    });
    home.addEventListener('pointermove', function (e) {
      if (y0 === null) return;
      pull = Math.max(0, e.clientY - y0);
      if (pull > 4) {
        knob.classList.add('pull');
        knob.style.transform = 'translateY(' + Math.min(pull * 0.45, 46) + 'px) rotate(' + pull + 'deg)';
      }
    });
    function release() {
      if (y0 === null) return;
      if (pull > 70) {
        knob.classList.add('spin');
        knob.style.transform = 'translateY(40px)';
        setTimeout(function () {
          knob.classList.remove('pull', 'spin');
          knob.style.transform = '';
          toast('Care thread up to date');
        }, 1200);
      } else {
        knob.classList.remove('pull');
        knob.style.transform = '';
      }
      y0 = null;
    }
    home.addEventListener('pointerup', release);
    home.addEventListener('pointercancel', function () {
      y0 = null; knob.classList.remove('pull'); knob.style.transform = '';
    });
  })();

  /* ============================================================
     12. Presenter shell
     ============================================================ */

  var list = $('#jumplist');
  ORDER.forEach(function (id) {
    var el = screenEl(id);
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.setAttribute('data-jump', id);
    b.textContent = (el.getAttribute('data-name') || id).replace(/&middot;/g, '·').split('·')[0].trim();
    li.appendChild(b); list.appendChild(li);
  });

  function togglePresenter(on) {
    var p = $('#presenter');
    var open = on === undefined ? !p.classList.contains('open') : on;
    p.classList.toggle('open', open);
    $('#nudge').style.opacity = open ? 0 : 1;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheetOpen) { closeSheet(); return; }
    if (e.target.matches('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    var i = ORDER.indexOf(current);
    if (e.key === 'ArrowRight') { go(ORDER[Math.min(ORDER.length - 1, i + 1)], 'fade'); }
    else if (e.key === 'ArrowLeft') { go(ORDER[Math.max(0, i - 1)], 'fade'); }
    else if (e.key === 'p' || e.key === 'P') { togglePresenter(); }
    else if (e.key === 'g' || e.key === 'G') { $('#gridOverlay').classList.toggle('on'); }
    else if (e.key === 'r' || e.key === 'R') {
      var el = screenEl(current);
      el.classList.remove('settled'); void el.offsetWidth;
      $$('[data-count]', el).forEach(function (n) { n.dataset.done = '0'; n.dataset.from = '0'; });
      if (current === 's-assistant') assistantRan = false;
      settle(el);
    }
    else if (e.key === 'Escape') { togglePresenter(false); }
  });

  setTimeout(function () { $('#nudge').style.opacity = 0.35; }, 9000);

  /* ============================================================
     13. Launch
     ============================================================ */

  var start = (location.search.match(/screen=([\w-]+)/) || [])[1];
  start = start ? ('s-' + start.replace(/^s-/, '')) : 's-signin';
  if (!screenEl(start)) start = 's-signin';

  setStep(1);
  render();

  setTimeout(function () {
    var boot = $('#boot');
    boot.classList.add('gone');
    setTimeout(function () { if (boot.parentNode) boot.parentNode.removeChild(boot); }, 700);
    var el = screenEl(start);
    el.classList.add('is-active');
    current = start;
    chrome(start);
    settle(el);
  }, reduced ? 100 : 1750);

})();
