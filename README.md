# Sehtest für Hausbesuche (iPad + Handy-Fernbedienung)

Web-App für den Sehtest auf dem iPad im Querformat. Läuft in Safari, wird als Vollbild-App auf den
Home-Bildschirm gelegt und per Handy gesteuert. Alles schwarz auf weiß.

## Funktionen

| Bereich | Details |
|---|---|
| Sehzeichen | Zahlen (2 3 5 6 8 9, optional 4 7), Sloan-Buchstaben (C D H K N O R S V Z), Landolt-Ringe, E-Haken |
| Geometrie | 5×5-Raster, Strichstärke 1/5 der Höhe, Höhe = 5 Winkelminuten / Visus (DIN EN ISO 8596) |
| Visusstufen | logarithmische Reihe 0,05 … 2,0 (0,1-log-Schritte: 0,1 · 0,125 · 0,16 · 0,2 · 0,25 · 0,32 · 0,4 · 0,5 · 0,63 · 0,8 · 1,0 · 1,25 · 1,6 · 2,0); „0,64“ auf alten Tafeln entspricht 0,63 |
| Reihe | immer genau eine Reihe, Abstand zwischen den Zeichen = eine Zeichenbreite (ISO 8596 / ETDRS) |
| Anzahl pro Reihe | Auto (5, bei Platzmangel 3, dann 1) oder fest 5 / 3 / 1 |
| Platzmangel | Stufen, die nicht auf den Bildschirm passen, sind gesperrt; der Test beginnt bei der kleinsten darstellbaren Stufe |
| Entfernung | frei wählbar (0,5–8 m); Korrektur auf ∞ wird angezeigt (2 m → −0,50 dpt, 3 m → −0,33 ≈ −0,25 dpt, 4 m → −0,25 dpt) |
| Neu würfeln | pro Stufe jederzeit neue Zufallsreihe, keine Wiederholung eines Zeichens innerhalb der Reihe |
| Auswertung | am Handy Zeichen antippen = falsch; bestanden ab 60 % richtig (DIN 58220: 3 von 5); Ergebnis R / L / Bino speichern |
| Zusatztests | Amsler-Gitter 10 × 10 cm (30 cm Abstand, 1 Kästchen = 1°), Nahsehprobe mit Fließtext für 30 / 33 / 40 cm mit Visusangabe |
| Steuerung | Handy (WebRTC, Code + QR), Bedienfeld am Tablet (Zahnrad), Bluetooth-Tastatur |

## Dateien

```
index.html      Tablet-Anzeige (Start: Einrichtung → Sehtest)
remote.html     Handy-Fernbedienung
optotypes.js    Sehzeichen-Geometrie, Visus-Mathematik
display.js      Zustand, Größenberechnung, Amsler, Nahtest
controls.js     gemeinsames Bedienfeld (Handy und Tablet)
link.js         Verbindung Tablet ↔ Handy (PeerJS)
remote.js       Logik der Handy-Seite
app.css         Gestaltung
sw.js           Service Worker (offline-fähig)
manifest.webmanifest, icon.svg, icon-180.png, icon-512.png
vendor/         peerjs.min.js (MIT), qrcode.min.js (MIT)
```

## Adresse

- Tablet: **https://lfoptikstudio.github.io/sehtest/**
- Handy: **https://lfoptikstudio.github.io/sehtest/remote.html**

Repository: https://github.com/lfoptikstudio/sehtest (Änderungen an den Dateien hier committen und pushen, GitHub Pages aktualisiert sich nach ca. einer Minute).

## Ins Netz stellen (nur bei einem anderen Konto nötig)

Die App braucht eine **https-Adresse** (für Vollbild-App, Bildschirm-Wachhalten und die Handy-Verbindung).
Einfachster Weg: GitHub Pages, kostenlos.

1. Auf github.com anmelden, neues Repository anlegen (z. B. `sehtest`, öffentlich oder privat).
2. Alle Dateien dieses Ordners hochladen („Add file → Upload files“), inklusive Ordner `vendor`.
3. Settings → Pages → Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`, Save.
4. Nach ca. einer Minute ist die App unter `https://<benutzername>.github.io/sehtest/` erreichbar.

Alternativen: Netlify, Cloudflare Pages oder jeder Webspace (nur statische Dateien).

## iPad einrichten

1. Adresse in Safari öffnen, Teilen-Symbol → **Zum Home-Bildschirm**. Von dort starten → Vollbild ohne Browserleiste.
2. Helligkeit hoch, **True Tone und Night Shift aus**, Auto-Sperre auf „Nie“ (die App hält den Bildschirm zusätzlich wach).
3. Querformat, Tablet auf Augenhöhe des Kunden.
4. Beim ersten Start die **Kalibrierung** prüfen: Die 100-mm-Linie mit einem Lineal messen, der Rahmen muss so breit wie eine Bankkarte sein.
   Voreinstellung iPad (264 ppi) passt für iPad, iPad Air und iPad Pro; iPad mini hat 326 ppi.

## Handy einrichten

1. Am Tablet QR-Code scannen (oder `…/remote.html` öffnen) und den 6-stelligen Code eingeben.
2. Seite „Zum Home-Bildschirm“ hinzufügen. Der Code bleibt gespeichert, die Verbindung baut sich beim Öffnen automatisch auf.
3. Beide Geräte brauchen Internet nur für den **Verbindungsaufbau** (Vermittlungsserver). Praktikabel beim Hausbesuch:
   Handy-Hotspot einschalten, iPad ins Hotspot-WLAN. Danach laufen die Daten direkt zwischen den Geräten.
4. Ohne Handy: Zahnrad oben rechts am Tablet öffnet dasselbe Bedienfeld.

Tastatur (Bluetooth-Tastatur oder Presenter am iPad):
`↑ ↓` Stufe · `Leertaste` neu würfeln · `Z` Zahlen · `B` Buchstaben · `L` Landolt · `E` E-Haken ·
`T` Sehtest · `W` weißer Schirm · `A` Amsler · `N` Nahtest · `I` Infozeile · `F` Vollbild · `S` Bedienfeld

## Ablauf beim Kunden

1. Entfernung messen (Maßband), am Tablet oder Handy eintragen.
2. Ein Auge abdecken, mit einer gut lesbaren Stufe beginnen, „Kleiner“ bis zur Schwelle.
3. Falsch genannte Zeichen am Handy antippen → Anzeige „x/5 richtig“, „Stufe erkannt“ ab 3/5.
4. „Ergebnis Rechts/Links/Beide“ speichert die Stufe mit Trefferzahl, Entfernung und ∞-Korrektur.
5. Für die Ferne gilt: gefundene Korrektion **plus** angezeigten Wert (bei 2 m −0,50 dpt).

## Grenzen des 11-Zoll-iPads (Bildschirm ≈ 227 × 158 mm)

Kleinste Stufe, bei der eine Reihe mit 5 Zeichen noch passt:

| Entfernung | 5 Zeichen ab | 3 Zeichen ab | 1 Zeichen ab |
|---|---|---|---|
| 2 m | 0,16 | 0,08 | 0,05 |
| 3 m | 0,2 | 0,125 | 0,063 |
| 4 m | 0,32 | 0,16 | 0,08 |
| 5 m | 0,4 | 0,2 | 0,1 |

Für tiefe Visusstufen also 2–3 m wählen oder „Auto“ nutzen. Bei sehr kleinen Zeichen (Strichstärke unter 2 Gerätepixeln,
z. B. Visus 2,0 in 1 m) warnt die App.

Nahsehprobe: Visusangabe bezogen auf die Versalhöhe (5 Winkelminuten). Ab Visus 1,0 bei 30 cm ist die Schrift nur noch
gut 1 mm hoch (Grenze der Displayauflösung); 40 cm sind für den Nahtest günstiger.

## Normbezug

- DIN EN ISO 8596: Landolt-Ring als Normsehzeichen, 5×5-Raster, Strichstärke 1/5, Zeichenabstand ≥ eine Zeichenbreite,
  logarithmische Visusstufen, Leuchtdichte 80–320 cd/m² (iPad auf hoher Helligkeit erfüllt das).
- DIN 58220: Sehschärfebestimmung, Stufe gilt als erkannt bei ≥ 60 % richtigen Antworten.
- Sloan-Buchstaben (ETDRS) und Zahlen 2 3 5 6 8 9 als gebräuchliche, auf den Landolt-Ring kalibrierte Sätze.

Die Sehzeichen werden als Vektorgrafik exakt in Millimetern gezeichnet; die Genauigkeit hängt von der Kalibrierung ab.
Für die Verkehrsmedizin- oder Gutachten-Sehschärfe gelten zusätzliche Anforderungen (zertifizierte Geräte).
