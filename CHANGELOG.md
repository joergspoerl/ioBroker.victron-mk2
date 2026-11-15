# Changelog

All notable changes to this adapter are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.2.0 (2026-11-15)

Protocol coverage release, implementing issues #1–#9 from the full audit against
*MK2 Protocol 3.14* (`docs/protocol-coverage-2026-11-15.md`). All additions are
covered by unit tests (93 TS tests + 37 package tests, `tsc`/`eslint` clean).

### Fixed

- **IBat scaling (#1)**: `ibat_calc_load()` now queries **RAM ID 5 (IBat)**
  instead of ID 6 (UBatRMS). Both coincidentally scale by 0.01 on the current
  firmware, but ID 5 is the signed one (protocol appendix 2).
- **Reconnect after stream errors (#8)**: a timeout or checksum error now closes
  the port and invalidates the sync state; the next poll reopens and
  resynchronises instead of continuing on a desynchronised MK2.
- **Implicit power-on prevented (#7)**: `set_assist` refuses to write when the
  device switch is Off, instead of switching it on as a side effect.

### Added

- **Setting metadata (#2)**: `CommandGetSettingInfo` (`W 35`) with the multi-frame
  response handling this needs (up to three W frames per MK2 frame, quiet-end
  tolerance for older firmware). Scale, offset, default, min, max are cached per
  connection. Flag writes are rejected when the device support mask
  (§7.3.13.3) does not advertise the bit; `IBatBulk` writes use the device
  min/max and scaling instead of a hardcoded range.
- **Read-only settings (#4)**: charge voltages (absorption/float), inverter
  setpoint, AC1/AC2 input current limits, DC low limit + hysteresis + pre-alarm
  offset, lowest/highest acceptable mains voltage with hysteresis, PowerAssist
  boost factor, AES current limit + hysteresis. Loaded once per connection;
  unsupported settings stay `null`. **Flags1** exposes dynamic current limiter,
  accept wide input frequency, remote overrules AC1, tubular-plate curve and
  low-power-shutdown AES.
- **RAM telemetry (#6)**: generic `CommandReadRAMVar` with per-id support check;
  `power.inverter` and `power.output` (filtered, signed W) and `battery.soc`
  (internal battery monitor).
- **Device identification (#3)**: `info.device_sw_version` and
  `info.device_sw_version_text` (AA BB CCC) via `CommandSendSoftwareVersion`,
  `info.mk2_version`/`info.mk2_mode` from the version frame, `info.address` from
  the address response.
- **Telemetry (#5)**: `dc_info.ibat_net` (net battery current, positive =
  charging) and `dc_info.finv` (inverter frequency, 0 when the inverter is off).
- **State detail (#9)**: `state.substate` with charge-phase names; the
  `force_state` response is now decoded into the model instead of only
  acknowledged; Flags0 wave-check bits 3/7 are exposed and a warning is logged
  when they are not inverted as required.
- **Switch state visibility (#7)**: `switch.state` derived from the device switch
  register; the device is authoritative and a change is logged.

### Changed

- `dc_info.ibat`/`dc_info.icharge` descriptions now say what the F0 fields really
  are (inverter/charger DC currents); the net battery current is `ibat_net`.
- Serial response budget is configurable (`responseTimeout` in ms, default
  **1500**; 2000 ms for `F 5`). The protocol's 500 ms recommendation proved too
  tight on a loaded Raspberry Pi running ioBroker.
- Invalid control input raises `Mk2ValidationError` and is dropped immediately
  instead of being retried three times.
- Read-only settings and Flags1 model entries are generated from the protocol
  tables in `mk2Settings.ts`, so objects and protocol cannot drift apart.

### Validation

- 98 TypeScript unit tests + 37 package tests, `npm run check`, `lint`, `build`:
  green. New tests cover the IBat RAM id, net current sign, frequency zero
  handling, sub-state decoding, setting info packing/scaling/caching, support
  masks, extended settings, RAM power/SOC, version assembly, switch-state
  derivation, the reconnect path and validation errors not being retried.
- **Live on the MultiPlus (2026-11-15, no load on the AC output):**
  - Identification: MK2 firmware **1130136**, mode 0, address 0; MultiPlus
    firmware **1909140** → `19 9 140`. Since revision 140 < 207 the AC info
    `<State>` field does not exist on this unit, which explains the formerly
    puzzling raw value 70; `ac_info.state` is therefore `null` here.
  - Settings read back with device metadata: absorption **14,20 V** (default
    14,40 V, allowed 12,00–16,00 V), float **13,40 V**, DC low limit **9,30 V**,
    mains window **180–270 V**, AES low current **0,25 A**, IBatBulk **120 A**.
    Flags1: dynamic current limiter **on**, remote overrules AC1 **on**.
  - RAM: SOC of the internal monitor reads **0 %** (the internal monitor is not
    maintained; the BMV remains authoritative). RAM 14/16 (power) are **not
    supported** by this firmware and answer with the short Sc = 0 frame; they
    stay `null` and are not polled again.
  - Modes: `grid_mode = 1` and `2` → `state.state = 40` (InvertFull),
    `led.inverter = 1`, `led.mains = 0`, `imains = 0`, `assist.limit = 3,1 A`,
    `uinv` 230 V, stable; `grid_mode = 0` → back to Bypass (80),
    `assist.limit = 16 A`. Note: the switch register reports On in both inverter
    modes, so `switch.state` stays 3.
  - Writes: `set_assist 12` read back as 12 A; same-value writes for IBatBulk,
    DisableCharge and WeakACInput succeed without deadlock; invalid values
    (-1 A, 500 A) are rejected without changing the device and without retries.
  - Connection: after each adapter start a single partial-frame timeout can
    occur; the port is then closed and resynchronised, `diag.*` counts it, and
    the following polls are clean.
- **Still not tested on hardware**: physical MK2 replug, a MultiPlus boot while
  the adapter is running, and `force_state` (changes the battery charge state).

## 0.1.0 (2026-11-15)

Hardening release after the incident of 2026-11-15, in which a MultiPlus on this
adapter fell into a startup/off loop (relay clicking roughly every 2 s) right
after a control write. The audit compared every function against the official
*Interfacing with VE.Bus products — MK2 Protocol 3.14* and against live hardware.

Root cause of the incident: the adapter started polling and sending control
commands while the MultiPlus was still booting. Booting the MultiPlus without the
MK2 attached and connecting the MK2 afterwards was stable. **The hardware was not
defective.** A 0 A input current limit is a valid, intended operating mode
(inverter / zero grid) and not an encoding error: `set_assist` scales by ×10, as
required by protocol §5 (variant 2).

### Added

- **`control.grid_mode`** (0 = Grid, 1 = Zero grid / Invert via 0 A, 2 = Inverter
  only). Mode 2 combines switch state 2 with 0 A, because switch state 2 alone did
  not enter Invert while AC input was present.
- **`control.switch_state`** (1 = Charger only, 2 = Inverter only, 3 = On, 4 = Off),
  with validated S response.
- **Startup gate**: the main loop first reads only the device state
  (`pollStateOnly` + stable-state check). No control writes and no full polling
  while the MultiPlus reports startup (10) or off (20).
- **Bounded retries** in the send queue (max attempts per command) instead of
  unbounded requeueing.
- **`readFlags0()` / `writeFlags0()`** helpers, so flag setters no longer need
  nested `communicate` calls.
- **Object metadata**: `control.set_assist` now has `min = 0`,
  `max`/`def` from the device maximum (`assist.maxlimit`) and a description that
  explains the 0 A semantics.
- **Test infrastructure**: MK2 frame/mode fakes (`src/test-utils/fake-mk2.ts`),
  unit tests for frames, controls, startup gate and model mapping, plus the live
  hardware script `scripts/live-mk2-test.js`.
- **Documentation**: `docs/hardware-test-2026-11-15.md` (live results),
  `docs/function-coverage-2026-11-15.md` (function-by-function review).

### Changed

- **`set_assist(ampere)`** keeps the current VE.Bus switch state instead of
  hardcoding `3` (On) on every write. Previously every limit write forced the
  device to "On" and could contradict the front switch position.
- **`set_assist`** clamps to the device maximum, rejects NaN/negative values and
  validates the S response. **0 A stays supported** as the intended solar/inverter
  mode.
- **`onStateChange`** honours `ack`: only unacknowledged numeric control writes
  are forwarded to the device, for *all* controls (previously the guard applied
  only to `control.set_assist`).
- **`initObjects`** uses the roles from the model (`value.voltage`,
  `value.current`, …) instead of hardcoding `role: "state"`, and no longer emits
  duplicate object calls.
- **`ac_info.state`** is documented and exposed as a **raw value**; it reported 70
  (`0x46`), which is not part of the 0–9 table. The reliable main state is
  `state.state`.
- **`ac_info.fmains`** stays 1 byte: correct for this firmware (50,1 Hz readback),
  although protocol 3.14 lists a 2-byte field. Documented difference, not a bug.
- **`serialWrapper`**: lazy import, supports both the serialport 9.x constructor
  (`new SerialPort(path, opts, cb)`) and the 10+/12 constructor
  (`new SerialPort({path, baudRate}, cb)`), error/close handlers and a clean
  `close()`.
- **`onReady`** validates `interval`/`portPath`; an empty port logs and skips
  polling instead of throwing.
- **`onUnload`** closes the serial port.
- **`sync`/`ensureSynced`** run once per connection and re-sync after a reconnect.
- **Toolchain** updated (dev/test dependencies, lint/build configuration),
  version raised to 0.1.0.

### Fixed

Protocol and serial I/O:

- **`receiveFrame`** now waits for complete frames, applies timeouts and verifies
  checksums; **`communicate`** propagates errors instead of swallowing them. This
  removes the hang/partial-frame failure mode.
- **Generic frame length validation**: `address()` (≥ 4) and `led_status()`
  (≥ 5 instead of exactly 8) accept the frames this firmware actually sends;
  `get_state()`/`force_state()` validate the `0x94` response; flag writes validate
  the `0x88` response.
- **`dc_info`** uses the bufferpack result arrays correctly (`[0]`), reads the DC
  currents as unsigned 24-bit, drops the incorrect `/10` scaling and decodes the
  phase information instead of a reserved marker.
- **`loadScalingsIfNeeded`** includes `finv_calc` and `fmains_calc` in the cache
  condition, so scalings are no longer re-read unnecessarily.

Controls and write path:

- **`set_flagDisableCharge` / `set_flagWeakACInput`** deadlocked by calling
  `communicate` while it was already busy (read-modify-write). Split into
  separate read/write calls; validated with same-value writes on real hardware.
- **`set_setting_IBatBulk`** guard `value < 0 && value > 120` could never be true;
  now `value < 0 || value > 120`, and the high byte is written correctly.
- **`processToSendQueue`** no longer throws a TypeError and no longer spins when
  a command fails repeatedly.
- **`set_flagWeakACInput`** no longer emits `console.log` spam.

### Removed

- `src/lib/tools.ts` (template leftovers: `isObject`, `isArray`, `translateText`,
  Yandex/Google helpers) and with it the `axios` dev dependency.
- `testVariable` (template leftover).
- Commented-out, unsupported power functions (`get_power_charger`,
  `get_power_inverter`, `get_power_output`, `power_output_calc_load`).
- `src/prototyping/` and `test.js` remain in the repository as reference/attic but
  are not part of the build.

### Validation

- 45 TypeScript unit tests (Mocha + ts-node) plus package validation: green.
- `npm run check`, `npm run lint`, `npm run build`: green.
- Live hardware test on a MultiPlus 12 V with 16 A transfer, AC output isolated,
  house on bypass, `control.charger_level` disabled:

  | Test | Result |
  |---|---|
  | Read-only poll | `state.state = 80` (Bypass), `led.mains = 1`, DC 13,02 V, AC 238 V / 50,1 Hz, `assist.limit = 10 A` |
  | `set_assist 10` | valid S response, readback `assist.limit = 10`, stable |
  | `grid_mode = 1` (zero grid) | `state.state = 40` (InvertFull), `led.inverter = 1`, `led.mains = 0`, `imains = 0`, **no loop** |
  | `grid_mode = 0` (grid) | back to `state.state = 80`, `assist.limit = 16 A` |
  | `grid_mode = 2` (inverter only) | `state.state = 40`, stable (switch state 2 + 0 A) |
  | Serial port | clean close, no hang |

  Note: with 0 A the readback shows the device minimum (`assist.limit = 3,1 A`),
  not 0; the transition to Invert still happens.

### Not tested on hardware (deliberately)

- **`force_state(1/2/3)`** – forces Equalise/Absorption/Float and changes the
  battery charge state. Unit-tested only.
- **`set_switch_state(1)` (Charger only) and `(4)` (Off)** – protocol-validated,
  not switched on hardware, because that changes the operating mode.
- **Boot with the adapter attached**: the startup gate is unit-tested; a live
  boot test (restart the MultiPlus while the adapter is running) should be done
  after installation.

## 0.0.6 (2022-11-22)

- state changes -> mk2 queueing

## 0.0.5 (2022-11-22)

- timing bugfix

## 0.0.4 (2022-11-22)

- control of IBatBulk
- control of DisableCharge
- control of WeakACInput
- bug fixing portPath
- extended debug depends on ioBroker log level

## 0.0.3 (2022-11-20)

- connection stability

## 0.0.2 (2022-11-20)

- (joerg) initial release
