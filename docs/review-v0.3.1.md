# Review: ioBroker.victron-mk2 v0.3.1 (fachlich, technisch, Prozess)

Stand: 2026-11-15 · Code: `master` (`e6ff5ab`) · Geprüft: gesamtes Repo, Live-Betrieb
auf pi4, MultiPlus 1909140 (alte MCU), OPzV 800 Ah, BMV-602S.

## 1. Fachliche Bewertung

### Tragfähigkeit für die Anlage

Der Adapter bildet den Betrieb eines einzelnen MultiPlus korrekt und sicher ab:
Netz-/Inverterbetrieb, Eingangsstromlimit, Ladezustände inkl. Sub-Phase,
DC-/AC-Werte, LEDs, Geräte-Flags und die wichtigsten Einstellungen. Die
Regelung `control.charger_level` (SOC-Schwellen) kann damit vollständig und
nachvollziehbar arbeiten.

**Stark fachlich:**
- **0 A ist als Modus verstanden und dokumentiert** (PowerAssist an → Invert),
  mit explizitem `grid_mode` statt implizitem Nebeneffekt.
- **Kein implizites Einschalten** bei Off, kein erzwungenes „On“ mehr beim
  Limit-Schreiben; das Gerät ist beim Schalterzustand maßgeblich.
- **Startup-Gate**: keine Control-Writes während des Boots – die eigentliche
  Vorfallursache ist damit strukturell behoben.
- **Readback nach jedem Write** und klare Fehler statt stiller Annahmen.
- **Firmware-Bewusstsein**: `ac_info.state` wird auf Firmware < 207 nicht mehr
  als Zustand verkauft; `power.*` bleiben `null`, statt erfundene Watt-Werte.

### Fachliche Risiken und offene Punkte

| # | Befund | Bewertung / Empfehlung |
|---|---|---|
| F1 | **EEPROM-Schreiben sind verschleißbehaftet.** `IBatBulk`, Flags und Ladespannungen gehen in die Geräte-Konfiguration. Eine Automatik, die zyklisch schreibt, kann das EEPROM über Jahre stressen. | Dokumentieren: nur bei Änderung schreiben; optional Schutz im Adapter (gleicher Wert → kein Write). |
| F2 | **`force_state = 1` (Equalise)** lädt 1 h mit 1/2/4 V über Absorption bei ¼ Strom. Auf OPzV ist das ein legitimes, aber bewusstes Wartungsfeature. | In der Doku als Wartungsaktion kennzeichnen, nicht als „Modus“. Bereits teilweise geschehen; kein Live-Test, das ist richtig so. |
| F3 | **`battery.soc` = 0 %** auf diesem Gerät (interner Monitor ungepflegt). Ein Nutzer kann das mit dem echten SOC verwechseln. | Description sollte ausdrücklich sagen „interner MultiPlus-Monitor, **nicht** der BMV“. |
| F4 | **Keine echten Watt-Werte** auf Firmware 140. `U × I` wäre VA, nicht W. | Nicht als Leistung in W ausgeben. Wenn Watt gebraucht werden: Firmware 2xx (siehe Runbook „Firmware-Update“) oder externe Messtelle. |
| F5 | `assist.limit` zeigt nach 0 A den Geräte-Mindestwert (3,1 A). | Bereits dokumentiert; für Laien überraschend, gehört in die Admin-Beschreibung. |
| F6 | **Ladespannungen sind jetzt schreibbar** (`UBatAbsorption/Float`). Damit kann eine Automatik die OPzV-Bank dauerhaft falsch laden. | In README/Runbook die Zielwerte (14,20/13,40 V) und den Hinweis „nur mit Batterie-Kenntnis“ festhalten. |
| F7 | `interval < 3 s` bedeutet faktisch Dauer-Polling, weil ein voller Poll ~1,5–2,5 s braucht. | Hinweis in der Config-Doku; kein Code-Problem (Loop ist sequenziell). |

### Bedienbarkeit

Die Trennung `control.*` (schreiben) vs. `setting.*`/`info.*` (lesen) ist sauber.
Die Alarmierung über den unabhängigen Watchdog deckt Adapter-Ausfall, Boot-Loop
und LED-Alarme ab. **Lücken bleiben:** kein konfigurierter Notify-Kanal
(Telegram/Mail/ntfy), kein Grafana-Alert; die Alarme stehen aktuell nur im
Journal und in `status.json`.

## 2. Prozess, Packaging, Betrieb

| # | Befund | Schwere | Empfehlung |
|---|---|---|---|
| P1 | **CI läuft nie.** `.github/workflows/test-and-release.yml` triggert auf `branches: ["main"]`, der Default-Branch heißt **master**; die Repo-API zeigt **0 Runs**. Node-Matrix ist 12/14/16. | hoch | Auf `master` umstellen, Node 18/20/22, `npm ci && npm run check && lint && test && build`. |
| P2 | **Deployment ist ein manueller tar-Tausch** im Container. Nicht reproduzierbar durch Dritte, fehleranfällig (heute ist dabei das adapter-lokale `node_modules` verloren gegangen und serialport fiel auf die hoisierte Version 12 zurück). | hoch | Deploy-Skript `scripts/deploy-pi4.sh` mit Backup, Abhängigkeits-Erhalt und Verifikation; oder offizieller Weg über `iobroker url <github-tarball>`/npm-Release. |
| P3 | `responseTimeout` ist nur per JSON-Config erreichbar; die Admin-UI kennt nur `portPath` und `interval`. | niedrig | Feld in `admin/index_m.html` ergänzen. |
| P4 | `io-package.json` trägt noch Template-Keywords („template“, „Smart Home“) und automatisch generierte Descriptions in zehn Sprachen. | niedrig | Keywords: `victron`, `ve.bus`, `mk2`, `inverter`, `charger`, `energy`. |
| P5 | `@types/serialport` liegt in `dependencies` statt `devDependencies`. | niedrig | Verschieben; produktiv unnötig. |
| P6 | serialport 9.2.8 (2021) ist die produktive Abhängigkeit, obwohl der Wrapper 10+/12 unterstützt. | mittel | Bewusst so lassen oder auf 12 heben – aber nur mit Live-Test; nie unbeabsichtigt durch hoisierte Pakete driftend lassen (siehe P2). |

## 3. Technische Befunde

Siehe Abschnitt 4: 17 Befunde (3 hoch, 8 mittel, 6 niedrig) mit Datei:Zeile,
dazu Testlücken und die empfohlene Reihenfolge der Behebung in Abschnitt 6.

## 4. Unabhängige Code-Review (technisch)

Zweite, unabhängige Review des Stands `e6ff5ab` (read-only, keine Hardware).
Der schwerste Befund wurde zusätzlich von mir am kompilierten Code reproduziert:
`set_assist(6553.6)` und `set_assist(1e308)` senden beide **0 A**.

### Hoch

| # | Ort | Befund |
|---|---|---|
| T1 | `mk2Protocol.ts:556-573` | **`set_assist` bricht ohne bekanntes Maximum Werte modulo 65536 um.** `6553,6` und `1e308` werden zu 0 A – also ungewollt Zero-Grid/Inverter. Raw ≥ 0x8000 bedeutet außerdem „Limit ignorieren“. Nötig: Raw-Bereich `0..0x7fff` strikt prüfen und ohne bekanntes Maximum nicht großzügig klemmen. |
| T2 | `mk2Connection.ts:185-195`, `mk2Protocol.ts:688-700` | **Unvollständige Setting-Metadaten werden als Erfolg gecacht.** `allowQuietEnd` akzeptiert eine Antwort nach einem einzigen Frame; fehlende Min/Max werden dann durch den weiten Fallback `0..0xffff` ersetzt und autorisieren Writes. Nötig: Quiet-End nur beim expliziten `Sc = 0`; unvollständige Metadaten verwerfen und Writes damit ablehnen. |
| T3 | `serialWrapper.ts:21-26` | **Fehler beim dynamischen `import("serialport")` lassen `open()` für immer pending** und erzeugen eine unhandled Rejection. Der Poll würde ohne `info.connection = false` hängen. Nötig: `async open()` mit `try/catch`, Importfehler propagieren. |

### Mittel

| # | Ort | Befund |
|---|---|---|
| T4 | `main.ts:88-106` | **Startup/Off werden nie publiziert.** Das frühe `return` verhindert die Publikation von `state.state` – damit sieht auch der Watchdog einen Boot-Loop nicht. State/Verbindung vor dem Gate publizieren. |
| T5 | `main.ts:95-96` | Controls laufen **vor** dem aktuellen F5-Switch-Readback; eine manuelle Schalteränderung seit dem letzten Poll kann überschrieben werden. Switch-Register bei nicht leerer Queue zuerst aktualisieren. |
| T6 | `mk2Protocol.ts:81-106` | `optionalStep` fängt auch Transportfehler; danach kann `poll()` trotz geschlossenem Port `info.connection = true` setzen. Nur „unsupported“ optional behandeln, Transportfehler propagieren. |
| T7 | `send-queue.ts`, `main.ts` | **Controls werden nie `ack = true` gesetzt**; Readback-Mismatch gilt als Erfolg. Nach verifiziertem Readback mit Istwert quittieren, Mismatch als Fehler. |
| T8 | `main.ts:98-105` | **`valueOld` wird nirgends gesetzt** – jede Poll schreibt alle States erneut, auch unveränderte. Nach erfolgreicher Publikation setzen. |
| T9 | `main.ts:66-70` | `setObjectNotExistsAsync` übernimmt **bei Upgrades keine geänderten Objektdefinitionen**; `control.set_assist` bleibt statisch auf max/def 16. Migration per `extendObjectAsync`, Gerätegrenzen nach Discovery nachziehen. |
| T10 | `mk2Connection.ts:108-135` | Mein neuer Sync-Scanner: **ein unvollständiger falscher Kandidat verdeckt einen späteren gültigen Frame**. Weiterscannen, statt sofort zurückzukehren. |
| T11 | `mk2Protocol.ts:937-949` | Flags1-Read-modify-write ersetzt einen fehlgeschlagenen Read durch `?? 0` und kann dadurch **alle übrigen Flags1-Bits löschen**. Bei `null` abbrechen. |

### Niedrig

| # | Ort | Befund |
|---|---|---|
| T12 | `main.ts:56-79` | Unload wartet die laufende Iteration nicht ab; der Port kann während eines Writes geschlossen werden. Loop-Promise awaiten. |
| T13 | `mk2Connection.ts:55-58` | `busy` ist wegen des `await` dazwischen **kein Mutex**. Promise-Queue verwenden. |
| T14 | `mk2Ram.ts`, Parser | Bitfeld-Erkennung vergleicht signed `-32768` mit `0x8000` → über den realen Parser nie true. `(offset & 0xffff)` verwenden. |
| T15 | `mk2Protocol.ts` | „Per connection“-Caches (Metadaten, Skalierungen, Device-Info, Unsupported-Listen) **überleben Reconnects**. Connection-Generation einführen und Caches dann zurücksetzen. |
| T16 | Workflow, `io-package.json` | CI/Links zeigen auf `main` statt `master`; Icon/README-URLs liefern 404; Node-Matrix zu alt für die Dev-Toolchain. |
| T17 | `package.json`, `mk2Protocol.ts` | `@types/serialport` als Runtime-Dependency; acht fast identische Scaling-Loader in einer 1.040-Zeilen-Klasse; `bufferpack` ist durch Buffer-Reads ersetzbar. |

### Wesentliche Testlücken

- `src/main.test.ts` ist ein Dummy: keine Adapter-Level-Tests für Off-/Startup-
  Publikation, Control-ACKs, Objektmigration, Unload oder wiederholte Polls.
- `FakeMk2Connection.communicateMulti()` ignoriert die Quiet-End-Semantik – genau
  der kritische Fall unvollständiger Metadaten ist untestbar.
- Protokolltests umgehen `receiveFrame`; ein End-to-End-Test aus
  `Mk2Protocol + Mk2Connection + FakeMk2Serial` fehlt. Das F5-Fixture ist dabei
  längen-/checksum-inkonsistent und würde vom produktiven Receiver verworfen.
- Keine Tests für extreme Limits, parallele Kommunikation, Importfehler,
  Reconnect-Cache-Invalidierung oder RAM-Bitoffsets über den echten Parser.

### Positiv

1. Kernskalierung (unsigned 24-bit DC, signed RAM, Netto-Strom, Periode 0) ist
   sauber und getestet.
2. Der serielle Fake bildet Sized Reads und Fragmentierung realistisch ab.
3. Control-Eingänge sind eng: Whitelist, nur numerisch, nur `ack = false`.
4. Retry-Regeln sind sinnvoll (Validierung ohne Retry, transiente begrenzt).
5. Nur kuratierte Setting-IDs sind schreibbar; Read-Modify-Write erhält
   unbeteiligte Bits.

## 6. Empfohlene Reihenfolge der Behebung

1. **T1, T2, T3** (Sicherheit/Hänger) – mit neuen Unit-Tests.
2. **T4, T6, T7, T8** (Betrachtung der Anlage und ioBroker-Konventionen; T4 ist
   auch für die Alarmierung wichtig).
3. **T5, T10, T11** (Korrektheit der Writes und des Sync).
4. **T9, T12–T15** (Migration, Shutdown, Mutex, Bitfelder, Cache-Invalidierung).
5. **T16, T17** (CI/Metadaten/Maintainability) und die Prozesspunkte P1–P6.


## 5. Was ist insgesamt gut

- Protokolltreue inkl. Checksummen, Timeouts, Multi-Frame-Antworten und
  korrekter Skalierungs- und Vorzeichenregeln (Settings ≠ RAM).
- Sicherheitsmodell: Startup-Gate, kein implizites Einschalten, kuratierte
  Writes mit Support-Maske und Bereichsprüfung, Readback.
- Testkultur: 116 TS-Unit-Tests mit einer Fake, die reale Serialport-Eigenheiten
  nachbildet (sized reads, gepackte Winmon-Frames, kurze Unsupported-Antworten),
  plus Unit-Tests für den externen Watchdog.
- Dokumentation ist ungewöhnlich vollständig: Changelog, Protokoll-Audit,
  Funktionsabdeckung, Live-Testberichte, Runbook mit Zeitlinie und offenen
  Punkten.
