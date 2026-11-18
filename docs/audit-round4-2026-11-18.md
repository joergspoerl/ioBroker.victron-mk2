# Audit-Runde 4 – Victron MK2, 2026-11-18

Arbeitsbranch: `audit-round4-2026-11-18` · Ausgangsstand: `0.3.4` (`2421b64`)

## 1. Ziel und Vorgehen

Nach einem Live-Befund (Switch-Register im erweiterten F5-Frame) wurde der
Adapter erneut vollständig geprüft:

1. **Theorie:** Quellcode, Testinfrastruktur, Frame-Layout, Skalierung,
   Steuerpfade, Lifecycle und Fehlerbehandlung.
2. **Live read-only:** Rohframes und veröffentlichte States gegen das echte
   MultiPlus (Firmware 1909209) abgeglichen.
3. **Live schreibend:** ausschließlich reversible, kleinere Änderungen
   (`set_assist`, `IMainsLimitAC1`, `grid_mode`) mit anschließender
   Wiederherstellung.
4. Erst nach diesen Runden wird eine neue Adapterversion gebaut/deployt.

## 2. Baseline und Testinfrastruktur

| Prüfung | Vorher | Nachher |
|---|---:|---:|
| TypeScript `npm run check` | **Fehler** in `src/main.test.ts` (proxyquire) | **OK** |
| `npm run lint` | OK | OK |
| `npm run test:ts` | 185 Tests, **ohne `src/main.test.ts`** | **190 Tests, inkl. Lifecycle** |
| `npm run test:package` | 47 | 47 |
| `npm run build` | OK | OK |

**Wichtiger Testbefund:** Das Skript `test:ts` verwendete
`src/**/*.test.ts` unquoted. In der Shell wurde daraus nur ein Pfadlevel; die
Datei `src/main.test.ts` (und damit alle Lifecycle-Tests) lief nie mit. Beim
expliziten Ausführen schlugen die Tests zusätzlich an zwei Stellen fehl
(proxyquire callThru, 2-s-Mocha-Timeout gegen `pollLoop.stop(3000)`).

Behoben durch:

- gequotete Globs `"src/**/*.test.ts" "src/*.test.ts"`,
- `proxyquire.noCallThru()`,
- Mocha-Timeout 5000 ms.

## 3. Befunde und Fixes

### H1 – Switch-Register im erweiterten MasterMultiLED-Frame

Live-Frame:

```text
0f 41 10 10 00 00 04 1f 00 a0 00 1f 00 00 00 67 47
```

Das Register ist `0x67` (Inverter only), wurde aber als `data[3] = 0x00`
gelesen. Folge: `switch.state=4 (Off)`, `set_assist` mit „device switch is Off“
abgelehnt, UI widersprüchlich. Behoben in `master_multi_led_info`: bei
gesetztem AC-Input-Flag (`response[3] & 0x10`) wird das Register am
Frame-Ende (`response[response[0]]`) gelesen, sonst am festen `0x0D`-Slot.
Regressionstest mit dem realen Frame; zusätzlich Test für den Fall
„zusätzliches Byte am Ende“ ohne AC-Input-Block.

### H2 – `set_grid_mode` ließ den Cache bei Fehlern falsch stehen

`currentSwitchState` wurde vor dem `set_assist`-Write auf 2 bzw. 3 gesetzt.
Scheiterte der Write, blieb der falsche Zustand im Cache und beeinflusste alle
folgenden Writes. Jetzt wird der vorherige Zustand im Fehlerfall
wiederhergestellt; Test mit simuliertem S-Frame-Fehler.

### H3 – Set-Assist-Readback und angewandter Wert

`set_assist` bestätigte bisher nur das S-Frame, ohne das tatsächliche
`assist.limit` zu prüfen. Bei Werten unterhalb des Geräteminimums oder
fehlgeschlagenem Write konnte der Command-State einen Wert anzeigen, den das
Gerät nie übernommen hatte.

Jetzt:

- nach dem S-Frame wird F5 erneut gelesen und `assist.limit` für Werte > 0
  geprüft (Toleranz 0,11 A); 0 A bleibt bewusst speziell (Gerät meldet Minimum),
- der angewandte (ggf. geklemmte) Wert wird zurückgegeben,
- `send-queue`/`main` bestätigen den angewandten Wert statt des Rohwunsches,
- Test: simulierte Nicht-Anwendung → `Mk2ReadbackError`.

### H4 – 0 A bei unbekanntem PowerAssist

0 A ist nur dann Zero-Grid, wenn PowerAssist bekannt eingeschaltet ist. Bei
`setting.flag.AssistEnabled === null` (z. B. direkt nach dem Start) wurde
bisher nur gewarnt. Jetzt wird abgelehnt mit dem Hinweis, den ersten
vollständigen Poll abzuwarten. Gilt für `set_assist(0)` und
`set_grid_mode(1)`. Tests für unbekannt/aus.

### H5 – `grid_mode` aktualisierte `control.set_assist` nicht

`grid_mode=0` schreibt intern 16 A, ließ aber `control.set_assist` auf dem
alten Wert (z. B. 0) stehen. HomePilot/VIS sahen dadurch einen falschen
Sollwert. Jetzt setzt `set_assist` den Modellwert und `main` spiegelt ihn nach
einem erfolgreichen `control.grid_mode` in den ioBroker-State. Test im
Lifecycle-Test.

### H6 – `control.set_assist` min/max/def beim Neustart

`buildStateObject` erzeugt für `control.set_assist` nur `min=0`; max/def kommen
erst nach dem ersten Poll. `objectDefinitionChanged` erkannte dadurch bei jedem
Start eine Änderung und extendete das Objekt unnötig. Jetzt werden vorhandene
max/def beim Init erhalten.

### H7 – Command- vs. Readback-Semantik in den Objektnamen

Die `control.*`-States sind Kommandoregister, keine Istwerte. Beschreibungen
wurden ergänzt (z. B. „Command: …; read back via setting.…“, switch.state,
state.substate). Das verhindert die Verwechslung, die zum Live-Befund führte.

## 4. Live read-only

Rohframes (Firmware 1909209):

```text
F5  0f 41 10 10 00 00 04 1f 00 a0 00 1f 00 00 00 67 47
L   08 ff 4c 10 00 00 00 05 00 98
F0  0f 20 71 54 c8 00 0c 96 05 00 00 00 00 00 00 88 15
F1  0f 20 01 01 00 04 08 08 5c 00 00 a8 59 fa ff c3 a2
```

Geprüft wurden unter anderem:

- `state.state/substate` gegen 0x94 (40/0),
- `switch.state` gegen die Bits (2 = Inverter only),
- `assist.min/max/limit` (3,1/16/3,1),
- LED-Bits (Inverter an, Netz/Laden aus),
- AC/DC-Skalierung, Frequenzen, Vorzeichen,
- Typen, q, unendliche Werte, Command-vs-Setting-Paare,
- Konsistenz LED ↔ Inverter-Status und Switch-Bits ↔ switch.state.

Ergebnis im Inverter-only-Zustand: **0 Auffälligkeiten**.

Nach `grid_mode=0`:

```text
state.state=80 (Bypass), switch.state=3, assist.limit=16,
led.mains=1, led.inverter=0, control.set_assist=16
```

Auch dort: **0 Auffälligkeiten** im Read-only-Check.

## 5. Live-Schreibtests (reversibel)

| Test | Ergebnis |
|---|---|
| `set_assist` 0 → 4 → 0 | `assist.limit` 3,1 → 4 → 3,1; switch 2 → 3 → 2; keine Fehler |
| `switch_state=2` (No-op) | ack; switch 2; kurzer 2→3→2-Übergang, danach stabil |
| `grid_mode=2` (No-op) | ack; switch 2 |
| `IMainsLimitAC1` 16 → 15 → 16 | `setting`/`control` 15/16, Readback, keine Fehler |
| `grid_mode=0` | state 80 (Bypass), switch 3, `assist.limit` 16, mains LED 1 |
| `set_assist` 16 → 15 → 16 (Grid) | `assist.limit` 15/16, state 80, keine Fehler |

`diag.last_control_error` blieb in allen Tests leer. Ein historischer
`diag.last_error`-Timeout (1 Zähler) stammt aus einem früheren
Debug-/Restart-Fenster; die laufenden Polls waren danach stabil.

**Noch nicht live getestet:** EEPROM-Flag-Schreibvorgänge
(`DisableCharge`, `WeakACInput`, `AssistEnabled`, `DynamicCurrentLimiter`,
`DisableAES`), `force_state`, `switch_state` mit echtem Zustandswechsel. Diese
bleiben bewusst für eine spätere, separate Abnahme.

## 6. Zweiter Reviewdurchgang (zwei unabhängige Reviews)

Nach den ersten Fixes wurden zwei unabhängige Code-Reviews durchgeführt
(Protokoll/Frame-Parsing und Control/Lifecycle). Die dabei gefundenen Punkte
wurden in derselben Runde behoben:

### P1

- **LED-Append-Bit**: `receiveFrame` gab das rohe Längenbyte zurück; bei
  gesetztem Bit 7 wurde `response[0]` als 0x8F gelesen und das Switch-Register
  fiel auf `data[3]` zurück. Jetzt wird `frame[0] &= 0x7F` nach der
  Prüfsummenprüfung.
- **F5-Heuristik**: Das Register wird nicht mehr über ein undokumentiertes
  Datenbit gewählt, sondern über die Frame-Länge und mit `state.state`
  kreuzgeprüft. Bei Widerspruch bleiben die Switch-Felder `null`, der Cache
  wird nicht verändert.
- **`set_grid_mode`**: Bei einem Fehler wird der Gerätezustand per F5 neu
  gelesen statt einen veralteten Cache wiederherzustellen. 0-A-Writes werden
  auf eine sichtbare Wirkung geprüft.
- **`info.connection`**: Nur noch der Modell-Pfad schreibt den State; ein
  fehlgeschlagener Poll kann nicht mehr durch ein direktes `true` maskiert
  werden.
- **Queue-Reihenfolge**: Erst vollständiger Poll, dann Control-Queue. Bei
  fehlgeschlagenem Poll werden Controls auf den nächsten Zyklus verschoben.
- **Abgelehnte/abgelaufene Commands**: Der Control-State wird auf den
  Gerätewert zurückgesetzt, sofern der Nutzer ihn nicht inzwischen erneut
  beschrieben hat.

### P2

- Long-Winmon-RAM-Metadaten (`0x8E Sc Sc Off Off`) inkl. Offset.
- `ac_info.fmains`/`dc_info.finv`: rohe Periode 0 → 0 statt `Infinity`.
- AC-Phasen 5–7 (L4/L3/L2) akzeptiert; `state`/`phase_info` bleiben auch ohne
  Skalierung sichtbar.
- Faktor 0 → Strom `null` statt falscher 0 A.
- Setting 63 mit 0x8000-Bias.
- SettingInfo: Long-/Short-Erkennung über exakte Länge (0x0D/15 Bytes);
  0x86-„nicht unterstützt“ erkannt.
- `readRamVar` sendet die 16-Bit-ID.
- `set_switch_state` schreibt bei 1/3 den konfigurierten Strom statt
  „Limit ignorieren“ und prüft den Zustand per F5.
- `prepareSettingWrite` schreibt den aktuellen Strom statt `0xFFFF`.
- Flag-Readback aktualisiert `setting.flag.*` sofort.
- `IBatBulk` ohne Readback → Fehler statt Erfolg.
- Skalierte Writes lesen bei fehlendem Readback einmal nach und aktualisieren
  das Modell; `writeSetting` akzeptiert 0x87 und 0x88.
- Angewandter (quantisierter) Wert wird bestätigt, nicht der Rohwunsch.
- Lifecycle: doppeltes `ready` ignoriert, Shutdown wartet auf laufenden
  Serial-Austausch, `ack:false`-Commands aus der Downtime werden nicht
  wiederholt.
- UI: min/max/def der skalierten Controls aus `GetSettingInfo`, non-numerische
  Control-Writes werden geloggt.

## 7. Offene Punkte / nächste Runde

- `info.connection` kann nach einem **Prozessabsturz** (kein Unload) weiterhin
  auf `true` stehen; HomePilot nutzt deshalb zusätzlich
  `system.adapter…alive` (Issue #60 im HomePilot-Repo).
- `grid_mode` ist ein Befehl, kein Readback; die tatsächliche Betriebsart muss
  aus `state.state`/`switch.state` abgeleitet werden (HomePilot 0.3.2 macht das
  für die Anzeige).
- Nach diesem Review: Version 0.3.5 bauen, Tests/Build, auf pi4 installieren
  und dort erneut read-only + `set_assist`/`IMainsLimitAC1` verifizieren.

