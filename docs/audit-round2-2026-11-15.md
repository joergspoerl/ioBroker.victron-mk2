# Auditrunde 2 (DeepSeek V4.1 Flash) – Befunde und Auflösung

Stand: 2026-11-15 · Modell der Runde: `deepseek/deepseek-flash` (DeepSeek V4.1
Flash) · Ausgangscode: `master` nach v0.3.1 · Ergebnis: **18 neue Befunde**, alle
als Issues **#38–#55** angelegt und abgearbeitet; Umsetzung in **v0.3.2**.

Diese Runde war bewusst eine Gegenprobe: neues Modell, frischer Kontext, mit der
Vorgabe, die Fixes der ersten Runde zu widerlegen statt zu bestätigen. Genau das
hat mehrere echte Fehler gefunden, die die erste Runde übersehen hatte.

## Die drei kritischsten Befunde

### H1 – Das Switch-Register kam aus der Prüfsumme (Issue #38)
Der F5-Parser verlangte exakt Länge 0x0C und las `data[11]` als Switch-Register.
Bei einem solchen Frame ist das die **Prüfsumme** – das Register existiert erst ab
0x0D. Live am MultiPlus belegt: `0c 41 … 7b` (11 Datenbytes, kein Register).
Damit war die „geräteautoritative Schalterstellung" aus #7 wirkungslos, und ein
`set_assist` konnte eine aus der Prüfsumme abgeleitete Panel-Stellung schreiben.

**Auflösung:** Mindestlänge, Register nur bei Vorhandensein; ohne Register bleiben
`switch.*` = `null` und `currentSwitchState` unverändert. Zusätzlich wurde die
Fälschung längenkonform gemacht und ein **End-to-End-Test durch den echten
Receiver** eingeführt – genau der fehlende Testtyp, der den Fehler verdeckt hatte.

### H2 – Off war eine Einbahnstraße (Issue #39)
`isStableState` behandelte 20 (Off) wie Startup: keine Controls mehr, also auch
kein Wieder-Einschalten. Zudem konnten Queue-Einträge Stunden später feuern.

**Auflösung:** Gate nur noch für Down(0)/Startup(10); bei Off sind ausschließlich
`control.switch_state`/`control.grid_mode` erlaubt (explizites Einschalten), alle
anderen Writes werden verworfen und geloggt. Queue-Einträge haben jetzt eine
**TTL von 60 s**.

### M7/M1 – Fehlerklassifikation und Falschwerte (Issues #40, #41)
Die Transportfehler-Trennung aus #16 war unvollständig: `fail()` und der äußere
Timeout warfen weiterhin `Error`. Und eine nicht unterstützte Skalierung (Sc = 0)
wurde als **0 V / 0 A** publiziert – ein plausibler Falschwert in der
Batterieüberwachung.

**Auflösung:** Alle Transportfehler als `Mk2TransportError`; Sc = 0 ⇒ calc-Feld
leer, betroffene States `null` statt 0.

## Weitere Befunde und ihre Auflösung

| Issue | Befund | Auflösung |
|---|---|---|
| #42 | Exakte Längenprüfungen verwarfen verlängerte Antworten | Mindestlängen nach §3.2; End-to-End-Tests mit Extrabytes für DC/AC/State |
| #43 | LED-Antwort ohne Padding-Byte wurde abgelehnt | Länge ≥ 4 akzeptiert (§4 Fußnote b), Test mit Kurzform |
| #44 | `grid_mode = 0` schrieb den Geräte-Nennstrom statt des konfigurierten Limits und umging den Off-Schutz | Limit aus `setting.IMainsLimitAC1` (Fallback max), explizites Einschalten wird geloggt |
| #45 | Zero-Grid ohne PowerAssist wäre Bypass mit Lader aus | Ablehnung mit klarer Begründung (§5 Note 3), Warnung bei unbekanntem Flag |
| #46 | Readback-Mismatch retryte 3× ins EEPROM | `Mk2ReadbackError` (nicht retrybar); fehlendes Readback ist ebenfalls ein Fehler |
| #47 | Switch-State-Cache wurde vor der Bestätigung gesetzt | Cache/Modell erst nach bestätigter S-Antwort |
| #48 | Feste 2-s-Deadline deckelte `responseTimeout` | Deadline = max(2000, 2× responseTimeout), Test mit 2,1-s-Antwort |
| #49 | Werte unter dem Minimum wurden still quittiert | explizites Hochklemmen mit Warnung; 0 A bleibt Inverter-Modus |
| #50 | States-Map-Schlüssel `"00"` matchte nie | `"0"` + Test |
| #51 | Rollen/Initialwerte unklar | `indicator.connected`, Messwerte initial `null`, echte Switch-Beschreibungen, IBatBulk als `value.current` |
| #52 | Leerer `portPath` erzeugte keinen Zustand | Objekte werden trotzdem angelegt, `info.connection = false` |
| #53 | main-URL 404, Template-Keywords, veralteter README-Changelog | URLs/Keywords/Changelog bereinigt |
| #54 | Live-Testskript schrieb immer am Ende | Restore nur nach einem expliziten Write-Modus; read-only Lauf sendet kein S-Kommando (live verifiziert) |
| #55 | Ein defektes Setting blockierte alle anderen und lud endlos neu | Fehler pro Setting isoliert + Negativ-Cache bis zur nächsten Sync-Generation |

## Was die zweite Runde über die erste hinaus bewiesen hat

1. **Die reine Unit-Ebene reicht nicht.** Der schwerste Fehler (H1) war nur
   sichtbar, weil die Runde die F5-Bytes gegen das Protokoll legte. Seitdem gibt
   es Tests durch `Mk2Connection.receiveFrame` statt nur durch die Fake-
   Connection.
2. **Die Fakes mussten selbst korrigiert werden** (längenkonforme Frames,
   Sized-Read-Verhalten, Quiet-End/Teilantworten, echte Write-Anwendung). Eine
   zu freundliche Fälschung bestätigt sonst nur das eigene Missverständnis.
3. **Docs und Code auseinandergelaufen:** mehrere Behauptungen („Readback nur
   Warnung", „längere Responses toleriert", „Transportfehler propagiert") waren
   nachweislich falsch und wurden entweder im Code oder in der Doku korrigiert.

## Verifikation

- **165 TS-Unit-Tests + 47 Paket-/Integrationstests** grün; `tsc`, `eslint`,
  `build` sauber; CI auf `master` mit Node 22/24 erfolgreich.
- Live am MultiPlus: Bypass stabil, `info.connection = true`, `diag.timeouts = 0`
  im stationären Betrieb, Moduswechsel und Schreibtests ohne Fehler.
