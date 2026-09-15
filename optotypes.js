/* Sehzeichen-Geometrie und Visus-Mathematik
 * ------------------------------------------
 * Alle Sehzeichen sind auf einem 5x5-Raster konstruiert (Strichstärke = 1 Einheit,
 * Gesamthöhe = 5 Einheiten), wie Landolt-Ring / Sloan-Buchstaben nach DIN EN ISO 8596.
 * Bei Visus 1,0 entspricht die Gesamthöhe 5 Winkelminuten, die Strichstärke 1 Winkelminute.
 */
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;
  var FIVE_ARCMIN = (5 / 60) * DEG;

  // Logarithmische Visusstufen nach ISO 8596 / DIN 58220 (0,1 log-Schritte)
  var STEPS = [0.05, 0.063, 0.08, 0.1, 0.125, 0.16, 0.2, 0.25, 0.32, 0.4, 0.5, 0.63, 0.8, 1.0, 1.25, 1.6, 2.0];

  // Sloan-Buchstaben (ETDRS / ISO 8596 kalibrierter Satz)
  var LETTERS = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'];
  // Zahlen-Sehzeichen: 0, 1 und (standardmäßig) 4, 7 sind wegen abweichender Erkennbarkeit ausgeschlossen
  var DIGITS = ['2', '3', '5', '6', '8', '9'];
  var DIGITS_EXT = ['4', '7'];
  var LANDOLT = [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { return 'L' + a; });
  var TUMBLING_E = [0, 90, 180, 270].map(function (a) { return 'E' + a; });

  // Attribut-Sets
  var S = 'fill="none" stroke="#000" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10"';
  var SR = 'fill="none" stroke="#000" stroke-width="1" stroke-linecap="butt" stroke-linejoin="round"';
  var F = 'fill="#000" stroke="none"';
  var FE = 'fill="#000" stroke="none" fill-rule="evenodd"';
  var W = 'fill="#fff" stroke="none"';

  // Geometrie im 5x5-Raster. Überstehende Teile werden durch den SVG-Viewport abgeschnitten.
  var SHAPES = {
    // --- Sloan-Buchstaben ---
    C: '<circle cx="2.5" cy="2.5" r="2" ' + S + '/><rect x="2.5" y="2" width="2.6" height="1" ' + W + '/>',
    D: '<path d="M0,0 H2.5 A2.5,2.5 0 0 1 2.5,5 H0 Z M1,1 V4 H2.5 A1.5,1.5 0 0 0 2.5,1 Z" ' + FE + '/>',
    H: '<path d="M0,0 H1 V5 H0 Z M4,0 H5 V5 H4 Z M1,2 H4 V3 H1 Z" ' + F + '/>',
    K: '<path d="M0,0 H1 V5 H0 Z" ' + F + '/>' +
       '<path d="M0.5,2.5 L5.6,-0.33 M1.85,1.75 L5.6,5.7" ' + S + '/>',
    N: '<path d="M0,0 H1 V5 H0 Z M4,0 H5 V5 H4 Z M0,0 H1.28 L5,5 H3.72 Z" ' + F + '/>',
    O: '<circle cx="2.5" cy="2.5" r="2" ' + S + '/>',
    R: '<path d="M0,0 H1 V5 H0 Z" ' + F + '/>' +
       '<path d="M0,0 H3.5 A1.5,1.5 0 0 1 3.5,3 H0 Z M1,1 V2 H3.5 A0.5,0.5 0 0 0 3.5,1 Z" ' + FE + '/>' +
       '<path d="M2.7,2.9 H3.85 L5,5 H3.85 Z" ' + F + '/>',
    S: '<path d="M4.23,1 A2,1 0 1 0 2.5,2.5 A2,1 0 1 1 0.77,4" ' + S + '/>',
    V: '<path d="M0.35,-0.4 L2.5,5.3 M4.65,-0.4 L2.5,5.3" ' + S + '/>',
    Z: '<path d="M0,0 H5 V1 H0 Z M0,4 H5 V5 H0 Z M3.586,0 H5 L1.414,5 H0 Z" ' + F + '/>',
    // --- Zahlen (Höhe 5, Breite 4, mittig in der 5er-Zelle; Strichstärke 1, runde Ecken) ---
    '2': '<path d="M1,2 A1.5,1.5 0 1 1 3.8,2.75 L1,4.5 M0.5,4.5 H4.5" ' + SR + '/>',
    '3': '<path d="M1,1.5 A1.5,1 0 1 1 2.5,2.5 A1.5,1 0 1 1 1,3.5" ' + SR + '/>',
    '4': '<path d="M3.25,0 V5 M3.25,0.1 L0.75,3.5 H4.5" ' + SR + '/>',
    '5': '<path d="M4.25,0.5 H1 V2.4 H2.5 A1.5,1.05 0 1 1 1.2,3.98" ' + SR + '/>',
    '6': '<path d="M3.9,0.5 C2.2,0.5 1,1.9 1,3.3 A1.5,1.2 0 0 0 4,3.3 A1.5,1.2 0 0 0 1,3.3" ' + SR + '/>',
    '7': '<path d="M0.5,0.5 H4 L1.8,5" ' + SR + '/>',
    '8': '<ellipse cx="2.5" cy="1.5" rx="1.3" ry="1" ' + S + '/><ellipse cx="2.5" cy="3.5" rx="1.5" ry="1" ' + S + '/>',
    '9': '<path d="M1.1,4.5 C2.8,4.5 4,3.1 4,1.7 A1.5,1.2 0 0 0 1,1.7 A1.5,1.2 0 0 0 4,1.7" ' + SR + '/>'
  };

  function shapeFor(sym) {
    if (SHAPES[sym]) return SHAPES[sym];
    var m = /^([LE])(\d+)$/.exec(sym);
    if (!m) return '';
    var a = m[2];
    if (m[1] === 'L') {
      // Landolt-Ring: Außendurchmesser 5, Strichstärke 1, Lücke 1 (Öffnung bei 0° rechts, Drehung im Uhrzeigersinn)
      return '<circle cx="2.5" cy="2.5" r="2" ' + S + '/>' +
        '<rect x="3" y="2" width="2.3" height="1" ' + W + ' transform="rotate(' + a + ' 2.5 2.5)"/>';
    }
    // E-Haken (Snellen-E): Öffnung bei 0° rechts
    return '<path d="M0,0 H5 V1 H1 V2 H5 V3 H1 V4 H5 V5 H0 Z" ' + F + ' transform="rotate(' + a + ' 2.5 2.5)"/>';
  }

  /** SVG-Markup für ein Sehzeichen mit Kantenlänge sizePx (CSS-Pixel). */
  function svg(sym, sizePx, extraClass) {
    var sz = (Math.round(sizePx * 1000) / 1000);
    return '<svg class="opto ' + (extraClass || '') + '" viewBox="0 0 5 5" width="' + sz + '" height="' + sz +
      '" style="width:' + sz + 'px;height:' + sz + 'px;overflow:hidden;display:block" shape-rendering="geometricPrecision" aria-label="' + describe(sym) + '">' +
      shapeFor(sym) + '</svg>';
  }

  var DIRS = { 0: 'rechts', 45: 'rechts unten', 90: 'unten', 135: 'links unten', 180: 'links', 225: 'links oben', 270: 'oben', 315: 'rechts oben' };
  function describe(sym) {
    var m = /^([LE])(\d+)$/.exec(sym);
    if (!m) return sym;
    return (m[1] === 'L' ? 'Landolt-Ring, Öffnung ' : 'E, Öffnung ') + DIRS[+m[2]];
  }

  /** Sehzeichenhöhe (mm) für Entfernung (m) und Visus. */
  function sizeMm(distanceM, visus) {
    return distanceM * 1000 * Math.tan(FIVE_ARCMIN / visus);
  }

  function logMAR(v) { return -Math.log10(v); }

  function fmtVisus(v) {
    var s = (Number.isInteger(v) ? v.toFixed(1) : String(v));
    return s.replace('.', ',');
  }
  function fmtNum(x, digits) {
    return x.toFixed(digits).replace('.', ',');
  }
  function fmtDpt(x) {
    var s = Math.abs(x).toFixed(2).replace('.', ',');
    return (x < 0 ? '−' : (x > 0 ? '+' : '±')) + s + ' dpt';
  }

  /** Korrektur der in Entfernung d gefundenen Refraktion auf Unendlich (Akkommodationsbedarf 1/d). */
  function infinityCorrection(distanceM) {
    var exact = -1 / distanceM;
    var rounded = Math.round(exact * 4) / 4;
    return { exact: exact, rounded: rounded };
  }

  function pool(mode, extDigits) {
    if (mode === 'letters') return LETTERS.slice();
    if (mode === 'landolt') return LANDOLT.slice();
    if (mode === 'e') return TUMBLING_E.slice();
    return extDigits ? DIGITS.concat(DIGITS_EXT) : DIGITS.slice();
  }

  function rnd(n) {
    if (global.crypto && global.crypto.getRandomValues) {
      var a = new Uint32Array(1); global.crypto.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /** Neue Reihe mit n Zeichen: ohne Wiederholung, wenn der Vorrat reicht; sonst keine direkten Nachbarn gleich. */
  function makeRow(mode, n, extDigits, prev) {
    var p = pool(mode, extDigits);
    var row, tries = 0;
    do {
      row = [];
      var avail = p.slice();
      for (var i = 0; i < n; i++) {
        if (avail.length === 0) {
          avail = p.filter(function (s) { return s !== row[row.length - 1]; });
        }
        var idx = rnd(avail.length);
        row.push(avail[idx]);
        avail.splice(idx, 1);
      }
      tries++;
    } while (prev && prev.length === n && row.join('') === prev.join('') && tries < 20 && p.length > 1);
    return row;
  }

  /** Mindestzahl richtiger Antworten (≥ 60 %, DIN 58220) */
  function passThreshold(n) { return Math.ceil(n * 0.6); }

  global.Opto = {
    STEPS: STEPS, LETTERS: LETTERS, DIGITS: DIGITS, DIGITS_EXT: DIGITS_EXT,
    svg: svg, describe: describe, sizeMm: sizeMm, logMAR: logMAR,
    fmtVisus: fmtVisus, fmtNum: fmtNum, fmtDpt: fmtDpt,
    infinityCorrection: infinityCorrection, makeRow: makeRow, pool: pool,
    passThreshold: passThreshold
  };
})(window);
