var configs = require("./.config.json");
var fs = require("fs");
var uuidv1 = require("uuid/v1");
var url = require("url");
var http = require("http");
var https = require("https");
var express = require("express");
var app = express();
var mpu9250 = require("mpu9250");
var SerialPort = require("serialport");
var filters = require("./filters.js");
var record_raw = false;
var status_ok = true;
var raw_size = 0,
    index_size = 0;
var request = require('request');

// https send without tls check
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// default set green led on
fs.writeFileSync("/sys/class/leds/led0/trigger", "none");
fs.writeFileSync("/sys/class/leds/led0/brightness", "255");

if (!configs.uuid) {
    var mac_address = mac_address_get();
    var uuid = uuid_get(mac_address);
    configs.uuid = uuid;
    save_configs();
}

if (typeof configs.mpu.address === "string")
    configs.mpu.address = parseInt(configs.mpu.address, 16);
var mpu = new mpu9250(configs.mpu);

var serialport = new SerialPort(configs.gps.device, { baudRate: configs.gps.baudrate });

var httpServer = http.createServer(app);
var sp_buffer = "";
serialport.on("data", function(data) {
    sp_buffer += data;
    if (sp_buffer.indexOf("\r\n") > -1) {
        var nmea = parseNMEA(sp_buffer);
        // console.log("nmea: ", nmea);
        if (!!nmea) {
            saveNMEA(nmea);
        }
        sp_buffer = sp_buffer.slice(sp_buffer.indexOf("\r\n") + 2);
    }
});

serialport.on("error", function(error) {
    console.log("serialport error:", error);
    process.exit(1);
});

function date_string_get(date) {
    return date.getFullYear() +
        "/" + ("00" + (date.getMonth() + 1)).substr(-2, 2) +
        "/" + ("00" + date.getDate()).substr(-2, 2) +
        " " + ("00" + date.getHours()).substr(-2, 2) +
        ":" + ("00" + date.getMinutes()).substr(-2, 2) +
        ":" + ("00" + date.getSeconds()).substr(-2, 2) +
        "." + ("000" + date.getMilliseconds()).substr(-3, 3);
}

function uuid_get(mac_address) {
    return uuidv1({
        node: mac_address.split(":").map(function(x) { return parseInt(x, 16) }),
        clockseq: 0x8888,
        msecs: new Date("2017-08-08").getTime(),
        nsecs: 9999
    });
}

function mac_address_get() {
    var mac_address = "00:aa:bb:cc:dd:ee";

    if (fs.existsSync("/sys/class/net/eth0/address")) {
        mac_address = fs.readFileSync("/sys/class/net/eth0/address", { encoding: "utf8" });
    }

    console.log("mac_address: ", mac_address);

    return mac_address;
}

function save_configs() {
    fs.writeFileSync("./.config.json", JSON.stringify(configs, null, 2 /* indent 2 spaces */ ), {
        encoding: "utf8",
        mode: parseInt("0400", 8)
    });
    filters.configs = configs;
}

function checksumNMEA(str) {
    var c = 0;
    for (var i = 0; i < str.length; i++) c ^= str[i].charCodeAt(0);
    return c;
}

function NMEA2Degree(nmea) {
    var val = parseFloat(nmea);
    var natural = Math.floor(val / 100);
    var real = (val / 100 - natural) * 100 / 60;
    return natural + real;
}

function parseNMEA(buf) {
    var s = buf.substring(buf.indexOf("$") + 1, buf.indexOf("\r\n"));
    var data = s.substring(0, s.indexOf("*"));
    var checksum = parseInt(s.substr(s.indexOf("*") + 1), 16);
    // console.log("data: ", data);
    // console.log("checksum: ", checksum, "count_checksum: ", checksumNMEA(data));
    if (checksum === checksumNMEA(data) && data.indexOf("GPGGA") > -1) {
        var arr = data.split(",");
        var lat = arr[2],
            lon = arr[4],
            fix = arr[6],
            alt = arr[9];
        if (lat === "" || lon === "" || fix != "1") {
            // console.log(arr);
            return false;
        }

        var date = date_string_get(new Date());
        var geo = {
            latitude: NMEA2Degree(lat),
            longitude: NMEA2Degree(lon),
            altitude: alt,
            number_satellites: arr[7],
            hdop: arr[8],
            time: date,
            fix: fix
        };
        return geo;
    }

    return false;
}

function saveNMEA(data) {
    // fs.appendFileSync("./data/geo.log", data.join(",") + "\n");
    if (record_raw) {
        fs.appendFileSync("./data/geo.log", JSON.stringify(data) + "\n");
    }
    if (configs.debug) {
        var geo = {
            latitude: 25.058 + Math.random() / 1000.0,
            longitude: 121.524 + Math.random() / 1000.0,
            altitude: 99,
            accuracy: -1,
            time: data.time
        };
        if (geo_filter(geo) === false) return;
    } else {
        if (data.fix == 1) {
            var geo = {
                latitude: data.latitude,
                longitude: data.longitude,
                altitude: data.altitude,
                accuracy: data.hdop,
                time: data.time
            };
            if (geo_filter(geo) === false) return;
        }
    }
    //console.log('push geo');
}

function mpu_start() {
    if (mpu.initialize()) {
        setInterval(mpu_reading, 17 /* 60 Hz */ );
    } else {
        console.log("mpu9255 initialization failed ...");
        process.exit(1);
    }
}

var ACCEL_DIVIDERS = [16384, 8192, 4096, 2048];
var GYRO_DIVIDERS = [131.0, 65.5, 32.8, 16.4];

function mpu_reading() {
    var m6 = mpu.getMotion6();
    var m9 = mpu.getMotion9();
    var gyro_divider = GYRO_DIVIDERS[configs.mpu.GYRO_FS];
    var accel_divider = ACCEL_DIVIDERS[configs.mpu.ACCEL_FS];
    var date = date_string_get(new Date());

    var mot = {
        gacc: {
            x: m9[0] / accel_divider,
            y: m9[1] / accel_divider,
            z: m9[2] / accel_divider,
        },
        time: date
    };

    // var ang = calcOri(m9)
    var ori = {
        // alpha: m6[3] / gyro_divider,
        // beta: m6[4] / gyro_divider,
        // gamma: m6[5] / gyro_divider,

        // pitch: mpu.getPitch(m9),
        // roll: mpu.getRoll(m9),
        // yaw: calcYaw(m9, mpu.getRoll(m9) / 180 * 3.14, mpu.getPitch(m9) / 180 * 3.14),

        // pitch: ang[1],
        // roll: ang[0],
        // yaw: ang[2],

        pitch: 180 * Math.atan(mot.gacc.x / Math.sqrt(mot.gacc.y * mot.gacc.y + mot.gacc.z * mot.gacc.z)) / 3.14,
        roll: 180 * Math.atan(mot.gacc.y / Math.sqrt(mot.gacc.x * mot.gacc.x + mot.gacc.z * mot.gacc.z)) / 3.14,
        yaw: 180 * Math.atan(Math.sqrt(mot.gacc.x * mot.gacc.x + mot.gacc.x * mot.gacc.x) / mot.gacc.y) / 3.14,

        time: date
    };
    // console.log(ori)



    // var test = {
    //     pitch: 180 * Math.atan(mot.gacc.x / Math.sqrt(mot.gacc.y * mot.gacc.y + mot.gacc.z * mot.gacc.z)) / 3.14,
    //     roll: 180 * Math.atan(mot.gacc.y / Math.sqrt(mot.gacc.x * mot.gacc.x + mot.gacc.z * mot.gacc.z)) / 3.14,
    //     yaw: 180 * Math.atan(mot.gacc.z / Math.sqrt(mot.gacc.x * mot.gacc.x + mot.gacc.z * mot.gacc.z)) / 3.14,
    // }

    if (record_raw) {
        fs.appendFileSync("./data/ori.log", JSON.stringify(ori) + "\n");
        fs.appendFileSync("./data/mot.log", JSON.stringify(mot) + "\n");
    }
    // console.log(mot.gacc);
    // console.log(ori);

    ori_filter(ori);
    var mot1 = {
        gacc_x: mot.gacc.x,
        gacc_y: mot.gacc.y,
        gacc_z: mot.gacc.z,
        time: mot.time
    };
    var index = mot_filter(mot1);
    if (index) {
        // console.log(index);
        fs.appendFileSync("./data/index.log", JSON.stringify(index) + "\n");
    }
}

mpu_start();
app.use("/", express.static(__dirname + "/html"));

app.get("/config", http_get_config);
app.get("/name/:value?", http_get_name);
app.get("/vehicle/:value?", http_get_vehicle);
app.get("/push_raw/:url?", http_get_push_raw);
app.get("/push/:url?", http_get_push);
app.get("/data", http_get_data);

function http_get_config(req, res) {
    res.send(JSON.stringify(configs, null, 4));
}

function http_get_name(req, res) {
    if (req.params.value) {
        configs.name = req.params.value;
        save_configs();
    }
    res.send(configs.name);
}

function http_get_vehicle(req, res) {
    if (req.params.value) {
        configs.vehicle = req.params.value;
        save_configs();
    }
    res.send(configs.vehicle);
}

function http_get_push_raw(req, res) {
    if (req.params.url) {
        configs.push_raw_url = req.params.url;
        save_configs();
    }
    res.send(configs.push_raw_url);
}

function http_get_push(req, res) {
    if (req.params.url) {
        configs.push_url = req.params.url;
        save_configs();
    }
    res.send(configs.push_url);
}

function http_get_data(req, res) {
    var data = {};

    data.mot = get_saved_data("mot");
    data.ori = get_saved_data("ori");
    data.geo = get_saved_data("geo");

    remove_saved_data("mot");
    remove_saved_data("ori");
    remove_saved_data("geo");

    res.send(JSON.stringify(data).replace(/},{/g, '},</br>{')
        .replace(/\],"/g, '],<br/>"'));
}

function move_saved_data_to_temp_data(type) {
    if (typeof type !== "string") return data;
    var path = "./data/" + type + ".log";
    var temp_path = "./data/" + type + "_temp.log";
    var saved_path = "./data/" + type + "_saved.log";
    if (fs.existsSync(path)) {
        var str = fs.readFileSync(path, { encoding: "utf8" });
        var arr = str.split("\n");
        var data = [];
        arr.forEach(function(item) {
            try {
                data.push(JSON.parse(item));
            } catch (e) {}
        });
        fs.appendFileSync(temp_path, data.map(JSON.stringify).join("\n") + "\n", { encoding: "utf8" });
        fs.appendFileSync(saved_path, data.map(JSON.stringify).join("\n") + "\n", { encoding: "utf8" });
        remove_saved_data(type);
    }
}

function get_saved_data(type) {
    var data = [];
    if (typeof type !== "string") return data;
    var path = "./data/" + type + ".log";
    // console.log("type: ", type);
    if (fs.existsSync(path)) {
        var str = fs.readFileSync(path, { encoding: "utf8" });
        var arr = str.trim().split("\n");
        // console.log("arr: ", arr);
        arr.forEach(function(item) {
            // console.log("item: ", item);
            try {
                data.push(JSON.parse(item));
            } catch (e) {};
        });
    }
    return data;
}

function remove_saved_data(type) {
    if (typeof type !== "string") return data;
    var path = "./data/" + type + ".log";
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
    }
}

function send_index_to_server() {
    try {
        if (!configs.push_url) return;
        var send_url = url.parse(configs.push_url);
        // console.log("send_url: ", send_url);
        var protocol = http;
        if (send_url.protocol === "https:") protocol = https;
        var types = ["index"];
        var short_types = types.map(function(type) { return type });
        var short_types_temp = short_types.map(function(type) { return type + "_temp" });

        var cookies = "name=" + configs.name + ";" +
            "vehicle=" + configs.vehicle + ";" +
            "uuid=" + configs.uuid + ";";

        short_types.forEach(move_saved_data_to_temp_data);

        var req_data = get_saved_data(short_types_temp[0]);
        // console.log(req_data.length);

        req_data.forEach(pdata => {
            // console.log(pdata);
            // console.log(configs.push_url);

            request({
                url: configs.push_url,
                method: "POST",
                json: true,
                // body: { a: 'a', b: 'b' }
                body: { data: pdata }
            }, function(error, response, body) {
                if (error) {
                    console.log(error);
                    // console.log(response);
                } else {
                    // console.log('POST OK ' + pdata);
                }
            });

            // request.post(
            //     configs.push_url, pdata,
            //     function(error, response, body) {
            //         if (!error && response.statusCode == 200) {
            //             console.log(body)
            //         }
            //     }
            // );
            // var options = {
            //     hostname: send_url.hostname,
            //     port: send_url.port,
            //     path: send_url.path,
            //     method: "POST",
            //     headers: {
            //         "Content-Type": "application/x-www-form-urlencoded",
            //         "Content-Length": pdata.length,
            //         "Cookie": cookies
            //     }
            // };

            // var request = protocol.request(options, function(res) {
            //     // console.log("res status: ", res.statusCode);
            //     var res_data = "";
            //     res.on("data", function(chunk) {
            //         res_data += chunk;
            //     });

            //     res.on("end", function() {
            //         // console.log("res_data: ", res_data);
            //         green_led_blink_normal();
            //         if (res.statusCode === 200) {
            //             short_types_temp.forEach(remove_saved_data);
            //         }
            //     });
            // });

            // request.on("error", function(e) {
            //     console.log("request error: ", e);
            // });

            // index_size += pdata.length;
            // if (configs.send_size_show) {
            //     console.log("send index:\n\traw_size: " + raw_size + ", index_size: " + index_size + "\n\ttotal: " + (raw_size + index_size));
            // }
            // green_led_blink_fast();
            // console.log(pdata)
            // request.write(querystring.stringify(pdata));
            // request.end();
        });
    } catch (e) {
        console.log(e);
    }
}

function send_raw_to_server() {
    try {
        if (!configs.push_raw_url) return;
        var send_url = url.parse(configs.push_raw_url);
        var protocol = http;
        if (send_url.protocol === "https:") protocol = https;

        var types = ["orientations", "motions", "geolocations"];
        var short_types = types.map(function(type) { return type.substring(0, 3) });
        var short_types_temp = short_types.map(function(type) { return type + "_temp" });

        var cookies = "name=" + configs.name + ";" +
            "vehicle=" + configs.vehicle + ";" +
            "uuid=" + configs.uuid + ";";

        short_types.forEach(move_saved_data_to_temp_data);

        var req_data = {};
        for (var i = 0; i < types.length; i++) {
            req_data[types[i]] = get_saved_data(short_types_temp[i]);
        }

        var post_data = JSON.stringify(req_data);

        var options = {
            hostname: send_url.hostname,
            port: send_url.port,
            path: send_url.path,
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": post_data.length,
                "Cookie": cookies
            }
        };

        var request = protocol.request(options, function(res) {
            // console.log("res status: ", res.statusCode);

            var res_data = "";
            res.on("data", function(chunk) {
                res_data += chunk;
            });

            res.on("end", function() {
                // console.log("res_data: ", res_data);
                if (res.statusCode === 200) {
                    short_types_temp.forEach(remove_saved_data);
                }
            });
        });

        request.on("error", function(e) {
            // console.log("request error: ", e);
        });

        raw_size += post_data.length;
        console.log("send raw:\n\traw_size: " + raw_size + ", index_size: " + index_size + "\n\ttotal: " + (raw_size + index_size));
        request.write(post_data);
        request.end();
    } catch (e) {
        console.log(e);
    }
}

// setInterval(send_raw_to_server, 10000);
setInterval(send_index_to_server, 10000);
send_raw_to_server();
send_index_to_server();

httpServer.listen(configs.port_number, function() {
    console.log("http listening 0.0.0.0:" + configs.port_number);
    console.log('Debug Mode:' + configs.debug);
});

var green_led_on_timeout = 800;
var green_led_off_timeout = 200;

function green_led_blink() {
    fs.writeFileSync("/sys/class/leds/led0/brightness", "255");
    setTimeout(function() {
        fs.writeFileSync("/sys/class/leds/led0/brightness", "0");
    }, green_led_on_timeout);
    setTimeout(green_led_blink, green_led_on_timeout + green_led_off_timeout);
}
green_led_blink();

function green_led_blink_fast() {
    green_led_on_timeout = 200;
}

function green_led_blink_normal() {
    green_led_on_timeout = 800;
}

function calcHeading(x, y) {
    var heading = Math.atan2(y, x) * 180 / Math.PI;

    if (heading < -180) {
        heading += 360;
    } else if (heading > 180) {
        heading -= 360;
    }

    return heading;
}

function calcOri(m9) {
    var accel_divider = ACCEL_DIVIDERS[configs.mpu.ACCEL_FS];

    var accX = m9[0] / accel_divider;
    var accY = m9[1] / accel_divider;
    var accZ = m9[2] / accel_divider;

    var pitch = Math.atan(accX / (accY * accY + accZ * accZ));
    var roll = Math.atan(accY / (accY * accY + accZ * accZ));
    var Yh = (m9[7] * Math.cos(roll)) + (m9[8] * Math.sin(roll));
    var Xh = (m9[6] * Math.cos(pitch)) + (m9[7] * Math.sin(roll) * Math.sin(pitch)) + (m9[8] * Math.cos(roll) * Math.sin(pitch));
    return [roll / 3.14 * 180, pitch / 3.14 * 180, Math.atan2(-Yh, Xh) / 3.14 * 180];
}