![Logo](admin/victron-mk2.png)
# ioBroker.victron-mk2

[![NPM version](https://img.shields.io/npm/v/iobroker.victron-mk2.svg)](https://www.npmjs.com/package/iobroker.victron-mk2)
[![Downloads](https://img.shields.io/npm/dm/iobroker.victron-mk2.svg)](https://www.npmjs.com/package/iobroker.victron-mk2)
![Number of Installations](https://iobroker.live/badges/victron-mk2-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/victron-mk2-stable.svg)
[![License](https://img.shields.io/github/license/joergspoerl/ioBroker.victron-mk2)](https://github.com/joergspoerl/ioBroker.victron-mk2/blob/master/LICENSE)
[![Test and Release](https://github.com/joergspoerl/ioBroker.victron-mk2/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/joergspoerl/ioBroker.victron-mk2/actions/workflows/test-and-release.yml)

## Victron MultiPlus/Quattro via MK2-USB or MK3-USB

This adapter connects ioBroker directly to a Victron MultiPlus or Quattro
inverter/charger over VE.Bus using the MK2 protocol. It talks to the device
locally through a Victron MK2-USB or MK3-USB interface; no GX device, VRM
account or cloud connection is required.

The adapter reads telemetry and device settings, and can send validated control
commands such as the AC input current limit, the VE.Bus switch state and charge
voltages. Every write is checked against the device capabilities and read back.

**Tested hardware:** MultiPlus with MK2-USB. The MK3-USB uses the same VE.Bus
MK2 protocol and is supported by the protocol implementation, but has not been
tested with every device/firmware combination. Please report your device and
firmware version if something does not work.

## Requirements

- ioBroker with js-controller **>= 6.0.11** and admin **>= 7.7.22**
- Node.js **>= 22.19.0**
- Victron MultiPlus or Quattro with a Victron **MK2-USB** or **MK3-USB**
  interface
- Local access to the serial port (on Linux usually the `dialout` group)

## Installation

1. Install the adapter from the ioBroker adapter list (or from npm:
   `iobroker install victron-mk2`).
2. Open the adapter configuration.
3. Select the serial port of the MK2/MK3 interface, for example
   `/dev/ttyUSB0`, `/dev/serial/by-id/usb-FTDI_...` or `COM3`.
4. Save and start the instance.

On Linux the ioBroker user must be allowed to open the port:

```bash
sudo usermod -a -G dialout iobroker
```

Log out and back in (or restart the host) afterwards. A stable path under
`/dev/serial/by-id/` is preferable to `/dev/ttyUSB0`, because the number can
change after a reboot.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `portPath` | – | Serial port of the MK2-USB/MK3-USB interface. |
| `interval` | `2` | Seconds between two complete polls. A poll that takes longer than the interval is followed immediately by the next one. |
| `responseTimeout` | `1500` | Maximum wait time in milliseconds for one MK2 frame. The protocol recommends 500 ms; busy hosts may need more. |

The adapter opens the port with **2400 baud** and sets DTR as required by the
MK2 protocol.

## States

All states are created below `victron-mk2.<instance>`.

### Connection and diagnostics

| State | Description |
| --- | --- |
| `info.connection` | `true` after a successful poll. A timeout or checksum error closes the port and forces a resynchronisation on the next poll. |
| `info.address`, `info.mk2_version`, `info.mk2_mode` | Device address and MK2 interface information. |
| `info.device_sw_version`, `info.device_sw_version_text` | Firmware version of the MultiPlus/Quattro. |
| `diag.timeouts`, `diag.checksum_errors`, `diag.protocol_errors`, `diag.sync_errors` | Error counters since adapter start. |
| `diag.last_error`, `diag.last_control_error` | Last serial/protocol and control error. |

### Telemetry

| State | Description |
| --- | --- |
| `state.state`, `state.substate` | Device state and charge phase (bulk, absorption, float, storage, equalise, …). |
| `dc_info.ubat`, `dc_info.ibat`, `dc_info.icharge`, `dc_info.ibat_net` | Battery voltage, inverter DC current, charger DC current and net battery current. |
| `ac_info.umains`, `ac_info.imains`, `ac_info.fmains`, `ac_info.uinv`, `ac_info.iinv` | AC input/output voltage, current and frequency. |
| `power.inverter`, `power.output` | Filtered power in W from the device RAM variables. These require newer firmware; otherwise they stay `null`. |
| `battery.soc` | SOC of the MultiPlus internal battery monitor (not a BMV). |
| `switch.state`, `switch.*` | Panel and remote switch states as reported by the device. |
| `setting.*` | Read-only device settings and Flags0/Flags1, with scale, range and support information from the device. |

The adapter never computes power as `U × I`: that would be VA, not W. Values the
firmware does not provide stay `null` and are not polled again.

### Controls

Commands are written with `ack = false`, for example from scripts or Blockly.
The adapter acknowledges a command with `ack = true` only after the device has
accepted it and a readback matched.

| State | Values | Description |
| --- | --- | --- |
| `control.set_assist` | `0 … assist.maxlimit` A | AC input current limit. `0 A` is a valid zero-grid mode when PowerAssist is enabled. The value is clamped to the device maximum. |
| `control.switch_state` | `1` charger only, `2` inverter only, `3` on, `4` off | VE.Bus switch state. Changing it does not change the current limit. |
| `control.grid_mode` | `0` grid, `1` zero grid / invert, `2` inverter only | Convenience mode that combines switch state and current limit. |
| `control.force_state` | `1` equalise, `2` absorption, `3` float | Forces a charge phase. Equalise is a battery maintenance action; use it deliberately. |
| `control.DisableCharge`, `control.WeakACInput`, `control.IBatBulk` | see object | Charger, weak-AC and bulk-current settings with validated writes. |
| `control.DisableAES`, `control.AssistEnabled`, `control.DynamicCurrentLimiter` | `0`/`1` | Feature switches validated against the device support mask. |
| `control.UBatAbsorption`, `control.UBatFloat`, `control.IMainsLimitAC1` | device range | Charge voltages and AC1 input current limit. Values are rejected outside the range reported by the device. |

### Safety notes

- **Battery voltages:** absorption and float voltages must match the battery
  datasheet. Wrong values can damage the battery. The adapter reads every write
  back and does not write unchanged values (EEPROM wear).
- **Equalise:** only use `control.force_state = 1` deliberately and with
  knowledge of the battery type.
- **One process per port:** do not open the same serial port from another
  program (for example VictronConnect or a second adapter instance) at the same
  time.
- **Booting:** while the MultiPlus is booting (`state 10/20`) the adapter does
  not send control commands. If the device does not finish booting with the MK2
  attached, start it without the MK2 and attach/start the adapter afterwards.

## Troubleshooting

| Symptom | Cause / solution |
| --- | --- |
| `EACCES` or `permission denied` | The ioBroker user may not open the port. Add it to `dialout` and restart. |
| `info.connection` stays `false` | Wrong port, cable/adapter not connected, or another process holds the port. Check `diag.last_error`. |
| Port changes after reboot | Use the stable `/dev/serial/by-id/...` path. |
| Values stay `null` | The firmware does not provide the value (for example filtered power or SOC without an internal battery monitor). |
| Device does not respond | Verify 2400 baud and DTR support of the USB adapter; try a higher `responseTimeout`. |

## Documentation and verification

Development notes, protocol coverage and hardware test reports are in
[`docs/`](docs/).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT License. See [LICENSE](LICENSE).

This adapter is not affiliated with Victron Energy. Victron, MultiPlus, Quattro,
VE.Bus and MK2/MK3 are trademarks of Victron Energy B.V.
