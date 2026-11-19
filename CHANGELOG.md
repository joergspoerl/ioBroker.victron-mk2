# Changelog

All notable changes to this adapter are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.4.0 (2026-11-19)

Publication preparation and a modern runtime baseline.

### Changed

- Configuration migrated to **Admin 5+ JSON config** (`admin/jsonConfig.json`);
  the legacy Materialize dialog and `words.js` were removed. The native keys
  (`portPath`, `interval`, `responseTimeout`) are unchanged, so existing
  installations keep their settings.
- Requires **js-controller >= 6.0.11** and **admin >= 7.7.22**.
- Requires **Node.js >= 22.19.0**; CI runs on Node.js 22, 24 and 26.
- Updated `@iobroker/adapter-core` to 3.x and `serialport` to 13.x. The serial
  port is now always opened with the current `{ path, baudRate }` constructor.
- README restructured for users: installation, configuration, states,
  controls, safety notes and troubleshooting. Developer template sections
  removed; verification reports remain in `docs/`.
- Package contents limited to the files needed at runtime; `build/` is no
  longer tracked in git and is produced by `npm run build` (also on `npm pack`
  and on release).

### Added

- Channel/folder objects (`info`, `diag`, `dc_info`, `ac_info`, `power`,
  `battery`, `switch`, `state`, `led`, `setting`, `setting.flag`, `control`)
  group the states, so states are always the last level of the object tree.
- Dependabot configuration and GitHub issue templates.
- `prepack` build so a package created from a clean checkout always contains
  `build/`.

### Fixed

- `PollLoop.stop()` now cancels the pending poll timer, so an unload does not
  wait up to the configured interval (up to one hour) before the adapter
  terminates.

## 0.3.5 (2026-11-18)

Fourth audit round against a live MultiPlus on firmware **1909209**. Findings
and evidence: `docs/audit-round4-2026-11-18.md`.

### Fixed

- **Switch register in extended MasterMultiLED frames**: the register is read
  from the correct position in the long F5 layout and cross-checked against
  `state.state`; ambiguous frames publish "unknown" instead of a false `Off`.
  This restores `set_assist` while the device runs in Inverter only.
- **LED-append bit**: `receiveFrame` masks bit 7 of the length byte, so decoders
  and every length guard see the real frame length.
- **Long Winmon RAM metadata**: parse the mode-2 `0x8E Sc Sc Off Off` form, so
  scaling offsets (e.g. mains period) are no longer dropped.
- **Honest readbacks**: `set_assist`, `set_switch_state`, scaled setting writes
  and `IBatBulk` verify the device value and acknowledge the quantized/applied
  value instead of the raw request. 0 A writes must leave a visible trace.
- **Grid mode**: a failed write reloads the device's switch state instead of
  restoring a stale cache; `control.set_assist` is mirrored after grid-mode
  writes, and the configured input limit is preserved.
- **Control queue**: runs after the full poll (so Flags0/settings exist), is
  skipped when the poll failed, and resets rejected/expired command states to
  the device value instead of leaving the requested value visible.
- **Connection state**: `info.connection` has a single writer and a failed full
  poll can no longer be masked by a direct `true`.
- **Settings**: `fmains`/`finv` publish 0 instead of `Infinity` for a raw period
  of 0; phase 5–7 (L4/L3/L2) is accepted; factor 0 publishes unknown currents;
  setting 63 applies its 0x8000 bias; long/short setting-info discrimination is
  length-based; 0x86 unsupported replies are recognised.
- **Flags**: a successful flag write refreshes `setting.flag.*` immediately, so
  a following 0 A command in the same batch sees the new PowerAssist state.
- **Lifecycle**: duplicate ready events are ignored; shutdown waits for an
  in-flight serial exchange; commands written with ack=false while the adapter
  was down are not replayed and are reset to the device value.
- **Diagnostics/UI**: warn on non-numeric control writes, preserve discovered
  min/max/def on restart, and publish device min/max for scaled control states.

### Validation

- 201 TypeScript tests (incl. lifecycle and the root `main.test.ts`) + 47
  package tests; `check`, `lint` and `build` green.
- Live read-only and reversible write tests on pi4 (`set_assist`,
  `grid_mode`, `IMainsLimitAC1`); system returned to Grid/Bypass at 16 A.

## 0.3.4 (2026-11-17)

Compatibility with the long Winmon protocol returned by MultiPlus firmware
**1909209**, verified against the real device after its update from 1909140.

### Fixed

- **Device identification**: accept the single long `CommandSendSoftwareVersion`
  response containing both 16-bit parts; do not send the unsupported legacy
  part-1 request afterwards. Short two-command responses remain supported.
- **Setting metadata**: parse the single long `CommandGetSettingInfo` response
  containing Sc/Offset/Default/Min/Max, while still accepting packed short
  responses. Four packed short responses are not misclassified as a long frame.
- **Unsupported settings**: accept value-free 0x89/0x91 replies used by 1909209.
- **Setting writes**: when long Winmon mode is detected, use the documented MK2
  short-frame compatibility setting before `WriteSetting`/`WriteData`. The
  compatibility command preserves the current switch state and ignores the input
  limit rather than changing either one.

### Validation

- 181 TypeScript unit tests + 47 package/integration tests; build and eslint green.
- Live on pi4 with MultiPlus 1909209: firmware identification, power/AC-state
  telemetry and settings read correctly; `control.DisableCharge` verified through
  ioBroker in both directions with device readback and no control, timeout, sync,
  protocol or checksum errors.

## 0.3.3 (2026-11-16)

Third audit round (lifecycle + serial robustness, DeepSeek V4.1 Flash): 18
findings, fixed as issues #56–#73. Details: `docs/audit-round3-2026-11-16.md`.

### Fixed

- **Sync scanner**: a frame split exactly after the third byte (`len`, 0xFF, 'V')
  no longer loses the length byte; candidates are recognised from three bytes and
  the fallback keeps three bytes. Tested with splits at every offset.
- **`onReady` failure handling**: startup errors are caught, logged and published
  as `info.connection = false` instead of an unhandled rejection/restart loop.
- **Startup state**: `info.connection` is published as `false` at startup, so a
  persisted `true` cannot outlive a restart.
- **No reopen after unload**: the connection has a shutdown state; a late
  iteration can no longer reopen the port after `onUnload`.
- **`control.set_assist` metadata**: no static max/def that would overwrite the
  discovered device limits on every start.
- **Log quality**: decoders throw real `Error` objects, so failures carry their
  message instead of `[object Object]`.
- **Safety**: the PowerAssist guard now applies to direct `set_assist(0)` writes
  too (0 A with PowerAssist off would disable the charger and keep Bypass), and
  `grid_mode(0)` keeps the current limit when nothing is configured instead of
  jumping to the device rating.

### Added

- **Diagnostics**: `diag.sync_errors`, `diag.protocol_errors` and
  `diag.last_control_error` (dropped/failed writes are now visible, and cleared
  after a successful write).
- **Adapter lifecycle tests**: `src/main.test.ts` is a real suite with a stubbed
  ioBroker runtime (onReady failure, empty port, startup state, double loop start).
- **Serial tests**: splits at every byte offset, appended LED status blocks are
  read and discarded instead of being decoded as a response, and diagnostic
  counters are asserted on the real failure paths.

### Changed

- `grid_mode(2)` keeps using 0 A (required by this hardware, as measured on
  2026-11-15); comments and object descriptions now say so, and both mode controls
  warn that they switch an Off device on. `control.force_state` warns about
  Equalise on OPzV/gel batteries.
- Unsupported RAM scalings are negative-cached and only reported once per
  connection.

### Validation

- 176 TypeScript unit tests + 47 package/integration tests; `tsc`, `eslint`,
  `build` green; CI on master successful.
- Live on pi4: v0.3.3 deployed via `scripts/deploy-pi4.sh`, stable Bypass polling,
  `info.connection = true`, `diag.timeouts = 0`.

## 0.3.2 (2026-11-15)

Second audit round (independent model, DeepSeek V4.1 Flash): 18 findings, all
fixed and tracked as issues #38–#55. Details: `docs/audit-round2-2026-11-15.md`.

### Fixed

- **Switch register**: never read it from a frame that does not carry it (the
  previous code returned the checksum as the switch state). `switch.*` stay `null`
  when the register is absent; `currentSwitchState` is left untouched.
- **Off is recoverable**: the gate blocks only Down/Startup; while Off, only the
  explicit power-on controls are forwarded, and queued control writes expire after
  60 s instead of firing hours later.
- **Transport errors** are `Mk2TransportError` on every path (not only sync), so
  optional feature blocks can no longer hide a lost connection.
- **Unsupported scalings** no longer publish 0 V / 0 A; the affected states are
  `null`.
- **Longer responses** are accepted via minimum lengths (§3.2), including LED
  frames without the optional trailing 0x00.
- **`grid_mode`** uses the configured AC1 limit instead of the device rating,
  refuses zero grid when PowerAssist is disabled, and logs an explicit power-on.
- **Readback failures** raise a non-retryable `Mk2ReadbackError` (no repeated
  EEPROM writes); a missing readback is a failure too.
- Switch-state cache is only updated after a confirmed write; the exchange
  deadline honours `responseTimeout`; `set_assist` clamps up to the device minimum
  explicitly; the state map key for Down is `0`.
- Extended settings load is isolated per setting and negative-cached until resync.
- `info.connection` uses `indicator.connected`; measurement states start as `null`;
  `IBatBulk` is a current; switch descriptions name the actual bits.
- Objects are created and `info.connection = false` published when `portPath` is
  empty; the live test script is read-only unless a write mode is selected.

### Validation

- 165 TypeScript unit tests + 47 package/integration tests, `tsc`/`eslint`/`build`
  green, CI on master with Node 22/24 successful.
- New end-to-end tests run the protocol through the real `Mk2Connection` receiver
  (length/checksum-conformant frames), which is what had hidden the
  switch-register bug.
- Live on the MultiPlus: stable Bypass polling, `diag.timeouts = 0` in steady
  state, no errors after three consecutive adapter restarts.

## 0.3.1 (2026-11-15)

### Fixed

- **Startup synchronisation on a non-aligned byte stream.** Opening the port in
  the middle of a transmission used to produce a handful of "no version frame"
  or partial-frame errors on every adapter start. `sync()` now scans the stream
  for a complete, checksum-valid version frame, tolerating leading garbage and
  frames split across many reads, and keeps bytes after the version frame for the
  next read. The receive path uses one persistent accumulator, so frame data is
  never lost between calls.
- The fake serial port in the tests now mimics serialport's real sized-read
  behaviour (a sized read returns null until enough bytes are buffered). This
  caught a bug where a large `read(64)` stalled the synchronisation completely;
  the scanner now uses an unsized "read everything buffered" call.

### Validation

- 116 TypeScript unit tests + 37 package tests; `tsc`, `eslint`, `build` green.
- New tests: garbage before the version frame, byte-by-byte delivery, a
  version-looking sequence with a broken checksum, and frames after the version
  frame staying readable.
- **Live on pi4**: three consecutive adapter restarts with **0 timeouts**,
  `info.connection = true`, `state.state = 80` (Bypass), MK2 version 1130136 read
  correctly, no error log entries.

## 0.3.0 (2026-11-15)

Implements issue #10: more device configuration is writable, with the same
validation and readback discipline as the existing controls.

### Added

- **`control.DisableAES`** (Flags0 bit 8) and **`control.AssistEnabled`**
  (Flags0 bit 5).
- **`control.DynamicCurrentLimiter`** – first **Flags1** write (global flag 28,
  register bit 12), including the Flags1 support-mask check.
- **`control.UBatAbsorption`**, **`control.UBatFloat`** and
  **`control.IMainsLimitAC1`** – scaled settings written through
  `CommandGetSettingInfo` metadata (display → raw conversion, device min/max).
- **Readback after every setting/flag write**: the register is read again, a
  mismatch logs a warning, and the read-only `setting.*` state is refreshed.

### Changed

- Flag writes share one read-modify-write helper with support validation instead
  of per-flag copies.
- `IBatBulk` writes now also verify the readback and refresh `setting.IBatBulk`.
- `CONTROL_STATE_IDS` covers the new controls, and a unit test asserts that every
  model entry with a `setFunc` is whitelisted. (Found during live testing: new
  controls were silently ignored while they were missing from that list.)

### Validation

- 112 TypeScript unit tests + 37 package tests; `tsc`, `eslint`, `build` green.
  New tests cover flag read-modify-write on Flags0/Flags1, 0/1 validation,
  support-mask rejection, display↔raw conversion, device range rejection,
  unsupported settings, readback-mismatch warnings and the whitelist drift check.
- **Live on the MultiPlus** (firmware 1909140, no load on AC output):
  - `IMainsLimitAC1`: 15 A written and read back, then restored to 16 A.
  - `UBatFloat`: 13,45 V written and read back, then restored to 13,40 V.
  - `AssistEnabled`, `DynamicCurrentLimiter`, `DisableAES`: each switched off and
    back on with matching `setting.flag.*` readback, device stable in Bypass.
  - `UBatAbsorption = 25` rejected (device range 12,00–16,00 V), no write, no
    retry, value unchanged at 14,20 V.
  - `info.connection = true` throughout, `diag.timeouts = 1` (startup).

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
