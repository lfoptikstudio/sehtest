/* Handy-Fernbedienung: verbindet sich mit dem Tablet, zeigt dessen Zustand, sendet Aktionen. */
(function (global) {
  'use strict';
  var LS = 'sehtest.remote.code';
  var link = null;
  var state = null;

  function $(id) { return document.getElementById(id); }
  var els = {};

  function setConn(s, detail) {
    els.conn.className = 'conn ' + s;
    var txt = { connecting: 'verbinde …', connected: 'verbunden', disconnected: 'getrennt', error: 'Fehler' }[s] || s;
    els.connText.textContent = txt;
    els.connectMsg.textContent = detail || (s === 'connecting' ? 'Verbindung wird aufgebaut …' : '');
    if (s === 'connected') { els.connectCard.hidden = true; els.controls.hidden = false; }
    else if (s === 'disconnected' || s === 'error') { els.connectCard.hidden = false; }
  }

  function dispatch(action) {
    if (link) link.send({ t: 'action', action: action });
    // Optimistische Anzeige für Markierungen (Antwort vom Tablet überschreibt)
    if (state && action.name === 'toggleWrong' && state.wrong) {
      state.wrong[action.index] = !state.wrong[action.index];
      Controls.render(els.controls, state, dispatch);
    }
  }

  function connect(code) {
    code = String(code || '').trim().toUpperCase();
    if (code.length < 4) { els.connectMsg.textContent = 'Bitte den Code vom Tablet eingeben.'; return; }
    try { localStorage.setItem(LS, code); } catch (e) { /* ignore */ }
    els.codeInput.value = code;
    if (link) link.close();
    setConn('connecting');
    link = Link.join(code, {
      onStatus: setConn,
      onOpen: function () { link.send({ t: 'hello' }); },
      onData: function (d) {
        if (d && d.t === 'state') {
          state = d.state;
          Controls.render(els.controls, state, dispatch);
        }
      }
    });
  }

  function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    navigator.wakeLock.request('screen').catch(function () { /* ignore */ });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ['conn', 'connText', 'connectCard', 'codeInput', 'connectBtn', 'connectMsg', 'controls'].forEach(function (id) { els[id] = $(id); });
    Controls.bind(els.controls, dispatch, function () { return state; });

    var params = new URLSearchParams(location.search);
    var code = params.get('c') || params.get('code');
    if (!code) { try { code = localStorage.getItem(LS); } catch (e) { /* ignore */ } }
    if (code) els.codeInput.value = code;

    els.connectBtn.addEventListener('click', function () { connect(els.codeInput.value); requestWakeLock(); });
    els.codeInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { connect(els.codeInput.value); requestWakeLock(); } });

    if (code) connect(code);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { requestWakeLock(); if (link) link.reconnect(); }
    });
    // Erstes Antippen: Bildschirm wach halten
    document.addEventListener('touchend', requestWakeLock, { once: true });
  });
})(window);
