/* Tablet-Anzeige: hält den Zustand, berechnet Größen, rendert Sehzeichen / Amsler / Nahtest,
 * nimmt Befehle vom Handy (Link) oder vom eigenen Bedienfeld entgegen.
 */
(function (global) {
  'use strict';
  var O = global.Opto;
  var LS = 'sehtest.v1';

  // Default: alle iPads außer iPad mini haben 264 ppi bei devicePixelRatio 2 -> 132 CSS-px/Zoll
  var PRESETS = { ipad: 264 / 25.4 / 2, ipadmini: 326 / 25.4 / 2 };
  var INFO_RESERVE = 44; // px unten für Infozeile

  // Neutrale Lesetexte (eigene Formulierung)
  var NEAR_TEXTS = [
    'Am Morgen liegt noch Nebel über den Feldern. Die Sonne braucht eine Weile, bis sie ihn auflöst.',
    'Auf dem Wochenmarkt gibt es frisches Brot, Äpfel aus der Region und bunte Blumensträuße.',
    'Der kleine Bahnhof hat nur zwei Gleise. Trotzdem hält hier jede Stunde ein Zug in Richtung Stadt.',
    'Im Garten blühen die ersten Tulpen. Die Amsel sucht im feuchten Rasen nach Würmern.',
    'Nach dem Regen glänzen die Straßen, und der Duft von nassem Laub liegt in der Luft.',
    'In der Küche duftet es nach Kaffee und Zimt. Auf dem Tisch wartet eine Schale mit Nüssen.',
    'Die alte Buche am Waldrand spendet im Sommer angenehmen Schatten für müde Wanderer.',
    'Der Fluss fließt ruhig durch das Tal. An seinem Ufer stehen Weiden und ein paar Angler.',
    'Abends wird es kühl. Die Lichter der Häuser spiegeln sich im stillen Wasser des Sees.',
    'Ein Fahrrad lehnt an der Mauer. Daneben schläft eine Katze in der letzten Abendsonne.',
    'Der Bäcker öffnet um sechs Uhr. Kurz danach stehen die ersten Kunden vor der Ladentür.',
    'Über den Hügeln ziehen langsam Wolken vorbei, während unten im Dorf die Glocken läuten.'
  ];
  var NEAR_STEPS = O.STEPS.filter(function (v) { return v >= 0.1 && v <= 1.25; });
  var CAP_HEIGHT_RATIO = 0.716; // Arial / Helvetica: Versalhöhe relativ zur Schriftgröße

  function load() {
    try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; }
  }
  function save(obj) {
    try { localStorage.setItem(LS, JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  var saved = load();
  var state = {
    screen: 'test',
    distance: saved.distance || 2,
    visus: saved.visus || 0.5,
    mode: saved.mode || 'digits',
    count: saved.count || 'auto',
    extDigits: !!saved.extDigits,
    showInfo: saved.showInfo !== undefined ? saved.showInfo : true,
    row: [], rowCount: 0, wrong: [],
    avail: [], hMm: 0, strokeDevPx: 0,
    near: Object.assign({ distanceCm: 40, view: 'chart', visus: 0.4 }, saved.near || {}),
    results: saved.results || [],
    pairCode: saved.pairCode || global.Link.randomCode(6),
    calib: Object.assign({ pxPerMm: PRESETS.ipad, preset: 'ipad' }, saved.calib || {}),
    remotes: 0
  };

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() {
    save({
      distance: state.distance, visus: state.visus, mode: state.mode, count: state.count, extDigits: state.extDigits,
      showInfo: state.showInfo, near: state.near, results: state.results, pairCode: state.pairCode, calib: state.calib
    });
    listeners.forEach(function (fn) { fn(state); });
  }

  // ---------- Größen / Passung ----------
  function viewport() {
    return { w: global.innerWidth, h: global.innerHeight };
  }
  function fits(hPx, n, vp) {
    var marginX = Math.max(0.5 * hPx, 10);
    var marginY = Math.max(0.5 * hPx, 10);
    var rowW = hPx * (2 * n - 1); // n Zeichen + (n-1) Abstände von je einer Zeichenbreite (ISO 8596)
    return rowW + 2 * marginX <= vp.w && hPx + 2 * marginY <= vp.h - INFO_RESERVE;
  }
  function computeAvail() {
    var vp = viewport();
    var out = [];
    O.STEPS.forEach(function (v) {
      var hPx = O.sizeMm(state.distance, v) * state.calib.pxPerMm;
      var counts = state.count === 'auto' ? [5, 3, 1] : [state.count];
      for (var i = 0; i < counts.length; i++) {
        if (fits(hPx, counts[i], vp)) { out.push({ v: v, n: counts[i], hPx: hPx }); break; }
      }
    });
    state.avail = out;
    if (!out.length) return;
    var cur = out.filter(function (a) { return a.v === state.visus; })[0];
    if (!cur) {
      // nächste darstellbare Stufe wählen (bevorzugt nach oben)
      var higher = out.filter(function (a) { return a.v > state.visus; })[0];
      cur = higher || out[out.length - 1];
      state.visus = cur.v;
    }
    state.hMm = O.sizeMm(state.distance, state.visus);
    state.strokeDevPx = (state.hMm / 5) * state.calib.pxPerMm * (global.devicePixelRatio || 1);
    if (state.rowCount !== cur.n || !state.row.length) newRow(cur.n);
  }
  function newRow(n) {
    n = n || state.rowCount || 5;
    state.row = O.makeRow(state.mode, n, state.extDigits, state.row);
    state.rowCount = n;
    state.wrong = state.row.map(function () { return false; });
  }
  function currentCount() {
    var cur = state.avail.filter(function (a) { return a.v === state.visus; })[0];
    return cur ? cur.n : state.rowCount;
  }

  // ---------- Aktionen ----------
  function dispatch(action) {
    var a = action || {};
    switch (a.name) {
      case 'set': {
        var p = a.patch || {};
        var reroll = false;
        ['mode', 'extDigits', 'distance', 'count'].forEach(function (k) {
          if (p[k] !== undefined && p[k] !== state[k]) reroll = true;
        });
        if (p.visus !== undefined && p.visus !== state.visus) reroll = true;
        Object.keys(p).forEach(function (k) {
          if (['screen', 'distance', 'visus', 'mode', 'count', 'extDigits', 'showInfo'].indexOf(k) >= 0) state[k] = p[k];
        });
        if (p.distance) state.distance = Math.min(8, Math.max(0.5, +p.distance));
        computeAvail();
        if (reroll) newRow(currentCount());
        break;
      }
      case 'setNear':
        Object.assign(state.near, a.patch || {});
        if (state.screen !== 'near') state.screen = 'near';
        break;
      case 'step': {
        var idx = -1;
        state.avail.forEach(function (x, i) { if (x.v === state.visus) idx = i; });
        var ni = Math.min(state.avail.length - 1, Math.max(0, idx + (a.dir > 0 ? 1 : -1)));
        if (state.avail[ni] && state.avail[ni].v !== state.visus) {
          state.visus = state.avail[ni].v;
          computeAvail();
          newRow(currentCount());
        }
        break;
      }
      case 'reroll': newRow(currentCount()); break;
      case 'toggleWrong':
        if (state.wrong[a.index] !== undefined) state.wrong[a.index] = !state.wrong[a.index];
        break;
      case 'saveResult': {
        var n = state.rowCount, wrong = state.wrong.filter(Boolean).length;
        state.results.push({ eye: a.eye || 'B', visus: state.visus, correct: n - wrong, n: n, distance: state.distance, mode: state.mode, ts: Date.now() });
        break;
      }
      case 'deleteResult': state.results.splice(a.index, 1); break;
      case 'clearResults': state.results = []; break;
      case 'setCalib':
        Object.assign(state.calib, a.patch || {});
        if (a.patch && a.patch.preset && PRESETS[a.patch.preset]) state.calib.pxPerMm = PRESETS[a.patch.preset];
        computeAvail();
        break;
      case 'newCode':
        state.pairCode = global.Link.randomCode(6);
        break;
      default: return;
    }
    emit();
  }

  // ---------- Rendern ----------
  var els = {};
  function $(id) { return document.getElementById(id); }

  function renderRow() {
    var cur = state.avail.filter(function (a) { return a.v === state.visus; })[0];
    if (!cur) { els.row.innerHTML = ''; els.hint.textContent = 'Keine Visusstufe passt auf den Bildschirm – Entfernung verringern.'; els.hint.hidden = false; return; }
    els.hint.hidden = true;
    var hPx = cur.hPx;
    els.row.style.gap = hPx + 'px';
    els.row.innerHTML = state.row.map(function (sym) { return O.svg(sym, hPx); }).join('');
  }

  function renderInfo() {
    if (!state.showInfo) { els.info.textContent = ''; return; }
    var corr = O.infinityCorrection(state.distance);
    els.info.textContent = 'Visus ' + O.fmtVisus(state.visus) + '  ·  ' + O.fmtNum(state.distance, 2) + ' m  ·  ∞ ' + O.fmtDpt(corr.rounded) +
      '  ·  ' + state.rowCount + ' Zeichen';
  }

  function renderAmsler() {
    var pxPerMm = state.calib.pxPerMm;
    var sizeMm = 100, cells = 20, cell = sizeMm / cells;
    var lw = Math.max(0.3, 2 / (pxPerMm * (global.devicePixelRatio || 1))); // ≥ 2 Gerätepixel, in mm
    var s = sizeMm * pxPerMm;
    var lines = '';
    for (var i = 0; i <= cells; i++) {
      var p = i * cell;
      lines += '<line x1="' + p + '" y1="0" x2="' + p + '" y2="' + sizeMm + '"/>';
      lines += '<line x1="0" y1="' + p + '" x2="' + sizeMm + '" y2="' + p + '"/>';
    }
    els.amsler.innerHTML =
      '<svg viewBox="-1 -1 102 102" width="' + (s * 1.02) + '" height="' + (s * 1.02) + '" style="display:block">' +
      '<rect x="0" y="0" width="100" height="100" fill="#fff"/>' +
      '<g stroke="#000" stroke-width="' + lw + '">' + lines + '</g>' +
      '<circle cx="50" cy="50" r="1" fill="#000"/></svg>' +
      '<div class="note">Amsler-Gitter 10 × 10 cm, Prüfabstand 30 cm (1 Kästchen = 1°). Punkt in der Mitte fixieren, ein Auge abdecken.</div>';
  }

  function renderNear() {
    var pxPerMm = state.calib.pxPerMm;
    var dM = state.near.distanceCm / 100;
    function fontPx(v) { return O.sizeMm(dM, v) / CAP_HEIGHT_RATIO * pxPerMm; }
    var html = '';
    if (state.near.view === 'single') {
      var v = state.near.visus;
      var txt = NEAR_TEXTS[NEAR_STEPS.indexOf(v) % NEAR_TEXTS.length] + ' ' + NEAR_TEXTS[(NEAR_STEPS.indexOf(v) + 5) % NEAR_TEXTS.length];
      html = '<div class="single"><p style="font-size:' + fontPx(v).toFixed(2) + 'px">' + txt + '</p>' +
        '<div class="tag">Visus ' + O.fmtVisus(v) + ' bei ' + state.near.distanceCm + ' cm · Versalhöhe ' + O.fmtNum(O.sizeMm(dM, v), 2) + ' mm</div></div>';
    } else {
      // Lesetafel: groß nach klein
      NEAR_STEPS.forEach(function (v, i) {
        html += '<div class="para"><div class="tag">Visus ' + O.fmtVisus(v) + '<br>' + O.fmtNum(O.sizeMm(dM, v), 2) + ' mm</div>' +
          '<p style="font-size:' + fontPx(v).toFixed(2) + 'px">' + NEAR_TEXTS[i % NEAR_TEXTS.length] + '</p></div>';
      });
      html += '<div class="tag" style="color:#999;font-size:11px;margin-top:20px">Nahsehprobe für ' + state.near.distanceCm + ' cm. Visusangabe bezogen auf die Versalhöhe (5 Winkelminuten). Schriftgrößen skaliert per Bildschirmkalibrierung.</div>';
    }
    els.near.innerHTML = html;
  }

  function render() {
    var scr = state.screen;
    els.row.hidden = scr !== 'test';
    els.info.hidden = scr !== 'test';
    els.amsler.hidden = scr !== 'amsler';
    els.near.hidden = scr !== 'near';
    if (scr === 'test') { renderRow(); renderInfo(); }
    else if (scr === 'amsler') renderAmsler();
    else if (scr === 'near') renderNear();
    else { els.row.innerHTML = ''; els.hint.hidden = true; }
    var portrait = global.innerHeight > global.innerWidth && scr === 'test';
    els.portraitHint.hidden = !portrait;
  }

  // ---------- Setup-Ansicht ----------
  function remoteUrl() {
    var base = location.href.replace(/[#?].*$/, '').replace(/index\.html$/, '');
    return base + 'remote.html?c=' + state.pairCode;
  }
  function renderSetup() {
    var c = state.calib;
    var url = remoteUrl();
    var qr = '';
    try {
      if (global.qrcode) {
        var q = global.qrcode(0, 'M'); q.addData(url); q.make();
        qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      }
    } catch (e) { qr = ''; }
    els.setupBody.innerHTML =
      '<div class="setup-grid">' +
      '<section class="card"><h3>1 · Prüfentfernung</h3>' +
      '<div class="seg">' + [1.5, 2, 2.5, 3, 4, 5].map(function (d) {
        return '<button type="button" class="btn' + (d === state.distance ? ' on' : '') + '" data-setup="dist" data-d="' + d + '">' + O.fmtNum(d, 1) + ' m</button>';
      }).join('') + '</div>' +
      '<div class="inline"><span class="lbl2">Andere</span><input class="num" type="number" inputmode="decimal" step="0.05" min="0.5" max="8" value="' + state.distance + '" data-setup="distInput"> m</div>' +
      '<div class="small">Korrektur des Ergebnisses auf ∞: <b>' + O.fmtDpt(O.infinityCorrection(state.distance).rounded) + '</b> ' +
      '<span class="dim">(Akkommodationsbedarf 1/' + O.fmtNum(state.distance, 2) + ' m)</span></div>' +
      '</section>' +

      '<section class="card"><h3>2 · Handy als Fernbedienung</h3>' +
      '<div>Code: <span class="code">' + state.pairCode + '</span> ' + '<button type="button" class="btn mini" data-setup="newCode">neu</button></div>' +
      '<div class="qr">' + qr + '</div>' +
      '<div class="url">' + url + '</div>' +
      '<div class="small dim">Auf dem Handy die Seite öffnen (QR scannen) und den Code eingeben. Beide Geräte brauchen Internet (z. B. Handy-Hotspot für das iPad). Der Code bleibt gespeichert – die Seite am Handy als Lesezeichen sichern.</div>' +
      '<div class="small" id="setupConn"></div>' +
      '</section>' +

      '<section class="card"><h3>3 · Bildschirm-Kalibrierung</h3>' +
      '<div class="seg">' +
      '<button type="button" class="btn' + (c.preset === 'ipad' ? ' on' : '') + '" data-setup="preset" data-p="ipad">iPad / iPad Air / Pro (264 ppi)</button>' +
      '<button type="button" class="btn' + (c.preset === 'ipadmini' ? ' on' : '') + '" data-setup="preset" data-p="ipadmini">iPad mini (326 ppi)</button>' +
      '</div>' +
      '<div class="small">Kontrolle: Die Linie muss genau <b>100 mm</b>, der Rahmen so breit wie eine Bankkarte (<b>85,6 mm</b>) sein.</div>' +
      '<div class="calib-line" style="width:' + (100 * c.pxPerMm) + 'px"></div>' +
      '<div class="calib-card" style="width:' + (85.6 * c.pxPerMm) + 'px"></div>' +
      '<input class="range" type="range" min="' + (PRESETS.ipad * 0.8).toFixed(3) + '" max="' + (PRESETS.ipadmini * 1.2).toFixed(3) + '" step="0.005" value="' + c.pxPerMm + '" data-setup="pxmm">' +
      '<div class="small dim">' + O.fmtNum(c.pxPerMm, 3) + ' px/mm · Bildschirm ' + global.innerWidth + ' × ' + global.innerHeight + ' px · Pixelverhältnis ' + (global.devicePixelRatio || 1) + '</div>' +
      '</section>' +

      '<section class="card"><h3>4 · Hinweise</h3>' +
      '<ul class="small" style="margin:0;padding-left:18px;line-height:1.5">' +
      '<li>Tablet im <b>Querformat</b> aufstellen, Helligkeit hoch, True Tone / Night Shift aus.</li>' +
      '<li>Für Vollbild ohne Browserleiste: Seite in Safari „Zum Home-Bildschirm“ hinzufügen und von dort starten.</li>' +
      '<li>Ohne Handy: Zahnrad oben rechts antippen oder Tastatur (↑/↓ Stufe, Leertaste neu würfeln, Z/B/L/E Zeichenart, W Weiß, A Amsler, N Nahtest).</li>' +
      '<li>Bei 5 m passen Reihen mit 5 Zeichen erst ab Visus 0,4 auf ein 11″-iPad; für tiefe Stufen 2–3 m wählen oder „Auto“ (weniger Zeichen).</li>' +
      '</ul></section>' +
      '</div>' +
      '<div class="actions" style="margin-top:14px"><button type="button" class="btn primary big" style="flex:1" data-setup="start">Sehtest starten</button></div>';
    updateSetupConn();
  }
  var linkStatus = { s: 'offline', detail: '' };
  function updateSetupConn() {
    var el = $('setupConn');
    if (!el) return;
    var map = { offline: 'Verbindung: aus', connecting: 'Verbindung zum Vermittlungsserver wird aufgebaut …', waiting: 'Bereit – warte auf Handy …', connected: '✓ Handy verbunden (' + state.remotes + ')', error: 'Fehler: ' + (linkStatus.detail || '') };
    el.textContent = map[linkStatus.s] || linkStatus.s;
    el.style.color = linkStatus.s === 'connected' ? 'var(--ui-ok)' : (linkStatus.s === 'error' ? 'var(--ui-bad)' : 'var(--ui-dim)');
  }

  function bindSetup() {
    els.setupBody.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-setup]');
      if (!el) return;
      var k = el.dataset.setup;
      if (k === 'dist') dispatch({ name: 'set', patch: { distance: +el.dataset.d } });
      else if (k === 'preset') dispatch({ name: 'setCalib', patch: { preset: el.dataset.p } });
      else if (k === 'newCode') { dispatch({ name: 'newCode' }); startLink(); }
      else if (k === 'start') { els.setup.hidden = true; requestWakeLock(); }
    });
    els.setupBody.addEventListener('input', function (ev) {
      var el = ev.target;
      if (el.dataset.setup === 'pxmm') {
        state.calib.pxPerMm = +el.value; state.calib.preset = 'manual';
        var line = els.setupBody.querySelector('.calib-line'), card = els.setupBody.querySelector('.calib-card');
        if (line) line.style.width = (100 * state.calib.pxPerMm) + 'px';
        if (card) card.style.width = (85.6 * state.calib.pxPerMm) + 'px';
      }
    });
    els.setupBody.addEventListener('change', function (ev) {
      var el = ev.target;
      if (el.dataset.setup === 'pxmm') dispatch({ name: 'setCalib', patch: { pxPerMm: +el.value, preset: 'manual' } });
      if (el.dataset.setup === 'distInput') {
        var v = parseFloat(String(el.value).replace(',', '.'));
        if (v >= 0.5 && v <= 8) dispatch({ name: 'set', patch: { distance: Math.round(v * 100) / 100 } });
      }
    });
  }

  // ---------- Verbindung ----------
  var link = null;
  function publicState() {
    var s = Object.assign({}, state);
    delete s.calib;
    return s;
  }
  function startLink() {
    if (link) link.close();
    if (!global.Link.hasPeer()) { linkStatus = { s: 'error', detail: 'PeerJS fehlt' }; updateStatus(); return; }
    link = global.Link.host(state.pairCode, {
      onStatus: function (s, detail, n) {
        linkStatus = { s: s, detail: detail || '' };
        state.remotes = n || 0;
        updateStatus(); updateSetupConn();
      },
      onOpen: function (conn) { link.sendTo(conn, { t: 'state', state: publicState() }); },
      onData: function (d) {
        if (d && d.t === 'action') dispatch(d.action);
        else if (d && d.t === 'hello') link.send({ t: 'state', state: publicState() });
      }
    });
  }
  function updateStatus() {
    var el = els.status;
    el.className = linkStatus.s;
    var txt = { offline: 'Fernbedienung aus', connecting: 'Verbinde …', waiting: 'Code ' + state.pairCode + ' – warte auf Handy', connected: 'Handy verbunden', error: 'Verbindung: ' + linkStatus.detail }[linkStatus.s];
    el.innerHTML = '<span class="dot"></span>' + (txt || '');
  }

  // ---------- Wake Lock / Vollbild ----------
  var wakeLock = null;
  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').then(function (wl) { wakeLock = wl; }).catch(function () { /* ignore */ });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') requestWakeLock(); });
  function toggleFullscreen() {
    var d = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      var f = d.requestFullscreen || d.webkitRequestFullscreen;
      if (f) { try { var p = f.call(d); if (p && p.catch) p.catch(function () { /* ignore */ }); } catch (e) { /* ignore */ } }
    }
  }

  // ---------- Start ----------
  function init() {
    ['stage', 'row', 'info', 'hint', 'amsler', 'near', 'portraitHint', 'gear', 'status', 'setup', 'setupBody', 'panel', 'panelBody'].forEach(function (id) { els[id] = $(id); });

    computeAvail();
    onChange(function () { render(); Controls.render(els.panelBody, state, dispatch, els.panelBody._opts); if (!els.setup.hidden) renderSetup(); if (link) link.send({ t: 'state', state: publicState() }); });
    render();

    // Tablet-Bedienfeld
    els.panelBody._opts = { extraHtml: '' };
    Controls.bind(els.panelBody, dispatch, function () { return state; });
    els.panelBody._onAction = function (a) {
      if (a === 'closePanel') els.panel.hidden = true;
      if (a === 'openSetup') { els.panel.hidden = true; els.setup.hidden = false; renderSetup(); }
      if (a === 'fullscreen') toggleFullscreen();
    };
    Controls.render(els.panelBody, state, dispatch, els.panelBody._opts);
    els.gear.addEventListener('click', function () {
      els.panel.hidden = !els.panel.hidden;
      if (!els.panel.hidden) Controls.render(els.panelBody, state, dispatch, els.panelBody._opts);
    });
    els.panel.addEventListener('click', function (ev) { if (ev.target === els.panel) els.panel.hidden = true; });
    document.querySelectorAll('[data-panel]').forEach(function (b) {
      b.addEventListener('click', function () { els.panelBody._onAction(b.dataset.panel); });
    });

    // Setup
    bindSetup();
    renderSetup();
    els.setup.addEventListener('click', function (ev) { if (ev.target === els.setup && state.row.length) els.setup.hidden = true; });

    // Tastatur (Bluetooth-Tastatur / Presenter)
    document.addEventListener('keydown', function (ev) {
      if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
      var k = ev.key;
      var map = { ArrowUp: function () { dispatch({ name: 'step', dir: -1 }); }, ArrowDown: function () { dispatch({ name: 'step', dir: 1 }); },
        ArrowLeft: function () { dispatch({ name: 'step', dir: -1 }); }, ArrowRight: function () { dispatch({ name: 'step', dir: 1 }); },
        ' ': function () { dispatch({ name: 'reroll' }); }, r: function () { dispatch({ name: 'reroll' }); },
        z: function () { dispatch({ name: 'set', patch: { mode: 'digits' } }); }, b: function () { dispatch({ name: 'set', patch: { mode: 'letters' } }); },
        l: function () { dispatch({ name: 'set', patch: { mode: 'landolt' } }); }, e: function () { dispatch({ name: 'set', patch: { mode: 'e' } }); },
        w: function () { dispatch({ name: 'set', patch: { screen: 'blank' } }); }, a: function () { dispatch({ name: 'set', patch: { screen: 'amsler' } }); },
        n: function () { dispatch({ name: 'set', patch: { screen: 'near' } }); }, t: function () { dispatch({ name: 'set', patch: { screen: 'test' } }); },
        i: function () { dispatch({ name: 'set', patch: { showInfo: !state.showInfo } }); }, f: toggleFullscreen,
        s: function () { els.panel.hidden = !els.panel.hidden; }, Escape: function () { els.panel.hidden = true; }
      };
      var fn = map[k] || map[k.toLowerCase && k.toLowerCase()];
      if (fn) { ev.preventDefault(); fn(); }
    });

    // Fenstergröße / Drehung
    var rt;
    global.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { computeAvail(); emit(); }, 150); });

    startLink();
    updateStatus();
    requestWakeLock();

    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  global.SehtestDisplay = { state: state, dispatch: dispatch };
})(window);
