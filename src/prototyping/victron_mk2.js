var SerialPort = require('serialport');
var bp = require('bufferpack');

const EventEmitter = require('events');
class Mk2_emitter extends EventEmitter { }
const mk2_emitter = new Mk2_emitter();

// victron_mk2 object
//   encode & decode mk2 protocol over serial line
//   io interface for ellicode project

function round(number, decimal) {
    var e = Math.pow(10, decimal)
    return Math.round(number * e) / e
}


function victron_mk2(serialPortDevice) {
    console.log("new instant 'victron_mk2'")
    var self = this;
    var debug_log = true;

    self.data = {};                  // data container
    self.calc = {};                  // calc container scaling and offset
    self.meta = {                    // meta data
        info: "data from victron mk2"
    }

    //self.data = mk2.data;
    self.close = function () {
        port.close();
    }

    // open serial port
    var port = new SerialPort(serialPortDevice, {
        baudRate: 2400,
        // parser: SerialPort.parsers.byteDelimiter([255])
    }, async (error) => {

        if (!error) {
            console.log("mk2-dtr: on");

            // activate interface
            port.set({
                "dtr": true,
                "rts": false,
                "cts": false,
                "dts": false,
                "brk": false,
            })

            // port.flush( async ()=>{
            //     try {
            //         await self.address()
            //     }
            //     catch (e) {}

            // });


            // setTimeout(() => {
            //     //run();

            //     self.start();
            // },500)
        } else {
            // ERROR
            console.log("mk2 open port error: ", error)
        }
    });

    // helper function
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function frame_debug(txt, frame, data) {
        if (debug_log) {
            console.log("-------------------------------------------------------------------------------------")
            console.log(txt, frame);
            var legend = "       ";
            for (i = 0; i < frame.length; i++) {
                legend += i.toString().padStart(3, " ")
            }
            console.log(txt, legend)
            if (data) console.log(data)
            console.log("-------------------------------------------------------------------------------------")
        }
    }


    function create_frame(command, data) {
        var len = command.length + data.length + 1;
        var buf = Buffer.from([len, [0xFF]]);
        buf = Buffer.concat([buf, Buffer.from(command)]);
        buf = Buffer.concat([buf, Buffer.from(data)]);

        var sum = 0;
        for (var i = 0; i < buf.length; i++) {
            sum = sum + buf[i]
        }

        sum = 256 - sum % 256;
        buf = Buffer.concat([buf, Buffer.from([sum])]);

        //    console.log("SEND -> ", buf, buf.toString(), 'checksum',sum);
        frame_debug("SEND ->", buf);

        return buf;

    }


    self.queue = []
    self.busy = false
    // function add_queue (buffer, cb , resolve, reject) {
    //     self.queue.push( {
    //         buffer:  buffer,
    //         cb:      cb,
    //         resolve: resolve,
    //         reject:  reject
    //     })
    //     if (self.busy == false)
    //         process_queue();
    // }

    // function process_queue() {
    //     var c = self.queue.shift()
    //     if (c) {
    //         //console.log("shift", self.queue.length)
    //         self.busy = true
    //         setTimeout(() => {
    //             mk2_request (c.buffer, c.cb, c.resolve, c.reject)
    //         }, 100);
    //     } 
    // }

    function communicate(buffer, cb) {
        return new Promise(async (resolve, reject) => {
            await self.receiveFrame() // for syncing recive version frame
            port.write(buffer, () => {
                port.drain(() => {
                    port.flush(async () => {

                        let i = 0
                        while (true) {
                            i++
                            frame = await self.receiveFrame()
                            if (frame[1] != 255 || frame[2] != 86) {
                                resolve(cb(frame))
                                break
                            } else {
                                console.log("VERSION FRAME", frame)
                                if (i > 5) {
                                    reject("Out of sync !")
                                }
                            }
                        }




                    })
                })
            });
        })
    }

    this.receiveFrame = function () {
        return new Promise(async (resolve, reject) => {
            let f
            while (true) {
                a = port.read(1)
                // console.log(a)
                if (a != null) {
                    console.log()
                    console.log("length", a[0])
                    await sleep(100)
                    b = port.read(a[0] + 1)
                    f = Buffer.concat([a, b])
                    if (f && f.length >= 1 && (f[1] == 0xFF || f[1] == 0x20)) {
                        frame_debug("RECV <-", f);
                        break
                    }
                    console.log(f)
                }
                await sleep(10)

            }
            console.log("frame: ", f)
            resolve(f)
        })
    }


    this.receiveFrameSync = function () {
        return new Promise(async (resolve, reject) => {
            let f
            port.flush(async () => {
                while (true) {
                    f = port.read(1)
                    //console.log(a)

                    if (f && f[0] == 0xFF) {
                        await sleep(100)
                        f = port.read(7)
                        //console.log(a)
                        break
                    }
                    await sleep(10)

                }
                console.log("sync: ")
                resolve(f)
            })

        })
    }

    function checksum(buffer) {
        var sum = 0;
        for (var i = 0; i < buffer.length; i++) {
            sum = sum + buffer[i]
        }
        check = sum % 256;
        //console.log("checksum",check)
        return check == 0 ? true : false;
    }


    this.address = async function () {
        return communicate(create_frame("A", "\x01\x00"), (frame) => {
            console.log("A", frame);
            return {
                address: {
                    content: "address is set 0x00"
                }
            }
        })
    }

    this.led_status = async function () {
        return communicate(create_frame("L", ""), (frame) => {
            var led_status = frame[3];
            var led_blink = frame[4];

            return {
                led_status: {
                    'mains': ((led_status & 1) > 0 ? ((led_blink & 1) > 0 ? 'blink' : 'on') : 'off'),
                    'absorption': ((led_status & 2) > 0 ? ((led_blink & 2) > 0 ? 'blink' : 'on') : 'off'),
                    'bulk': ((led_status & 4) > 0 ? ((led_blink & 4) > 0 ? 'blink' : 'on') : 'off'),
                    'float': ((led_status & 8) > 0 ? ((led_blink & 8) > 0 ? 'blink' : 'on') : 'off'),
                    'inverter': ((led_status & 16) > 0 ? ((led_blink & 16) > 0 ? 'blink' : 'on') : 'off'),
                    'overload': ((led_status & 32) > 0 ? ((led_blink & 32) > 0 ? 'blink' : 'on') : 'off'),
                    'low bat': ((led_status & 64) > 0 ? ((led_blink & 64) > 0 ? 'blink' : 'on') : 'off'),
                    'temp': ((led_status & 128) > 0 ? ((led_blink & 128) > 0 ? 'blink' : 'on') : 'off'),
                }
            }
        });
    }

    this.umains_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x00\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                umains_calc: {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }

    this.imains_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x01\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                imains_calc: {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }

    this.uinv_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x02\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                uinv_calc: {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }

    this.iinv_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x03\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                iinv_calc: {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }

    this.ubat_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x04\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                ubat_calc:
                {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }

    this.ibat_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x05\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                ibat_calc: {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }

    this.finv_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x07\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                finv_calc: {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }

    this.fmains_calc_load = async function () {
        return communicate(create_frame("W", "\x36\x08\x00"), (frame) => {
            var data = bp.unpack('<h B h', frame, 4)
            return {
                fmains_calc: {
                    scale: data[0],
                    offset: data[2]
                }
            }
        });
    }


    function scale(factor) {
        s = Math.abs(factor)
        if (s >= 0x4000)
            return 1.0 / (0x8000 - s)
        return s
    }


    this.dc_info = async function () {
        if (!self.calc.ubat_calc) Object.assign(self.calc, await self.ubat_calc_load());
        if (!self.calc.ibat_calc) Object.assign(self.calc, await self.ibat_calc_load());
        if (!self.calc.finv_calc) Object.assign(self.calc, await self.finv_calc_load());

        console.log("self.calc", self.calc)

        return communicate(create_frame("F", "\x00"), async (frame) => {

            if (frame[0] != 0x0f || frame[1] != 0x20 || frame[2] != 0xb5) {
                return { error: "no dc_info frame" }
            }

            var ubat = bp.unpack('<H', frame, 7);
            //if (frame[11] < 0x80) { frame  }
            ibat_buf = Buffer.concat([frame.slice(9, 12), Buffer.from("\x00"), Buffer.from(frame[11] > 0x80 ? "\x00" : "\xFF")])
            cbat_buf = Buffer.concat([frame.slice(12, 15), Buffer.from("\x00"), Buffer.from(frame[14] > 0x80 ? "\x00" : "\xFF")])
            var ibat = bp.unpack('<i', ibat_buf);
            var cbat = bp.unpack('<i', cbat_buf);
            var finv = bp.unpack('<B', frame, 15);

            return {
                dc_info: {
                    ubat: round(((ubat + self.calc.ubat_calc.offset) * scale(self.calc.ubat_calc.scale) / 10), 2),
                    ibat: round(((ibat + self.calc.ibat_calc.offset) * scale(self.calc.ibat_calc.scale) / 10), 2),
                    cbat: round(((cbat + self.calc.ibat_calc.offset) * scale(self.calc.ibat_calc.scale) / 10), 2),
                    finv: round((10 / ((finv + self.calc.finv_calc.offset) * scale(self.calc.finv_calc.scale))), 2),
                }
            }
        });
    }

    this.ac_info = async function () {
        if (!self.calc.umains_calc) Object.assign(self.calc, await self.umains_calc_load());
        if (!self.calc.imains_calc) Object.assign(self.calc, await self.imains_calc_load());
        if (!self.calc.uinv_calc) Object.assign(self.calc, await self.uinv_calc_load());
        if (!self.calc.iinv_calc) Object.assign(self.calc, await self.iinv_calc_load());
        if (!self.calc.fmains_calc) Object.assign(self.calc, await self.fmains_calc_load());

        return communicate(create_frame("F", "\x01"), (frame) => {

            if (frame[0] != 0x0f || frame[1] != 0x20 || frame[2] != 0x01) {
                return { error: "no ac_info frame" }
            }

            var data = bp.unpack("<H h H h B", frame, 7)
            var umains = data[0];
            var imains = data[1];
            var uinv = data[2];
            var iinv = data[3];
            var fmains = data[4]

            return {
                ac_info: {
                    umains: round(((umains + self.calc.umains_calc.offset) * scale(self.calc.umains_calc.scale)), 1),
                    imains: round(((imains + self.calc.imains_calc.offset) * scale(self.calc.imains_calc.scale)), 1),
                    uinv: round(((uinv + self.calc.uinv_calc.offset) * scale(self.calc.uinv_calc.scale)), 1),
                    iinv: round(((iinv + self.calc.iinv_calc.offset) * scale(self.calc.iinv_calc.scale)), 1),
                    fmains: round((10 / ((fmains + self.calc.fmains_calc.offset) * scale(self.calc.fmains_calc.scale))), 1)
                }
            }
        });
    }

    this.master_multi_led_info = async function () {
        return communicate(create_frame("F", "\x05"), (frame) => {

            if (frame[0] != 0x0f || frame[1] != 0x20) {
                return { error: "no master_multi_led_info frame" }
            }

            var data = bp.unpack('<H H H', frame, 7)

            return {
                name: "master_multi_led_info",
                min_limit: data[0] / 10.0,
                max_limit: data[1] / 10.0,
                limit: data[2] / 10.0
            }
        });
    }

    const states = {
        "00": 'down',
        "10": 'startup',
        "20": 'off',
        "30": 'slave',
        "40": 'invert full',
        "50": 'invert half',
        "60": 'invert aes',
        "70": 'assist',
        "80": 'bypass',
        "90": 'charge init',
        "91": 'charge bulk',
        "92": 'charge absorption',
        "93": 'charge float',
        "94": 'charge storage',
        "95": 'charge repeated absorption',
        "96": 'charge forced absorption',
        "97": 'charge equalise',
        "98": 'charge bulk stopped',
    }

    this.get_state = async function () {
        return communicate(create_frame("W", "\x0E\x00\x00"), (frame) => {
            var data = bp.unpack('<B B', frame, 4)
            var state = "" + data[0] + data[1];
            return {
                get_state: {
                    state: states[state]
                }
            }
        })
    }

    // Set the ampere level for PowerAssist.
    this.set_assist = async function (ampere) {
        var a = ampere * 10
        var lo = a & 0xFF
        var hi = a >> 8
        var data = Buffer.from([0x03, lo, hi, 0x01, 0x80])

        return communicate(create_frame("S", data), (frame) => {
            return {
                set_assist: {
                    setlimit: ampere
                }
            }
        })
    }

    this.get_data = async function () {
        return self.data
    }


    this.start = async function () {

        this.running = setInterval(async () => {
            try {
                Object.assign(self.data, await self.dc_info());
                Object.assign(self.data, await self.ac_info());
                Object.assign(self.data, await self.led_status());
                Object.assign(self.data, await self.get_state());

                if (self.debug_log === true) {
                    console.log('data', JSON.stringify(self.data));
                }
            }
            catch (exception) {
                console.log("Exception in mk2 start(): ", exception)
            }
        }, 2000)

    }

    this.stop = async function () {
        Interval.Clear(self.running);
    }

    return self
}


module.exports = victron_mk2;