/* Verbindung Tablet <-> Handy über WebRTC (PeerJS).
 * Das Tablet ("host") meldet sich unter der ID "sehtest-<CODE>" an, das Handy ("join")
 * verbindet sich mit dieser ID. Der Vermittlungsserver (PeerServer) wird nur zum
 * Verbindungsaufbau gebraucht; die Daten laufen danach direkt zwischen den Geräten.
 *
 * Wichtig: Ein Aussetzer zum Vermittlungsserver darf die bestehende Datenverbindung
 * NICHT zerstören – dann wird nur die Server-Verbindung erneuert (peer.reconnect()).
 */
(function (global) {
  'use strict';

  // Öffentlicher PeerJS-Cloud-Server. Eigener Server: { host: 'meinserver.de', port: 443, secure: true, path: '/' }
  var PEER_OPTIONS = { debug: 1, pingInterval: 5000 };
  var PREFIX = 'sehtest-';
  var PING_MS = 3000;
  var TIMEOUT_MS = 12000;
  // Fehlertypen, bei denen nur die Server-Verbindung betroffen ist (Datenkanal bleibt nutzbar)
  var SOFT_ERRORS = { network: 1, 'server-error': 1, 'socket-error': 1, 'socket-closed': 1, disconnected: 1 };

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

  /** Server-Verbindung eines Peers erneuern, mit wachsendem Abstand. */
  function makeReconnector(getPeer, onGiveUp) {
    var attempts = 0, timer = null;
    function schedule() {
      if (timer) return;
      var wait = Math.min(20000, 1000 * Math.pow(1.6, attempts++));
      timer = setTimeout(function () {
        timer = null;
        var p = getPeer();
        if (!p || p.destroyed) { onGiveUp && onGiveUp(); return; }
        if (p.disconnected) {
          try { p.reconnect(); } catch (e) { schedule(); }
        }
      }, wait);
    }
    return { schedule: schedule, reset: function () { attempts = 0; if (timer) { clearTimeout(timer); timer = null; } } };
  }

  /** Tablet-Seite: wartet auf Handy-Verbindungen. */
  function host(code, handlers) {
    var conns = [];
    var peer = null;
    var closed = false;
    var status = 'offline';
    var recon = makeReconnector(function () { return peer; }, function () { if (!closed) start(); });

    function setStatus(s, detail) {
      status = s;
      handlers.onStatus && handlers.onStatus(s, detail, conns.length);
    }
    function idleStatus() { return conns.length ? 'connected' : (peer && !peer.disconnected && !peer.destroyed ? 'waiting' : 'connecting'); }

    function start() {
      if (closed) return;
      if (!hasPeer()) { setStatus('error', 'PeerJS nicht geladen'); return; }
      try { peer && peer.destroy(); } catch (e) { /* ignore */ }
      recon.reset();
      setStatus('connecting');
      peer = new global.Peer(peerId(code), PEER_OPTIONS);
      peer.on('open', function () { recon.reset(); setStatus(idleStatus()); });
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
          setStatus(idleStatus());
        }
        conn.on('close', drop);
        conn.on('error', drop);
      });
      peer.on('disconnected', function () {
        // Nur Server-Verbindung weg – bestehende Handy-Verbindungen bleiben erhalten
        if (closed) return;
        setStatus(conns.length ? 'connected' : 'connecting', 'Vermittlungsserver getrennt – verbinde neu');
        recon.schedule();
      });
      peer.on('error', function (err) {
        var type = err && err.type;
        if (type === 'unavailable-id') {
          setStatus('error', 'Code bereits belegt – bitte neuen Code erzeugen');
          return;
        }
        if (SOFT_ERRORS[type]) {
          setStatus(conns.length ? 'connected' : 'connecting', 'Serververbindung: ' + type);
          recon.schedule();
          return;
        }
        if (type === 'peer-unavailable') return; // betrifft nur ausgehende Verbindungen
        setStatus('error', (err && err.message) || String(type));
        if (!closed && (!peer || peer.destroyed)) setTimeout(start, 5000);
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
        closed = true; clearInterval(timer); recon.reset();
        try { peer && peer.destroy(); } catch (e) { /* ignore */ }
      }
    };
  }

  /** Handy-Seite: verbindet sich mit dem Tablet. */
  function join(code, handlers) {
    var peer = null, conn = null, closed = false, lastSeen = 0, retry = 0, failing = false, retryTimer = null;
    var recon = makeReconnector(function () { return peer; }, function () { if (!closed) connect(); });

    function setStatus(s, detail) { handlers.onStatus && handlers.onStatus(s, detail); }
    function isOpen() { return !!(conn && conn.open); }

    function connect() {
      if (closed) return;
      if (!hasPeer()) { setStatus('error', 'PeerJS nicht geladen'); return; }
      try { peer && peer.destroy(); } catch (e) { /* ignore */ }
      conn = null; recon.reset();
      setStatus('connecting');
      peer = new global.Peer(PEER_OPTIONS);
      peer.on('open', function () {
        recon.reset();
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
      peer.on('disconnected', function () {
        if (closed) return;
        // Datenkanal läuft weiter; Server-Verbindung leise erneuern
        if (isOpen()) recon.schedule(); else fail('Vermittlungsserver getrennt');
      });
      peer.on('error', function (err) {
        var type = err && err.type;
        if (type === 'peer-unavailable') { fail('Kein Tablet mit diesem Code online'); return; }
        if (SOFT_ERRORS[type]) { if (isOpen()) { recon.schedule(); return; } fail('Netzwerk: ' + type); return; }
        fail((err && err.message) || String(type));
      });
    }

    function fail(msg) {
      if (closed || failing) return;
      failing = true;
      setStatus('disconnected', msg);
      retry++;
      var wait = Math.min(15000, 1500 * retry);
      retryTimer = setTimeout(function () { failing = false; retryTimer = null; connect(); }, wait);
    }

    function safeSend(obj) {
      try { if (isOpen()) conn.send(obj); } catch (e) { /* ignore */ }
    }

    /** Sofortige Prüfung, z. B. wenn die Seite wieder in den Vordergrund kommt. */
    function check() {
      if (closed) return;
      if (!isOpen()) {
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; failing = false; retry = 0; connect(); }
        return;
      }
      if (Date.now() - lastSeen > TIMEOUT_MS) { try { conn.close(); } catch (e) { /* ignore */ } fail('Keine Antwort vom Tablet'); }
      else safeSend({ t: 'ping' });
      if (peer && peer.disconnected) recon.schedule();
    }

    var timer = setInterval(check, PING_MS);

    connect();

    return {
      send: safeSend,
      check: check,
      isOpen: isOpen,
      reconnect: function () { retry = 0; failing = false; if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; } connect(); },
      close: function () { closed = true; clearInterval(timer); recon.reset(); if (retryTimer) clearTimeout(retryTimer); try { peer && peer.destroy(); } catch (e) { /* ignore */ } }
    };
  }

  global.Link = { host: host, join: join, randomCode: randomCode, peerId: peerId, hasPeer: hasPeer };
})(window);
