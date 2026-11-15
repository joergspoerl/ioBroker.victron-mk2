![Logo](admin/victron-mk2.png)
# ioBroker.victron-mk2

[![NPM version](https://img.shields.io/npm/v/iobroker.victron-mk2.svg)](https://www.npmjs.com/package/iobroker.victron-mk2)
[![Downloads](https://img.shields.io/npm/dm/iobroker.victron-mk2.svg)](https://www.npmjs.com/package/iobroker.victron-mk2)
![Number of Installations](https://iobroker.live/badges/victron-mk2-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/victron-mk2-stable.svg)
[![Dependency Status](https://img.shields.io/david/joergspoerl/iobroker.victron-mk2.svg)](https://david-dm.org/joergspoerl/iobroker.victron-mk2)

[![NPM](https://nodei.co/npm/iobroker.victron-mk2.png?downloads=true)](https://nodei.co/npm/iobroker.victron-mk2/)

**Tests:** ![Test and Release](https://github.com/joergspoerl/ioBroker.victron-mk2/workflows/Test%20and%20Release/badge.svg)

## victron-mk2 adapter for ioBroker

Victron Multiplus

### Controls and operating modes

- `victron-mk2.0.control.set_assist`: AC input current limit in A. `0 A` is a
  valid zero-grid/solar mode: with PowerAssist enabled the MultiPlus switches
  to Invert; with PowerAssist disabled it stays in Bypass with the charger off.
  The value is clamped to the device maximum (`assist.maxlimit`).
- `victron-mk2.0.control.switch_state`: VE.Bus switch state
  (1 = Charger only, 2 = Inverter only, 3 = On, 4 = Off). Changing it does not
  change the current limit (the limit is ignored).
- `victron-mk2.0.control.grid_mode`: `0 = Grid` (max limit, On),
  `1 = Zero grid / Invert` (0 A, On), `2 = Inverter only` (switch state 2).
  Use this instead of writing `set_assist = 0` from automation if you want an
  explicit, documented mode.
- `victron-mk2.0.control.force_state`: charge-state force
  (1 = Equalise, 2 = Absorption, 3 = Float) — not an on/off mode.
- `victron-mk2.0.control.DisableCharge`, `control.WeakACInput`,
  `control.IBatBulk`: charger/weak-AC/bulk-current settings with validated writes.

The adapter performs a read-only state poll before enabling control writes and
never sends control commands while the MultiPlus is booting (state 10/20).
If the MultiPlus does not finish booting with the MK2 attached, start it first
without the MK2 and attach/start the adapter afterwards.

All reads/writes use length-prefixed frames with checksum validation and
timeouts; failed control writes are retried on a later poll cycle.

## Developer manual
This section is intended for the developer. It can be deleted later

### Getting started

You are almost done, only a few steps left:
1. Create a new repository on GitHub with the name `ioBroker.victron-mk2`
1. Initialize the current folder as a new git repository:  
	```bash
	git init -b main
	git add .
	git commit -m "Initial commit"
	```
1. Link your local repository with the one on GitHub:  
	```bash
	git remote add origin https://github.com/joergspoerl/ioBroker.victron-mk2
	```

1. Push all files to the GitHub repo:  
	```bash
	git push origin main
	```

1. Head over to [src/main.ts](src/main.ts) and start programming!

### Best Practices
We've collected some [best practices](https://github.com/ioBroker/ioBroker.repositories#development-and-coding-best-practices) regarding ioBroker development and coding in general. If you're new to ioBroker or Node.js, you should
check them out. If you're already experienced, you should also take a look at them - you might learn something new :)

### Scripts in `package.json`
Several npm scripts are predefined for your convenience. You can run them using `npm run <scriptname>`
| Script name | Description |
|-------------|-------------|
| `build:ts` | Compile the TypeScript sources. |
| `watch:ts` | Compile the TypeScript sources and watch for changes. |
| `watch` | Shortcut for `npm run watch:ts` |
| `test:ts` | Executes the tests you defined in `*.test.ts` files. |
| `test:package` | Ensures your `package.json` and `io-package.json` are valid. |
| `test:unit` | Tests the adapter startup with unit tests (fast, but might require module mocks to work). |
| `test:integration` | Tests the adapter startup with an actual instance of ioBroker. |
| `test` | Performs a minimal test run on package files and your tests. |
| `check` | Performs a type-check on your code (without compiling anything). |
| `lint` | Runs `ESLint` to check your code for formatting errors and potential bugs. |
| `release` | Creates a new release, see [`@alcalzone/release-script`](https://github.com/AlCalzone/release-script#usage) for more details. |

### Writing tests
When done right, testing code is invaluable, because it gives you the 
confidence to change your code while knowing exactly if and when 
something breaks. A good read on the topic of test-driven development 
is https://hackernoon.com/introduction-to-test-driven-development-tdd-61a13bc92d92. 
Although writing tests before the code might seem strange at first, but it has very 
clear upsides.

The template provides you with basic tests for the adapter startup and package files.
It is recommended that you add your own tests into the mix.

### Publishing the adapter
Using GitHub Actions, you can enable automatic releases on npm whenever you push a new git tag that matches the form 
`v<major>.<minor>.<patch>`. We **strongly recommend** that you do. The necessary steps are described in `.github/workflows/test-and-release.yml`.

Since you installed the release script, you can create a new
release simply by calling:
```bash
npm run release
```
Additional command line options for the release script are explained in the
[release-script documentation](https://github.com/AlCalzone/release-script#command-line).

To get your adapter released in ioBroker, please refer to the documentation 
of [ioBroker.repositories](https://github.com/ioBroker/ioBroker.repositories#requirements-for-adapter-to-get-added-to-the-latest-repository).

### Test the adapter manually with dev-server
Since you set up `dev-server`, you can use it to run, test and debug your adapter.

You may start `dev-server` by calling from your dev directory:
```bash
dev-server watch
```

The ioBroker.admin interface will then be available at http://localhost:9081/

Please refer to the [`dev-server` documentation](https://github.com/ioBroker/dev-server#command-line) for more details.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 0.1.0 (2026-11-15)
- Robust serial I/O (timeouts, complete frames, checksum validation)
- Startup gate: no control writes while the MultiPlus is booting
- Explicit switch/grid modes (`control.switch_state`, `control.grid_mode`)
- `set_assist` preserves the switch state and clamps to the device maximum
- Validated/retried writes, generic protocol validation, model roles, DC scaling fixes
- Unit tests for frames, controls, startup gate and model mapping

### 0.0.6 (2022-11-22)
- state changes -> mk2 queueing

### 0.0.5 (2022-11-22)
- timing bugfix

### 0.0.4 (2022-11-22)
- control of IBatBulk
- control of DisableCharge
- control of WeakACInput
- bug fixing portPath
- extended debug depends on ioBroker log level

### 0.0.3 (2022-11-20)
* connection stability

### 0.0.2 (2022-11-20)
* (joerg) initial release

## License
MIT License

Copyright (c) 2022 joerg <joerg.spoerl@gmx.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.