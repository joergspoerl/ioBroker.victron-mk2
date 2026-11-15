# Funktionsabdeckung: ioBroker.victron-mk2 v0.1.0

Stand: 2026-11-15 · Quelle: `joergspoerl/ioBroker.victron-mk2`, Branch
`fix/audit-2026-11-15` · Protokoll: Victron MK2 Protocol 3.14 · Live-Hardware:
MultiPlus 12 V (16-A-Transfer), pi4, `/dev/ttyUSB-Serial-1`.

## Legende

- **OK** = protokoll- und codegeprüft, keine Änderung nötig.
- **FIX** = im Audit korrigiert.
- **UNIT** = durch Unit-/Mock-Test abgedeckt.
- **LIVE** = am echten MultiPlus validiert (2026-11-15, AC-Ausgang isoliert).
- **N/A** = bewusst nicht auf Hardware getestet (siehe Bemerkung).

## 1. Lese-Funktionen

| Funktion | Protokoll | Model-/State-Ausgabe | Status | Test |
|---|---|---|---|---|
| `poll()` | A, W 0x0E, F 0x00/0x01/0x05, W 0x31 0x00/0x04 | alle Modell-States | OK | UNIT + LIVE |
| `pollStateOnly()` | A, W 0x0E | `state.state` | OK (für Startup-Gate) | UNIT + LIVE |
| `address()` | A 0x01 0x00 | keine | FIX: Längenvalidierung generisch (>= 4) | UNIT + LIVE |
| `led_status()` | L | `led.*` (ON/BLINK/BLINK_ANTI/OFF) | FIX: Längenvalidierung >= 5 statt exakt 8 | UNIT + LIVE |
| `get_state()` | W 0x0E 0x00 0x00 | `state.state` (00–98) | FIX: 0x94-Response validieren | UNIT + LIVE |
| `master_multi_led_info()` | F 0x05 | `assist.minlimit/maxlimit/limit`, `switch.*` | OK (Offsets/Bits korrekt) | UNIT + LIVE |
| `dc_info()` | F 0x00 | `dc_info.ubat/ibat/icharge` | FIX: bufferpack-Array `[0]` verwenden, `/10` entfernt, unsigned 24-bit, Phase-Info statt Reserved-Marker | UNIT + LIVE |
| `ac_info()` | F 0x01 | `ac_info.umains/imains/uinv/iinv/fmains/phase_info/state` | FIX: Phase-Info statt BF-Faktor-Marker; `ac_info.state` als Rohwert dokumentiert; `fmains` 1 Byte (bewusst, siehe unten) | UNIT + LIVE |
| `loadScalingsIfNeeded()` | W 0x36 für 0,1,2,3,4,6,7,8 | `calc.*` | FIX: `finv_calc`/`fmains_calc` in die Cache-Bedingung aufgenommen | UNIT |
| `get_setting_IBatBulk()` | W 0x31 0x04 0x00 | `setting.IBatBulk` | OK | UNIT + LIVE |
| `get_flags()` | W 0x31 0x00 0x00 | `setting.flag.*` | OK (Bit-Zuordnung korrekt) | UNIT + LIVE |

### Anmerkungen zu `ac_info`

- `ac_info.state` lieferte beim Test den Rohwert **70** (`0x46`), der nicht in die
  0–9-Tabelle passt. Der verlässliche Hauptstate ist `state.state` (aus W 0x0E).
  Das Objekt `ac_info.state` ist jetzt ausdrücklich als **Rohwert** gekennzeichnet
  und hat keine falsche State-Tabelle mehr.
- `fmains` wird als **1 Byte** gelesen; das ist für diese Firmware korrekt
  (50,1 Hz). Die Protokolltabelle nennt ein 2-Byte-Feld; das ist ein
  dokumentierter Unterschied, kein versehentlicher Bug.

## 2. Schreib-Funktionen

| Funktion | Protokoll | Status | Test |
|---|---|---|---|
| `set_assist(ampere)` | S, Switch State = aktueller Zustand, Limit = A×10 | FIX: Switch-State nicht mehr hardcodiert; negative/NaN abgelehnt; auf `assist.maxlimit` geklemmt; S-Response validiert; 0 A als Solar-/Inverter-Modus erlaubt | UNIT + LIVE |
| `set_switch_state(state)` | S, Limit = 0xFFFF (ignore) | NEU: 1–4, Response validiert | UNIT + LIVE (2 und 3) |
| `set_grid_mode(mode)` | 0 = Grid (max, On), 1 = Zero grid (0 A, On), 2 = Inverter only (State 2 + 0 A) | NEU; auf echter Hardware getestet | UNIT + LIVE |
| `force_state(state)` | W 0x0E, 1/2/3 = Equalise/Absorption/Float | FIX: 0x94-Response validiert; kein On/Off-Modus | UNIT (bewusst kein Live-Test, siehe unten) |
| `set_flagDisableCharge(value)` | W 0x31 lesen, Bit 6 setzen/löschen, W 0x33/0x34 schreiben | FIX: verschachtelter `communicate`-Deadlock entfernt (readFlags0/writeFlags0), 0x88-Response validiert | UNIT + LIVE (Same-Value) |
| `set_flagWeakACInput(value)` | W 0x31 lesen, Bit 14 setzen/löschen, W 0x33/0x34 schreiben | FIX: gleicher Deadlock entfernt; `console.log`-Spam entfernt; 0x88 validiert | UNIT + LIVE (Same-Value) |
| `set_setting_IBatBulk(value)` | W 0x33 0x04 + W 0x34 | FIX: Guard `value < 0 || value > 120` (vorher immer falsch), High-Byte korrekt, 0x88 validiert | UNIT + LIVE (Same-Value 120) |

### Nicht auf Hardware getestet (bewusst)

- `force_state(1/2/3)` – erzwingt Equalise/Absorption/Float und verändert den
  Ladezustand der Batterie. Nur Unit-getestet; ein Live-Test sollte nur mit
  ausdrücklicher Absicht und Batterie-Kenntnis erfolgen.
- `set_switch_state(1)` (Charger only) und `set_switch_state(4)` (Off) –
  protokollvalidiert, aber nicht auf Hardware umgeschaltet, weil das den
  Betriebsmodus verändert. `2` (Inverter only) und `3` (On) sind live getestet.

## 3. Modell-States

| Gruppe | Status |
|---|---|
| `dc_info.ubat/ibat/icharge` | FIX (siehe dc_info) |
| `ac_info.umains/imains/uinv/iinv/fmains/phase_info` | OK; `fmains` 1 Byte ist korrekt für diese Firmware |
| `ac_info.state` | FIX: als Rohwert gekennzeichnet, keine falsche 0–9-Tabelle |
| `assist.minlimit/maxlimit/limit` | OK; Readback nach Write funktioniert |
| `switch.DirectRemoteSwitchCharge/Invert`, `FrontSwitchUp/Down`, `SwitchCharge`, `SwitchInvert`, `OnboardRemoteInvertSwitch`, `RemoteGeneratorSelected` | OK; Bit-Zuordnung gemäß §6.2 |
| `state.state` | OK; Encoding 00–98 geprüft |
| `led.*` | OK; ON/BLINK/BLINK_ANTI/OFF geprüft |
| `setting.flag.*` | OK; Bit-Mapping geprüft |
| `setting.IBatBulk` | OK |
| `control.set_assist` | FIX: Beschreibung, min=0, max/def aus Device-Maximum |
| `control.switch_state`, `control.grid_mode` | NEU |
| `control.force_state`, `control.IBatBulk`, `control.DisableCharge`, `control.WeakACInput` | FIX (siehe Schreib-Funktionen) |

## 4. Entfernte/unbenutzte Funktionen

| Element | Disposition |
|---|---|
| `get_power_charger`, `get_power_inverter`, `get_power_output` (auskommentiert) | **Entfernt**: nicht von dieser Firmware unterstützt; kein produktiver Nutzen. |
| `power_output_calc_load` (auskommentiert) | **Entfernt** (zugehöriger Power-Output-Code). |
| `src/lib/tools.ts` (`isObject`, `isArray`, `translateText`, Yandex/Google) | **Entfernt**: vom Template übrig, im Adapter unbenutzt. Damit entfällt auch die `axios`-Dev-Dependency. |
| `testVariable` | **Entfernt** (Template-Rest). |
| `src/prototyping/victron_mk2.js`, `test.js` | Bleiben als Referenz/Attic, sind aber nicht Teil des Builds und werden nicht verwendet. |

## 5. Adapter-/Infrastruktur-Funktionen

| Bereich | Status |
|---|---|
| `onReady`/Config | FIX: `interval`/`portPath` validiert; kein Throw bei leerem Port, sondern Log + kein Polling |
| `mainLoop`/`updateStates` | FIX: Startup-Gate mit `pollStateOnly` + `isStableState`; keine Control-Writes bei 10/20 |
| `onStateChange` | FIX: Ack-Präzedenz; nur unacknowledged numerische Control-Writes |
| `processToSendQueue` | FIX: Retry mit Max-Attempts, kein TypeError, kein Spin-Loop |
| `initObjects` | FIX: Modellrollen, `min/max/def` für `control.set_assist`, keine doppelten Objektaufrufe |
| `onUnload` | FIX: Port wird geschlossen |
| `serialWrapper` | FIX: Lazy-Import, Serialport 9.x + 10+/12 Konstruktor, Error/Close-Handler, sauberes `close()` |
| `receiveFrame`/`communicate` | FIX: vollständige Frames, Timeout, Checksumme, Fehlerpropagation |
| `sync`/`ensureSynced` | FIX: nur einmal pro Verbindung, Re-Sync nach Reconnect |

## 6. Testabdeckung

- **45 TS-Tests** (Mocha + ts-node) + Paketvalidierung: **alle grün**.
- `npm run check`, `npm run lint`, `npm run build`: **grün**.
- Live-Hardware: siehe `docs/hardware-test-2026-11-15.md`.

## 7. Offen / Empfohlen

- **Echter Boot-Test mit installiertem v0.1.0:** MP neu starten, während der
  Adapter läuft, und prüfen, dass die Startup-Gate keine Control-Writes sendet,
  bis der MP stabil ist. Die Logik ist unit-getestet; der Live-Boot-Test sollte
  nach der Installation erfolgen.
- **`force_state` auf Hardware:** nur bei Bedarf und mit Batterie-/Ladewissen.
- **`set_switch_state(1)/(4)`:** nur bei geplantem Moduswechsel testen.
- **Dokumentation der 0-A-Semantik im ioBroker-Admin:** Der Objekt-Description
  ist aktualisiert; bei einem eigenen Admin-UI kann ein Hinweis ergänzt werden.
