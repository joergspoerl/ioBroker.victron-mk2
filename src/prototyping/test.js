console.log("Use 'core' module")


var victron_mk2 = require("./io/victron_mk2");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    while (true) {
        var mk2 = new victron_mk2("/dev/ttyUSB1")
        t1 = Date.now()
        f = await mk2.receiveFrameSync()
        t2 = Date.now()
        console.log("zeit", t2-t1)
        console.log("f",f)


        // console.log("**********", (new Date()).toDateString())
        // try {
        //     a = await mk2.address()
        //     console.log("===========================", a)
        // } catch (Exception) {
        //     console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXX EXCEPTION", Exception)
        // }
        // await sleep(1000)


        // try {
        //     a = await mk2.get_state()
        //     console.log("===========================", a)
        // } catch (Exception) {
        //     console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXX EXCEPTION", Exception)

        // }
        // await sleep(1000)   


        try {
            a = await mk2.set_assist(0)
            console.log("===========================", a)
        } catch (Exception) {
            console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXX EXCEPTION", Exception)

        }
        await sleep(1000) 

        
        // try {
        //     a = await mk2.led_status()
        //     console.log("===========================", a)
        // } catch (Exception) {
        //     console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXX EXCEPTION", Exception)

        // }
        // await sleep(1000)


        // try {
        //     a = await mk2.dc_info()
        //     console.log("===========================", a)
        // } catch (Exception) {
        //     console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXX EXCEPTION", Exception)
        // }
        // await sleep(1000)

        // try {
        //     a = await mk2.ac_info()
        //     console.log("===========================", a)
        // } catch (Exception) {
        //     console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXX EXCEPTION", Exception)
        // }
        // await sleep(1000)


        console.log(mk2.data)
        
        
        mk2.close()

        sleep(4000*Math.random())
    }
    
})()

