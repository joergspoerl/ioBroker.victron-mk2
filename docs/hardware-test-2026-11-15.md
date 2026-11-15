# Live-Hardware-Test 2026-11-15 (MultiPlus 12 V, 16-A-Transfer)

**Setup:** pi4, MK2 an `/dev/ttyUSB-Serial-1`; MultiPlus AC-Ausgang isoliert
(Haus auf 230-V-Bypass); DC und AC-in angeschlossen; `control.charger_level`
deaktiviert. Adapter-Version v0.1.0 (Branch `fix/audit-2026-11-15`).

## Ergebnisse

| Test | Ergebnis |
|---|---|
| Read-only-Poll | `state.state = 80` (Bypass), `led.mains = 1`, DC 13,02 V, AC 238 V / 50,1 Hz, `assist.limit = 10 A` |
| `set_assist 10` | gültige S-Antwort, `assist.limit = 10`, stabil |
| `control.grid_mode = 1` (zero_grid) | `state.state = 40` (InvertFull), `led.inverter = 1`, `led.mains = 0`, `assist.limit = 3,1 A`, `imains = 0`, **kein Loop** |
| `control.grid_mode = 0` (grid) | zurück in `state.state = 80` (Bypass), `led.mains = 1`, `assist.limit = 16 A` |
| `control.grid_mode = 2` (inverter_only) | `state.state = 40` (InvertFull), `led.inverter = 1`, stabil; Switch State 2 + 0 A |
| Serieller Port | sauberer Abschluss, kein Hänger |

## Bemerkungen

- **Switch State 2 allein** (ohne 0 A) hat bei vorhandenem AC-Eingang nicht in
  Invert gewechselt. Deshalb nutzt `grid_mode = 2` zusätzlich 0 A.
- Der 0-A-Modus ist stabil; es gab keinen Startup-/Off-Loop.
- Die 0-A-Readback zeigt `assist.limit = 3,1 A` (Minimum), nicht 0; das ist das
  Geräte-Minimum, der Moduswechsel in Invert ist trotzdem erfolgt.
- `led.mains`/`led.inverter` spiegeln den Zustand korrekt.
- `ac_info.state` bleibt ein Rohwert (70); der Hauptstate ist `state.state`.
- `state.state = 80` nach `grid_mode = 0` bestätigt den sauberen Rückweg.

## Verwendung

Siehe `scripts/live-mk2-test.js`. Der ioBroker-Adapter `victron-mk2.0` muss
während des Tests gestoppt sein (exklusiver serieller Port).
