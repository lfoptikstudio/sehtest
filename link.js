/* Verbindung Tablet <-> Handy über WebRTC (PeerJS).
 * Das Tablet ("host") meldet sich unter der ID "sehtest-<CODE>" an, das Handy ("join")
 * verbindet sich mit dieser ID. Der Vermittlungsserver (PeerServer) wird nur zum
 * Verbindungsaufbau gebraucht; die Daten laufen danach direkt zwischen den Geräten.
 */
(function (global) {
  'use strict';

  // Öffentlicher PeerJS-Cloud-Server. Eigener Server: { host: 'meinserver.de', port: 443, secure: true, path: '/' }
  var PEER_OPTIONS = { debug: 1 };
  var PREFIX = 'sehtest-';
  var PING_MS = 4000;
  var TIMEOUT_MS = 12000;

  function peerId(code) { return PREFIX + String(code).trim().toUpperCase(); }

  function randomCode(len) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne I, O, 0, 1 (Verwechslungsgefahr)
    var out = '';
    var a = new Uint32Array(len);
    if (global.crypto && global.crypto.getRandomValues) global.crypto.getRandomValues(a);
    else for (var i = 0; i < len; i++) a[i] = Math.floor(Math.random() * 1e9);
    for (var j = 0; j < len; j++) out += chars[a[j] % chars.length];
    return out;
  }

  function hasPeer() { return typeof global.Peer === 'function'; }

  /** Tablet-Seite: wartet auf Handy-Verbindungen. */
  function host(code, handlers) {
    var conns = [];
    var peer = null;
    var closed = false;
    var status = 'offline';

    function setStatus(s, detail) {
      status = s;
      handlers.onStatus && handlers.onStatus(s, detail, conns.length);
    }

    function start() {
      if (closed) return;
      if (!hasPeer()) { setStatus('error', 'PeerJS nicht geladen'); return; }
      try { peer && peer.destroy(); } catch (e) { /* ignore */ }
      setStatus('connecting');
      peer = new global.Peer(peerId(code), PEER_OPTIONS);
      peer.on('open', function () { setStatus(conns.length ? 'connected' : 'waiting'); });
      peer.on('connection', function (conn) {
        conn.on('open', function () {
          conns.push(conn);
          conn._lastSeen = Date.now();
          setStatus('connected');
          handlers.onOpen && handlers.onOpen(conn);
        });
        conn.on('data', function (d) {
          conn._lastSeen = Date.now();
          if (d && d.t === 'ping') { safeSend(conn, { t: 'pong' }); return; }
          if (d && d.t === 'pong') return;
          handlers.onData && handlers.onData(d, conn);
        });
        function drop() {
          var i = conns.indexOf(conn);
          if (i >= 0) conns.splice(i, 1);
          setStatus(conns.length ? 'connected' : (peer && !peer.disconnected ? 'waiting' : 'offline'));
        }
        conn.on('close', drop);
        conn.on('error', drop);
      });
      peer.on('disconnected', function () {
        setStatus('connecting', 'Verbindung zum Vermittlungsserver unterbrochen');
        if (!closed) setTimeout(function () { try { peer.reconnect(); } catch (e) { start(); } }, 1500);
      });
      peer.on('error', function (err) {
        var type = err && err.type;
        if (type === 'unavailable-id') {
          setStatus('error', 'Code bereits belegt – bitte neuen Code erzeugen');
          return;
        }
        setStatus('error', (err && err.message) || String(type));
        if (!closed) setTimeout(start, 4000);
      });
    }

    function safeSend(conn, obj) {
      try { if (conn.open) conn.send(obj); } catch (e) { /* ignore */ }
    }

    // Tote Verbindungen erkennen (z. B. Handy im Standby)
    var timer = setInterval(function () {
      var now = Date.now();
      conns.slice().forEach(function (c) {
        if (now - c._lastSeen > TIMEOUT_MS) { try { c.close(); } catch (e) { /* ignore */ } }
        else safeSend(c, { t: 'ping' });
      });
    }, PING_MS);

    start();

    return {
      send: function (obj) { conns.forEach(function (c) { safeSend(c, obj); }); },
      sendTo: function (conn, obj) { safeSend(conn, obj); },
      count: function () { return conns.length; },
      status: function () { return status; },
      restart: start,
      close: function () {
        closed = true; clearInterval(timer);
        try { peer && peer.destroy(); } catch (e) { /* ignore */ }
      }
    };
  }

  /** Handy-Seite: verbindet sich mit dem Tablet. */
  function join(code, handlers) {
    var peer = null, conn = null, closed = false, lastSeen = 0, retry = 0;

    function setStatus(s, detail) { handlers.onStatus && handlers.onStatus(s, detail); }

    function connect() {
      if (closed) return;
      if (!hasPeer()) { setStatus('error', 'PeerJS nicht geladen'); return; }
      try { peer && peer.destroy(); } catch (e) { /* ignore */ }
      setStatus('connecting');
      peer = new global.Peer(PEER_OPTIONS);
      peer.on('open', function () {
        conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
        var opened = false;
        var openTimer = setTimeout(function () { if (!opened) fail('Tablet nicht erreichbar (Code prüfen, Tablet-App geöffnet?)'); }, 10000);
        conn.on('open', function () {
          opened = true; clearTimeout(openTimer); retry = 0; lastSeen = Date.now();
          setStatus('connected');
          handlers.onOpen && handlers.onOpen();
        });
        conn.on('data', function (d) {
          lastSeen = Date.now();
          if (d && d.t === 'ping') { safeSend({ t: 'pong' }); return; }
          if (d && d.t === 'pong') return;
          handlers.onData && handlers.onData(d);
        });
        conn.on('close', function () { fail('Verbindung getrennt'); });
        conn.on('error', function (e) { fail(e && e.message); });
      });
      peer.on('error', function (err) {
        var type = err && err.type;
        if (type === 'peer-unavailable') fail('Kein Tablet mit diesem Code online');
        else fail((err && err.message) || String(type));
      });
    }

    var failing = false;
    function fail(msg) {
      if (closed || failing) return;
      failing = true;
      setStatus('disconnected', msg);
      retry++;
      var wait = Math.min(15000, 1500 * retry);
      setTimeout(function () { failing = false; connect(); }, wait);
    }

    function safeSend(obj) {
      try { if (conn && conn.open) conn.send(obj); } catch (e) { /* ignore */ }
    }

    var timer = setInterval(function () {
      if (!conn || !conn.open) return;
      if (Date.now() - lastSeen > TIMEOUT_MS) { try { conn.close(); } catch (e) { /* ignore */ } fail('Keine Antwort vom Tablet'); }
      else safeSend({ t: 'ping' });
    }, PING_MS);

    connect();

    return {
      send: safeSend,
      reconnect: function () { retry = 0; failing = false; connect(); },
      close: function () { closed = true; clearInterval(timer); try { peer && peer.destroy(); } catch (e) { /* ignore */ } }
    };
  }

  global.Link = { host: host, join: join, randomCode: randomCode, peerId: peerId, hasPeer: hasPeer };
})(window);
