# Auditrunde 3 (Lebenszyklus + serielle Robustheit) – Befunde und Auflösung

Stand: 2026-11-16 · Modell: `deepseek/deepseek-flash` · Fokus: Adapter-Lebenszyklus
(`main.ts`) und serielle Robustheit, nicht erneut die Protokollabdeckung.
Ergebnis: **18 Befunde**, Issues **#56–#73**, umgesetzt in **v0.3.3**.

Die Runde hat bewusst die zuvor behobenen Bereiche erneut angegriffen und dabei
auch Fehler in den Fixes selbst gefunden (z. B. im neuen Sync-Scanner).

## Kritischste Punkte

| Issue | Befund | Auflösung |
|---|---|---|
| #56 | **Split genau nach dem 3. Byte** (`len`, FF, 'V') verlor das Längenbyte → Sync schlug dauerhaft fehl (reproduziert) | Kandidaten ab 3 Bytes, Fallback behält 3 Bytes; Test mit Splits an allen Offsets |
| #57 | `onReady` ohne try/catch → unhandled rejection/Restart-Schleife (mit gestubbter Laufzeit bewiesen) | try/catch + `info.connection = false`; die Dummy-Testdatei wurde durch eine echte Lifecycle-Suite ersetzt |
| #69 | `set_assist(0)` umging die PowerAssist-Sperre aus #45 | dieselbe Prüfung im direkten Write; 0 A bei AssistEnabled=false wird abgelehnt |
| #70 | `grid_mode(0)` fiel ohne Konfiguration auf den Geräte-Nennstrom zurück | Fallback-Kette: konfiguriertes Limit → **aktueller Istwert** → Maximum |
| #59 | Nach einem Unload-Timeout konnte die Iteration den Port erneut öffnen | Shutdown-Zustand in der Verbindung; `ensureSynced()` lehnt danach ab |

## Weitere Befunde

| Issue | Auflösung |
|---|---|
| #58 | `info.connection = false` schon beim Start, nicht erst nach der ersten Poll |
| #60 | kein statisches max/def=16 mehr im Objekt-Builder (überschrieb sonst die Gerätegrenzen bei jedem Start) |
| #61 | Decoder werfen `Error` statt `{error:…}` → die Logmeldung enthält den Grund statt `[object Object]` |
| #62 | nicht unterstützte Skalierungen: Negativ-Cache + nur eine Warnung pro Verbindung |
| #63 | `diag.last_control_error` macht verworfene/fehlgeschlagene Writes sichtbar und wird bei Erfolg geleert |
| #64 | `mainLoop()` ist idempotent (kein verwaister zweiter Loop) |
| #65/#66 | `diag.sync_errors` und `diag.protocol_errors`; Sync-Fehler schließen den Port und setzen `lastError` |
| #67 | angehängte LED-Statusblöcke werden eingelesen und verworfen statt als Antwort decodiert |
| #68 | auch der Gesamt-Deadline-Timeout läuft durch `fail()` (Zähler + Invalidierung) |
| #71 | `grid_mode(2)` bleibt bei 0 A – der Hardware-Test vom 15.11. hat gezeigt, dass State 2 allein nicht invertiert; Kommentar/Beschreibung korrigiert |
| #72/#73 | Objektbeschreibungen warnen vor Einschalten bei Off und vor Equalise auf OPzV/Gel |

## Verifikation

- **176 TS-Unit-Tests + 47 Paket-/Integrationstests** grün; CI auf master erfolgreich.
- Die Lifecycle-Suite in `src/main.test.ts` ersetzt den Dummy und testet onReady-
  Fehler, leeren Port, Startzustand und doppelten Loop-Start mit gestubbter
  Laufzeit.
- Live auf pi4: v0.3.3 deployt, Bypass stabil, `info.connection = true`,
  `diag.timeouts = 0`.

## Empfehlung danach (aus der Runde übernommen)

**Keine weitere reine Leserunde mehr.** Die Restausbeute waren Randfälle und
Diagnose-Lücken, kein funktionaler Bruch. Der nächste sinnvolle Schritt ist eine
**Hardware-Soak-Runde** (24–48 h) mit den physischen Tests aus Issue #8:
MK2 ab-/anstecken, MultiPlus aus/an und Panel-Off während eines Writes – genau
dort liegen die verbleibenden Risiken (Reconnect, Reopen, Off-Race).
