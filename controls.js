/* Gemeinsames Bedienfeld – wird auf dem Handy (Fernbedienung) und als Overlay auf dem Tablet benutzt.
 * render(container, state, dispatch, opts) baut die Oberfläche aus dem aktuellen Zustand neu auf.
 * Alle Eingaben laufen über dispatch({name:..., ...}); ob lokal oder per Funkverbindung, ist hier egal.
 */
(function (global) {
  'use strict';
  var O = global.Opto;

  var MODES = [['digits', 'Zahlen'], ['letters', 'Buchstaben'], ['landolt', 'Landolt'], ['e', 'E-Haken']];
  var SCREENS = [['test', 'Sehtest'], ['blank', 'Weiß'], ['amsler', 'Amsler'], ['near', 'Nahtest']];
  var DISTANCES = [1.5, 2, 2.5, 3, 4, 5];
  var NEAR_D = [30, 33, 40];
  var EYES = [['R', 'Rechts'], ['L', 'Links'], ['B', 'Beide']];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function btn(label, action, extra, cls) {
    return '<button type="button" class="btn ' + (cls || '') + '" data-action="' + action + '"' + (extra || '') + '>' + label + '</button>';
  }
  function seg(items, current, action, key) {
    return '<div class="seg">' + items.map(function (it) {
      var val = it[0], label = it[1];
      var on = String(val) === String(current);
      return '<button type="button" class="btn' + (on ? ' on' : '') + '" data-action="' + action + '" data-' + key + '="' + val + '">' + label + '</button>';
    }).join('') + '</div>';
  }

  function eyeLabel(e) { return e === 'R' ? 'R' : e === 'L' ? 'L' : 'Bino'; }

  function render(container, state, dispatch, opts) {
    opts = opts || {};
    // Laufende Eingabe nicht zerstören
    var ae = document.activeElement;
    if (ae && container.contains(ae) && ae.tagName === 'INPUT') {
      container._pending = true;
      return;
    }
    container._pending = false;

    var s = state;
    var avail = s.avail || [];
    var cur = avail.filter(function (a) { return a.v === s.visus; })[0];
    var n = s.rowCount || (s.row ? s.row.length : 0);
    var wrong = (s.wrong || []).filter(Boolean).length;
    var correct = n - wrong;
    var thr = O.passThreshold(n);
    var corr = O.infinityCorrection(s.distance);
    var html = '';

    // --- Kopf: aktueller Visus ---
    html += '<section class="card head">';
    html += '<div class="visus-big"><span class="lbl">Visus</span><span class="val">' + O.fmtVisus(s.visus) + '</span>' +
      '<span class="sub">logMAR ' + O.fmtNum(O.logMAR(s.visus), 1) + ' · Zeichen ' + O.fmtNum(s.hMm || 0, 1) + ' mm</span></div>';
    html += '<div class="meta"><div>Entfernung <b>' + O.fmtNum(s.distance, 2) + ' m</b></div>' +
      '<div>Korrektur auf ∞: <b>' + O.fmtDpt(corr.rounded) + '</b>' +
      (Math.abs(corr.rounded - corr.exact) > 0.01 ? ' <span class="dim">(exakt ' + O.fmtDpt(corr.exact) + ')</span>' : '') + '</div>';
    if (s.strokeDevPx && s.strokeDevPx < 2) html += '<div class="warn">⚠ Strichstärke nur ' + O.fmtNum(s.strokeDevPx, 1) + ' Gerätepixel – Darstellung unscharf</div>';
    if (s.screen !== 'test') html += '<div class="warn">Tablet zeigt gerade: <b>' + (SCREENS.filter(function (x) { return x[0] === s.screen; })[0] || ['', s.screen])[1] + '</b></div>';
    html += '</div></section>';

    // --- Aktuelle Reihe (zum Ankreuzen) ---
    html += '<section class="card">';
    html += '<div class="rowline">' + (s.row || []).map(function (sym, i) {
      var w = s.wrong && s.wrong[i];
      return '<button type="button" class="symbtn' + (w ? ' wrong' : '') + '" data-action="toggleWrong" data-index="' + i + '" title="' + esc(O.describe(sym)) + '">' +
        O.svg(sym, 44) + '</button>';
    }).join('') + '</div>';
    html += '<div class="rowmeta"><span>' + n + ' Zeichen · <b>' + correct + '/' + n + '</b> richtig' +
      (n ? (correct >= thr ? ' <span class="ok">✓ Stufe erkannt</span>' : ' <span class="bad">✗ nicht erkannt</span>') : '') + '</span>' +
      '<span class="dim">Zeichen antippen = falsch</span></div>';
    html += '<div class="actions">' + btn('🎲 Neu würfeln', 'reroll', '', 'primary') +
      '<span class="grow"></span>' +
      EYES.map(function (e) { return btn('Ergebnis ' + e[1], 'saveResult', ' data-eye="' + e[0] + '"'); }).join('') + '</div>';
    html += '</section>';

    // --- Visusstufe ---
    html += '<section class="card">';
    html += '<div class="stepper">' +
      btn('▲ Größer<small>Visus ↓</small>', 'step', ' data-dir="-1"', 'big') +
      btn('▼ Kleiner<small>Visus ↑</small>', 'step', ' data-dir="1"', 'big') + '</div>';
    html += '<div class="chips">' + O.STEPS.map(function (v) {
      var a = avail.filter(function (x) { return x.v === v; })[0];
      var cls = 'chip' + (v === s.visus ? ' on' : '') + (a ? '' : ' off');
      return '<button type="button" class="' + cls + '" data-action="setVisus" data-v="' + v + '"' + (a ? '' : ' disabled') +
        ' title="' + (a ? a.n + ' Zeichen' : 'passt nicht auf den Bildschirm') + '">' + O.fmtVisus(v) +
        (a && a.n !== 5 ? '<small>' + a.n + '</small>' : '') + '</button>';
    }).join('') + '</div>';
    if (avail.length && avail[0].v > O.STEPS[0]) {
      html += '<div class="dim small">Kleinste darstellbare Stufe bei ' + O.fmtNum(s.distance, 1) + ' m: ' + O.fmtVisus(avail[0].v) +
        ' (' + avail[0].n + ' Zeichen). Für tiefere Stufen: Entfernung verringern oder weniger Zeichen pro Reihe.</div>';
    }
    html += '</section>';

    // --- Sehzeichen ---
    html += '<section class="card"><h3>Sehzeichen</h3>';
    html += seg(MODES, s.mode, 'setMode', 'mode');
    html += '<div class="inline"><span class="lbl2">Zeichen pro Reihe</span>' + seg([['auto', 'Auto'], [5, '5'], [3, '3'], [1, '1']], s.count, 'setCount', 'count') + '</div>';
    if (s.mode === 'digits') {
      html += '<label class="check"><input type="checkbox" data-action="toggleExt"' + (s.extDigits ? ' checked' : '') + '> Zahlen 4 und 7 zusätzlich verwenden</label>';
    }
    html += '</section>';

    // --- Anzeige ---
    html += '<section class="card"><h3>Anzeige am Tablet</h3>';
    html += seg(SCREENS, s.screen, 'setScreen', 'screen');
    if (s.screen === 'near') {
      var nr = s.near || {};
      html += '<div class="inline"><span class="lbl2">Nahdistanz</span>' + seg(NEAR_D.map(function (d) { return [d, d + ' cm']; }), nr.distanceCm, 'setNearDist', 'cm') + '</div>';
      html += '<div class="inline"><span class="lbl2">Darstellung</span>' + seg([['chart', 'Lesetafel'], ['single', 'Ein Absatz']], nr.view, 'setNearView', 'view') + '</div>';
      html += '<div class="inline"><span class="lbl2">Visus-Bezug</span>' + seg([['x', 'x-Höhe (M-System)'], ['cap', 'Versalhöhe']], nr.ref || 'x', 'setNearRef', 'ref') + '</div>';
      if (nr.view === 'single') {
        html += '<div class="chips">' + O.STEPS.filter(function (v) { return v >= 0.1 && v <= 1.25; }).map(function (v) {
          return '<button type="button" class="chip' + (v === nr.visus ? ' on' : '') + '" data-action="setNearVisus" data-v="' + v + '">' + O.fmtVisus(v) + '</button>';
        }).join('') + '</div>';
      }
    }
    html += '<label class="check"><input type="checkbox" data-action="toggleInfo"' + (s.showInfo ? ' checked' : '') + '> Visus/Entfernung klein am Tablet einblenden</label>';
    html += '</section>';

    // --- Entfernung ---
    html += '<section class="card"><h3>Prüfentfernung</h3>';
    html += seg(DISTANCES.map(function (d) { return [d, O.fmtNum(d, 1) + ' m']; }), s.distance, 'setDistance', 'd');
    html += '<div class="inline"><span class="lbl2">Andere</span><input class="num" type="number" inputmode="decimal" step="0.05" min="0.5" max="8" value="' + s.distance + '" data-action="inputDistance"> m</div>';
    html += '</section>';

    // --- Ergebnisse ---
    var res = s.results || [];
    html += '<section class="card"><h3>Ergebnisse <span class="dim">(' + res.length + ')</span></h3>';
    if (!res.length) html += '<div class="dim small">Noch keine. „Ergebnis Rechts/Links/Beide“ speichert die aktuelle Stufe mit Trefferzahl.</div>';
    else {
      html += '<table class="results"><tbody>' + res.map(function (r, i) {
        var c = O.infinityCorrection(r.distance);
        return '<tr><td><b>' + eyeLabel(r.eye) + '</b></td><td>Visus <b>' + O.fmtVisus(r.visus) + '</b></td><td>' + r.correct + '/' + r.n + '</td>' +
          '<td class="dim">' + O.fmtNum(r.distance, 1) + ' m · ∞ ' + O.fmtDpt(c.rounded) + '</td>' +
          '<td>' + btn('✕', 'deleteResult', ' data-index="' + i + '"', 'mini') + '</td></tr>';
      }).join('') + '</tbody></table>';
      html += '<div class="actions">' + btn('Alle löschen', 'clearResults', '', 'mini') + '</div>';
    }
    html += '</section>';

    if (opts.extraHtml) html += opts.extraHtml;

    container.innerHTML = html;
  }

  function bind(container, dispatch, getState) {
    if (container._bound) return;
    container._bound = true;
    container.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-action]');
      if (!el || el.tagName === 'INPUT') return;
      var a = el.dataset.action;
      var d = el.dataset;
      switch (a) {
        case 'reroll': dispatch({ name: 'reroll' }); break;
        case 'step': dispatch({ name: 'step', dir: +d.dir }); break;
        case 'setVisus': dispatch({ name: 'set', patch: { visus: +d.v } }); break;
        case 'setMode': dispatch({ name: 'set', patch: { mode: d.mode } }); break;
        case 'setCount': dispatch({ name: 'set', patch: { count: d.count === 'auto' ? 'auto' : +d.count } }); break;
        case 'setScreen': dispatch({ name: 'set', patch: { screen: d.screen } }); break;
        case 'setDistance': dispatch({ name: 'set', patch: { distance: +d.d } }); break;
        case 'setNearDist': dispatch({ name: 'setNear', patch: { distanceCm: +d.cm } }); break;
        case 'setNearView': dispatch({ name: 'setNear', patch: { view: d.view } }); break;
        case 'setNearVisus': dispatch({ name: 'setNear', patch: { visus: +d.v } }); break;
        case 'setNearRef': dispatch({ name: 'setNear', patch: { ref: d.ref } }); break;
        case 'toggleWrong': dispatch({ name: 'toggleWrong', index: +d.index }); break;
        case 'saveResult': dispatch({ name: 'saveResult', eye: d.eye }); break;
        case 'deleteResult': dispatch({ name: 'deleteResult', index: +d.index }); break;
        case 'clearResults': if (confirm('Alle Ergebnisse löschen?')) dispatch({ name: 'clearResults' }); break;
        default: if (container._onAction) container._onAction(a, d, el);
      }
    });
    container.addEventListener('change', function (ev) {
      var el = ev.target;
      var a = el.dataset && el.dataset.action;
      if (a === 'toggleInfo') dispatch({ name: 'set', patch: { showInfo: el.checked } });
      else if (a === 'toggleExt') dispatch({ name: 'set', patch: { extDigits: el.checked } });
      else if (a === 'inputDistance') {
        var v = parseFloat(String(el.value).replace(',', '.'));
        if (v >= 0.5 && v <= 8) dispatch({ name: 'set', patch: { distance: Math.round(v * 100) / 100 } });
        el.blur();
      }
    });
    container.addEventListener('focusout', function () {
      if (container._pending && getState) setTimeout(function () { render(container, getState(), dispatch, container._opts); }, 50);
    });
  }

  global.Controls = { render: render, bind: bind };
})(window);
