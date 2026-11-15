# Voll-Audit v0.2.0: Schreibbare Konfiguration und Protokollabdeckung

Stand: 2026-11-15 · Code: `master` (`751e656`) · Referenz: *Interfacing with
VE.Bus products – MK2 Protocol 3.14* · Hardware: MultiPlus 12 V, Firmware
**1909140** (`19 9 140`, alte MCU), MK2 1130136.

Dieses Dokument ist die Fortsetzung von `protocol-coverage-2026-11-15.md`
(Audit von v0.1.0) und beantwortet zwei Fragen: **Was kann damit konfiguriert
werden?** und **Ist das Protokoll vollständig abgedeckt?**

## Kurzfassung

- **Schreiben ist möglich, aber bewusst kuratiert:** Betriebsmodus,
  Eingangsstromlimit, Schalterstellung, Ladezustand-Force, Lade-Deaktivierung,
  Weak-AC und Bulk-Ladestrom. Alle Writes sind validiert und quittiert.
- **Die übrigen Geräte-Einstellungen sind read-only** (Ladespannungen,
  DC-Schwellen, Netzfenster, AES, Flags1, …). Sie sind seit v0.2.0 sichtbar,
  aber nicht schreibbar – das ist eine bewusste Sicherheitsentscheidung, kein
  versehentliches Fehlen.
- **Das Protokoll ist nicht vollständig implementiert.** Der komplette
  Betriebs-/Diagnosepfad eines einzelnen MultiPlus ist abgedeckt. Nicht
  implementiert sind Mehrphasen/Mehrgeräte, Snapshots, Panel-Forwarding,
  Winmon Mode 2/XYZ, WriteRAMVar/WriteViaID, MK2-/VE.Bus-Reset und BOL.

## 1. Was heute geschrieben werden kann

| ioBroker-State | Protokoll | Validierung | Live getestet |
|---|---|---|---|
| `control.set_assist` | `S` Variante 2, Limit = A×10 | NaN/negativ abgelehnt, Clamp auf `assist.maxlimit`, kein implizites Einschalten bei Off | ja (12 A, Readback) |
| `control.switch_state` | `S`, Limit = 0xFFFF (ignorieren) | nur 1–4 | ja (über grid_mode) |
| `control.grid_mode` | `S` (State + Limit) | nur 0/1/2 | ja (0/1/2, InvertFull/Bypass) |
| `control.force_state` | `W 0x0E` | nur 1/2/3 (Equalise/Absorption/Float), Antwort wird ins Modell übernommen | **nein** (verändert den Ladezustand) |
| `control.DisableCharge` | `W 31` lesen, `W 33/34` schreiben, Flag 6 | Support-Maske aus `GetSettingInfo` | ja (Same-Value) |
| `control.WeakACInput` | wie oben, Flag 14 | Support-Maske | ja (Same-Value) |
| `control.IBatBulk` | `W 33/34` auf Setting 4 | Integer, Geräte-Min/Max aus `GetSettingInfo`, Skalierung | ja (Same-Value 120 A, 500 A abgelehnt) |

Technisch baut alles auf zwei generischen Bausteinen auf: `readSetting()` /
`writeSetting()` (für beliebige Setting-IDs) und `getSettingInfo()` (Metadaten).
**Damit ist die Infrastruktur für weitere Writes vorhanden**; es fehlen nur die
entsprechenden `control.*`-Einträge.

## 2. Was bewusst **nicht** schreibbar ist

| Bereich | Beispiele | Grund |
|---|---|---|
| Ladeparameter | `UBatAbsorption`, `UBatFloat`, `Charge characteristic`, Repeated Absorption | Direkter Eingriff in die OPzV-Bank; bisher per VEConfigure mit Backup verwaltet |
| DC-/Netzschwellen | `UBatLowLimit`, `UMains 44–47` | Falsche Werte erzeugen genau den Ausfall aus dem Vorfall |
| AES | `AESLowCurrentLimit`, `AESHysterese`, `DisableAES` | AES ist hier deaktiviert |
| Weitere Flags0/1/2/3 | `AssistEnabled`, `DynamicCurrentLimiter`, `RemoteOverrulesAC1/2`, `DisableGroundRelay`, `MultiPhase*` | Protokoll warnt vor dem Setzen unbekannter/„not promoted“ Bits; nur kuratierte Bits sollen schreibbar sein |
| RAM-Variablen (`W 32`, `W 37`) | – | Kein Anwendungsfall; RAM-Writes sind flüchtig und geräteabhängig |
| `F 8` VE.Bus-Reset | – | Fern-Reset soll nie unbeabsichtigt auslösbar sein |
| BOL (`F 9`) | – | **Mit MK2 nicht möglich** (MK3 ≥ 203 nötig), für Blei-Bank nicht vorgesehen |

Wenn einzelne davon schreibbar werden sollen, gehören sie als eigener
`control.*`-State mit Bereichs-/Support-Validierung dazu, nicht als generischer
„schreibe beliebige ID“-Endpunkt.

## 3. Protokollabdeckung nach v0.2.0

| Protokollbereich | v0.1.0 | v0.2.0 |
|---|---|---|
| Frames, Checksummen, Timeouts, Sync/Reconnect | teilweise | **ja**, inkl. Invalidierung nach Fehlern |
| `V` Versionsframe | nur Sync-Marker | **ja** + `info.mk2_version`/`mk2_mode` |
| `A` Adresse | ja | **ja** + `info.address` |
| `L` LEDs inkl. 0x1F-Sentinel | ja | ja |
| `S` Variante 2 (Limit, Switch-State) | ja | ja, geräte-konform |
| `S` Variante 1, Panel-Auto-Send, LED-Auto-Append, Panel-Forwarding `0x40` | nein | nein (für diese Anlage entbehrlich) |
| `F 0`/`F 1` DC/AC L1 inkl. Faktoren | ja | ja |
| `F 2/3/4` weitere Phasen | nein | nein (Einphasen-Anlage) |
| `F 5` MasterMultiLED | ja | ja + Switch-State-Ableitung |
| `F 6`/`0x38` Snapshots | nein | nein (kein Mehrgeräte-System) |
| `F 8` Reset, `F 9` BOL | nein | nein (bewusst bzw. mit MK2 unmöglich) |
| `W 0x0E` State/Force | ja | ja + Sub-State + Readback |
| `W 0x30` ReadRAMVar | nein | **ja** (Support-Check, Bitfelder, Signed) |
| `W 0x31` ReadSetting | nur 2 IDs | **ja**, generisch |
| `W 0x32` WriteRAMVar | nein | nein |
| `W 0x33/0x34` WriteSetting/Data | ja | **ja**, generisch |
| `W 0x35` GetSettingInfo | nein | **ja**, Multi-Frame |
| `W 0x36` GetRAMVarInfo | ja (falsche ID für IBat) | **ja**, korrigiert + generisch |
| `W 0x37` WriteViaID (Mode 2) | nein | nein |
| Winmon Mode 2 / `X/Y/Z` | nein | nein (Mode 1 reicht) |
| `R` MK2-Reset | nein | nein |
| Settings/Flags lesen | Flags0 + IBatBulk | **Flags0 + Flags1 + 15 Settings** |
| Identifikation/Diagnose | nein | **ja** (`info.*`, `diag.*`, `info.connection`) |

## 4. Was noch sinnvoll verbesserbar ist

| Prio | Thema | Bemerkung |
|---|---|---|
| 1 | **Weitere Settings schreibbar machen** (`DisableAES`, `AssistEnabled`, `UBatAbsorption/Float`, `IMainsLimit AC1`, `DynamicCurrentLimiter`) | Infrastruktur liegt vor; pro Setting ein eigener `control.*` mit `GetSettingInfo`-Validierung. Issue #10 |
| 2 | **Startup-Gate live beweisen** | MultiPlus-Boot bei laufendem Adapter; bisher nur Unit-getestet |
| 3 | **Physischer Reconnect-Test** | MK2 ab-/anstecken; Unit-Test + Timeout-Pfad existieren (Issue #8 bleibt dafür offen) |
| 4 | `force_state` auf Hardware | nur mit ausdrücklicher Batterie-Absicht |
| 5 | Mehrphasen/Mehrgeräte, Snapshots, Mode 2, `R`-Reset | nur bei tatsächlichem Bedarf; für diese Anlage nicht nötig |

Nicht mehr offen: IBat-Skalierung, Netto-Batteriestrom, Sub-State,
Setting-Metadaten, read-only Diagnosewerte, Firmware-Identifikation,
Verbindungszustand, Switch-State-Ableitung, Wave-Check-Konsistenz.

## 5. Validierungsbasis

- 98 TS-Unit-Tests + 37 Pakettests; `tsc`, `eslint`, `build` sauber.
- Live am MultiPlus (15.11.2026): Read-only-Poll, `grid_mode` 0/1/2,
  `set_assist`, Same-Value-Writes für Flags/IBatBulk, Negativtests,
  Recovery nach Timeout. Details: `CHANGELOG.md` (0.2.0) und Runbook
  Nachtrag 10 im devops-home-Repo.
