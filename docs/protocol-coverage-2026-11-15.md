# Protokoll-Vollabdeckung: ioBroker.victron-mk2 v0.1.0 vs. MK2 Protocol 3.14

Stand: 2026-11-15 · Quelle: `master` (`1124da5`) · Referenz: *Interfacing with
VE.Bus products – MK2 Protocol 3.14* (22.06.2017), lokal
`~/Downloads/White-paper-Interfacing-with-VE-Bus-products-MK2-Protocol-3-14 (1).pdf`.

**Frage:** Sind alle beschriebenen Funktionen implementiert?
**Antwort:** Nein. Der Adapter deckt den kompletten *Betriebs*-Pfad eines
einzelnen MultiPlus ab (LEDs, Zustand, DC/AC-Werte, Limits, Flags, Laden/Entladen
steuern). Darüber hinaus fehlen vor allem **Identifikation/Firmware**,
**Setting-Metadaten**, **RAM-Variablen jenseits der Skalierung** (Leistung, SOC),
**Mehrgeräte-/Mehrphasen**-Funktionen und die **Diagnose-/Recovery-Kommandos**.
BOL ist mit MK2-Hardware grundsätzlich nicht möglich (nur MK3).

Legende: **JA** = implementiert und gegen Protokoll geprüft · **TEIL** = nur
teilweise/umgangen · **NEIN** = nicht implementiert · **N/A** = mit dieser
Hardware/Firmware nicht sinnvoll.

## 1. MK2-Grundfunktionen (§3)

| Protokoll-Funktion | Status | Umsetzung / Lücke |
|---|---|---|
| 2400 8N1, little endian | JA | `serialWrapper.ts` |
| Frameformat `<Len> 0xFF <Cmd> <Data> <Checksum>` | JA | inkl. Prüfsumme beide Richtungen |
| Zero-Padding (letztes Datenbyte 0xFF) | N/A | MK2-Version ≥ 1130128, damit laut §3.2 nicht nötig |
| Längere Responses tolerieren (undokumentierte Bytes ignorieren) | TEIL | Längenvalidierung ist generisch (Mindestlängen), einzelne Parser prüfen aber exakte Präfixe |
| **Response-Timeout 500 ms, F5 > 750 ms** (§3.3) | TEIL | Einheitlich 1500 ms (`mk2Connection.receiveFrame`). Funktional ok, aber träge bei totem Gegenüber; kein kürzerer Timeout für Standardkommandos |
| **`V` Version anfordern + `<Mode>` auswerten** (§3.4) | TEIL | Version-Frames werden beim Sync empfangen; kein aktiver `V`-Request, **`<Mode>` wird nicht ausgewertet** (VE 9-bit vs. VE.Bus, aktuelle Adresse) |
| DTR für MK2.2 (§3.1) | N/A | USB-MK2 an pi4 |
| Jumper Panel-Detect/Standby (§3.5) | N/A | Hardware, kein Software-Feature |
| **MK2-Reset `02 FF 'R'`** (§3.6) | NEIN | Nützlich als Recovery, wenn der MK2 vor dem VE.Bus-Gerät gestartet wurde |

## 2. LEDs, Panel, Zustand (§4, §5, §7.3.2)

| Funktion | Status | Umsetzung / Lücke |
|---|---|---|
| `L` LED-Status, 8 LEDs, Blink/Anti-Phase | JA | `led.*`; Sentinel 0x1F/0x1F → `UNKNOWN` korrekt behandelt |
| `S` Variante 2 (Limit = A × 10), Switch State 1–4 | JA | `set_assist`, `set_switch_state`; Flags = 0x80 |
| `S` Variante 1 (Pot value/Panel scale) | NEIN | Für diese Firmware nicht nötig |
| `S` Flags[0] Auto-Panel-State alle 0,5 s | NEIN | Adapter pollt selbst im 2-s-Takt; nicht nötig |
| `S` Flags[1] LED-Status an alle Frames anhängen | NEIN | LEDs werden separat per `L` gelesen (2 Abfragen statt 0) |
| `S` Flags[4] „do not send panel state“, FlagsExt0, EEPROM-Flags | NEIN | nicht nötig; EEPROM „Block XMT / listen only“ wäre für reine Monitor-Instanzen interessant |
| Panel-Frames empfangen (`0x40`, Flags[6]) | NEIN | Nur relevant, wenn ein Remote-Panel im System ist |
| `W 0x0E` State lesen / Equalise/Absorption/Float erzwingen | JA | `get_state`, `force_state` |
| **Sub-State aus der `0x94`-Antwort** | TEIL | Wird mit `parseInt("" + state + substate)` zu einer zweistelligen Zahl verkettet. Das Modell enthält dafür bereits alle Namen (`80` Bypass, `90` Charge-Init, `91` Bulk … `98` Bulk stopped). Es fehlt ein separates `state.substate`, und die `force_state`-Antwort wird nur quittiert, nicht in das Modell übernommen |

## 3. Info-Frames und MasterMultiLED (§6.1, §6.2)

| Funktion | Status | Umsetzung / Lücke |
|---|---|---|
| `F 0` DC-Info (U, I-invert, I-charge, Periode, Phase) | JA | unsigned 24-bit, Skalierung aus RAM-Info |
| `F 1` AC-Info L1 inkl. **BF-/Inverter-Faktor** | JA | `imains`/`iinv` werden korrekt mit den Faktoren multipliziert |
| `F 2/3/4` AC-Info L2/L3/L4 | NEIN | Einphasen-Betrieb; `ac_info.phase_info` wird gelesen, aber nicht ausgewertet |
| `F 5` MasterMultiLED: min/max/aktuelles Limit, Switch-Register, AC-Input-Config | JA | `assist.*`, `switch.*` |
| **AC-Input-Config auswerten** (aktiver Eingang, Panel-Override, Anzahl AC-Inputs, Remote-Panel erkannt) | TEIL | Nur Limits + Switch-Register werden exponiert; `ac_input.*` fehlt |
| `F 6` RAM-Snapshot anfordern + `W 0x38` auslesen | NEIN | Für zeitgleiche Leistungsmessung mehrerer Geräte; bei CCGX im System nicht sicher nutzbar |
| `F 8` VE.Bus-Reset | NEIN | Bewusst nicht anbieten (gefährlich) oder nur hinter klarer Bestätigung |
| `F 9` Battery Operational Limits | N/A | **MK2 nicht unterstützt** (braucht MK3 ≥ 203 und Multi-Firmware ≥ 415); außerdem nicht für Blei-Batterien |

## 4. Winmon-Kommandos (§7.3)

| Kommando | Status | Umsetzung / Lücke |
|---|---|---|
| `0x05/0x06` **Softwareversion des MultiPlus** | NEIN | Weder `info.device_sw_version` noch Auswertung; damit ist die Modell-/Firmware-Frage aus dem Runbook per MK2 aktuell nicht beantwortbar |
| `0x0E` GetSetDeviceState | JA | |
| `0x30` **ReadRAMVar** | NEIN | Es werden nur Skalierungen gelesen, keine RAM-Werte. Damit fehlen u. a. SOC (ID 13), Leistung (14–19), Relay-State (12), Virtual-Switch-Position (10), Ignore-AC-Input (11), Signed-AC-Load (9) |
| `0x31` ReadSetting | TEIL | Nur `Flags0` (ID 0) und `IBatBulk` (ID 4) |
| `0x32` WriteRAMVar | NEIN | Kein Anwendungsfall bisher |
| `0x33/0x34` WriteSetting + WriteData | JA | Flags, IBatBulk; `0x88` validiert |
| `0x35` **GetSettingInfo** (Scale, Offset, Default, Min, Max, Access) | NEIN | **Wichtigste Lücke im Schreibpfad:** Das Protokoll verlangt (§7.3.13.3) die Support-Maske über `<Maximum>`. Der Adapter schreibt Flags per Read-Modify-Write, ohne vorher zu prüfen, welche Bits das Gerät unterstützt |
| `0x36` GetRAMVarInfo | JA | IDs 0,1,2,3,4,6,7,8 – **siehe Befund B1 (falsche ID für IBat)** |
| `0x37` WriteViaID (nur Winmon Mode 2) | NEIN | optional, vereinfacht Schreiben ohne 0x33/0x34-Sequenz |
| `0x38` ReadSnapShot | NEIN | siehe `F 6` |
| `X/Y/Z`-Rotationskommandos, Winmon Mode 2 (lange Frames) | NEIN | Mode 1 reicht für alle genutzten Kommandos |
| „Unknown command“-Antwort `0x80 <Reason>` auswerten | TEIL | Ungültige Responses werden als Fehler verworfen, aber `<Reason>` wird nicht decodiert/geloggt |

## 5. Settings und Flags (§7.3.13)

Gelesen: `Flags0` (vollständig als `setting.flag.*`, außer Bit 3/7, siehe B3) und
`setting.IBatBulk`.

| Setting-Gruppe | Status | Nutzen für diese Anlage |
|---|---|---|
| `Flags1` (ID 1): Dynamic current limiter (28), Accept wide input frequency (27), Remote overrules AC1 (30), Tubular-plate curve (29), Low-Power-Shutdown-AES (31) | NEIN | **Dynamic current limiter** und **Remote overrules AC1** sind offene Runbook-Prüfpunkte |
| `Flags2/Flags3` (ID 60/61) | NEIN | gering |
| `UBatAbsorption` (2), `UBatFloat` (3) | NEIN | Abgleich mit `docs/batterie-bae-opzv-800.md` (14,20/13,40 V) ohne VEConfigure möglich |
| `UInvSetpoint` (5), `IMainsLimit AC1` (6), `IMainsLimit AC2` (49) | NEIN | Readback gegen `assist.limit` |
| `UBatLowLimit` (11), `UBatLowHysteresis` (12), Pre-Alarm-Offset (63) | NEIN | **DC-Schwellen**, offener Prüfpunkt im Loop-Vorfall |
| `Lowest/Highest acceptable UMains` (44–47) | NEIN | Erklärt „Grid Lost“ trotz 230 V |
| `Assist current boost factor` (48) | NEIN | PowerAssist-Verhalten |
| AES: Low current limit (50), Hysterese (51) | NEIN | AES ist laut `DisableAES = true` aus; Verifikation sinnvoll |
| Charge characteristic (10), Repeated Absorption (7/8/9), (max.) Absorption duration (9) | NEIN | Ladestrategie-Doku |
| Battery capacity (64), Charge-% bei Bulk→Absorption (65) | NEIN | Interner Battery-Monitor (RAM 13 SOC) |
| Virtual-Switch-Settings (15–43, 52–59, 62) | NEIN | Nur falls Virtual Switch genutzt wird |

## 6. RAM-Variablen (§7.3.13.1)

| ID | Inhalt | Status |
|---|---|---|
| 0–4, 6–8 | Skalierung für AC/DC/Perioden | JA (nur Skalierung, Werte kommen aus `F`-Frames) |
| **5** | **IBat (Skalierung, signed!)** | **NEIN → B1** |
| 9 | Signed AC Load Current | NEIN |
| 10/11/12 | Virtual-Switch-Position, Ignore-AC-Input, Multifunction-Relay-State (Bitfelder, Offset 0x8000) | NEIN |
| 13 | **SOC des internen Battery-Monitors** (Scale 0,005) | NEIN |
| 14/15/16 | **Inverter Power / Output Power (filtered), signed, W** | NEIN – echte Watt-Werte statt `U × I`-Schätzung |
| 17–19 | dieselben, unfiltered | NEIN |

## 7. Befunde (Fehler, keine Features)

### B1 – IBat-Skalierung wird von RAM-ID 6 statt 5 gelesen
`src/mk2/mk2Protocol.ts`, `ibat_calc_load()` sendet `W 36 06 00`.
Protokoll §7.3.13.1: **ID 5 = IBat**, ID 6 = UBatRMS (Rippelspannung).
Auf dieser Firmware fallen beide Skalierungen auf 0,01 zusammen, deshalb ist der
Fehler bisher unsichtbar. Entscheidend ist der Unterschied im **Vorzeichen**:
Anhang 2 zeigt für ID 5 `scale = -32668` → **signed**, für ID 6 `+32668` →
unsigned. Bei anderer Firmware oder wenn künftig vorzeichenbehaftete DC-Ströme
ausgewertet werden, liefert das falsche Werte.

### B2 – `dc_info.ibat` ist nicht der Batteriestrom
Die F0-Felder sind „DC current **used by inverting devices**“ und „DC current
**provided by charging devices**“. Der Adapter nennt ersteres `dc_info.ibat`,
zweiteres `dc_info.icharge` – beide vorzeichenlos. Der tatsächliche Batteriestrom
ist nach Anhang 2 `icharge - ibat` (signed). Er fehlt als State; das Runbook
interpretiert `dc_info.ibat` außerdem leicht als Batteriestrom.

### B3 – Flags0 Bit 3 / Bit 7 werden weder exponiert noch auf Konsistenz geprüft
Protokoll §7.3.13.3: `Disable Wave Check` (3) und Bit 7 **müssen invertierte
Werte haben**. Der Read-Modify-Write-Pfad erhält die Bits zwar, aber eine
inkonsistente Geräte-Konfiguration würde nicht auffallen.

### B4 – `currentSwitchState` ist ein lokaler Cache
`set_assist` sendet den zuletzt vom Adapter gesetzten Switch-State (Default 3).
Ein manueller Eingriff über Frontschalter/Panel wird nicht aus dem
MasterMultiLED-Switch-Register (`SwitchCharge`/`SwitchInvert`) abgeleitet. Der
v0.1.0-Fix verhindert das harte „On“-Erzwingen, bleibt aber von der lokalen
Annahme abhängig.

### B5 – Kleinigkeiten
- In `poll()` stehen noch drei auskommentierte `get_power_*`-Aufrufe, und im
  Modell sind `power.*`/`dc_info.finv` auskommentiert, obwohl die Funktionen
  entfernt wurden.
- `dc_info()` wartet auf `finv_calc`, obwohl gar keine Inverterfrequenz
  berechnet wird; `finv_calc` wird also weiter geladen, aber nicht genutzt.
- `setting.IBatBulk` wird als rohes signed LE16 ohne Skalierung gelesen; die
  Skalierung/Min/Max kämen aus `0x35` (siehe §4).
- Kein `info.connection`, kein Fehler-/Timeout-Zähler: Ein abgerissener MK2 ist
  nur im Log sichtbar, nicht als State alarmierbar.
- `ac_info.phase_info` wird gelesen, aber nicht zur Plausibilisierung genutzt
  (z. B. „mehrphasig, aber nur L1 gelesen“); der AC-Decoder akzeptiert nur 8–11.

### B6 – Fehler machen die Verbindung nicht neu synchronisierbar
Timeouts und Checksummenfehler werfen zwar, aber `synced` bleibt gesetzt und der
Port wird nicht geschlossen. Nach einem MK2-Replug oder einem VE.Bus-Neustart
kann der Adapter dadurch dauerhaft auf einem unsynchronisierten Port weiter
pollen. Erst ein echter Port-Close erzwingt `ensureSynced()` neu.

## 8. Verbesserungen nach Priorität

| Prio | Thema | Typ | Issue |
|---|---|---|---|
| 1 | B1: IBat-Skalierung auf RAM-ID 5 korrigieren | Bug | #1 |
| 2 | `0x35` GetSettingInfo + Support-/Min-/Max-Validierung vor Flag-/Setting-Writes | Sicherheit | #2 |
| 3 | MultiPlus-Firmwareversion lesen (`0x05/0x06`) + `info.*` (MK2-Version, Mode, Adresse) | Diagnose | #3 |
| 4 | Zusätzliche Settings **read-only**: UBatAbsorption/Float, UBatLowLimit/Hysterese, UMains 44–47, AES 50/51, IMainsLimit 6/49, Assist-Boost 48, Flags1 | Runbook-Prüfpunkte ohne VEConfigure schließen | #4 |
| 5 | `state.substate` separat exponieren, `force_state`-Antwort dekodieren, Encoding von `state.state` im Objekt-Description festhalten | Transparenz | #9 |
| 6 | B4: Switch-State aus dem Switch-Register ableiten | Robustheit | #7 |
| 7 | B2: `dc_info.ibat_net` (= icharge − ibat) + umbenannte/klar dokumentierte Felder | Korrekte Messgrößen | #5 |
| 8 | RAM 14/15/16 (Leistung filtered) und optional RAM 13 (SOC) auslesen, sofern die Firmware sie anbietet (`0x36`-Support-Check) | bessere Telemetrie | #6 |
| 9 | `info.connection`, Fehler-/Timeout-Zähler, **B6: Port/Sync bei Timeout/Checksummenfehler invalidieren**, Timeout-Profile (500 ms Standard, F5 ≥ 1000 ms) | Monitoring/Recovery | #8 |
| 10 | B3: Wave-Check-Bits exponieren + Konsistenzwarnung; B5-Cleanup | Hygiene | #9 |
| 11 | Optional: Mehrphasen (F2/F3/F4), Device-Discovery (`A`-Scan), MK2-Reset `R` als Recovery, `F 8`/BOL bewusst **nicht** | Ausbau | – |

Issues: <https://github.com/joergoss/ioBroker.victron-mk2/issues>

## 9. Bewusst außer Scope

- **BOL (`F 9`)**: mit MK2 nicht möglich; für die OPzV-Blei-Bank auch nicht vorgesehen.
- **`F 8` VE.Bus-Reset**: kein ferngesteuerter Reset ohne ausdrückliche Bestätigung.
- **Virtual Switch**: nur bei tatsächlichem Einsatz.
- **Winmon Mode 2 / XYZ**: kein Funktionsgewinn für die genutzten Kommandos.

## 10. Validierung dieses Audits

Rein statisch: Protokoll 3.14 Volltext gegen `src/mk2/*`, `src/main.ts`,
`src/lib/*` (Stand `master` 1124da5). Keine neuen Hardware-Zugriffe. Für die
Punkte 3, 4 und 8 ist jeweils ein kurzer Live-Readback am MultiPlus nötig
(Adapter gestoppt, exklusiver Port), bevor sie als „funktioniert“ gelten.

**Umsetzung (2026-11-15):** Issues #1–#9 sind in **v0.2.0** implementiert und
auf `master` gemergt. Die read-only Live-Verifikation und die Modus-/Schreibtests
am MultiPlus sind ebenfalls erfolgt; Ergebnisse stehen in `CHANGELOG.md`
(0.2.0, Abschnitt Validation). Wichtigste neue Live-Erkenntnisse:

- MultiPlus-Firmware **1909140** (`19 9 140`): Revision 140 < 207, deshalb
  existiert das AC-Info-State-Feld nicht und `ac_info.state` ist jetzt `null`.
- RAM 14/16 (Leistung) werden von dieser Firmware **nicht** angeboten (Sc = 0,
  kurzer Frame); `power.*` bleiben `null`. SOC des internen Monitors ist 0 %
  (nicht gepflegt; BMV bleibt maßgeblich).
- UBatLowLimit **9,30 V**, UMains-Fenster **180–270 V**, AES 0,25 A,
  DynamicCurrentLimiter und RemoteOverrulesAC1 **an** – die bisher offenen
  Runbook-Prüfpunkte sind damit ohne VEConfigure beantwortet.
- Nicht auf Hardware getestet bleiben: physischer MK2-Replug, MultiPlus-Boot mit
  laufendem Adapter, `force_state`.
