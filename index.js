var configs = require("./config.json");
var fs = require("fs");
var http = require("http");
var express = require("express");
var app = express();
var mpu9250 = require("mpu9250");
var SerialPort = require("serialport");

if (typeof configs.mpu.address === "string")
  configs.mpu.address = parseInt(configs.mpu.address, 16);
var mpu = new mpu9250(configs.mpu);

var serialport = new SerialPort(configs.gps.device, { baudRate: configs.gps.baudrate });

var httpServer = http.createServer(app);
var sp_buffer = "";
serialport.on("data", function (data) {
  sp_buffer += data;
  if (sp_buffer.indexOf("\r\n") > -1) {
    var nmea = parseNMEA(sp_buffer);
    // console.log("nmea: ", nmea);
    if (!!nmea) {
      saveNMEA(nmea);
    }
    sp_buffer = sp_buffer.slice(sp_buffer.indexOf("\r\n")+2);
  }
});

function date_string_get(date) {
	return date.getFullYear()
		+ "/" + ("00"+(date.getMonth()+1)).substr(-2,2)
		+ "/" + ("00"+date.getDate()).substr(-2,2)
		+ " " + ("00"+date.getHours()).substr(-2,2)
		+ ":" + ("00"+date.getMinutes()).substr(-2,2)
		+ ":" + ("00"+date.getSeconds()).substr(-2,2)
		+ "." + ("000"+date.getMilliseconds()).substr(-3,3);
}

function checksumNMEA(str) {
  var c = 0;
  for(var i=0;i<str.length;i++) c ^= str[i].charCodeAt(0);
  return c;
}

function NMEA2Degree(nmea) {
  var val = parseFloat(nmea);
  var natural = Math.floor(val/100);
  var real = (val/100 - natural) * 100 / 60;
  return natural + real;
}

function parseNMEA(buf) {
  var s = buf.substring(buf.indexOf("$")+1, buf.indexOf("\r\n"));
  var data = s.substring(0, s.indexOf("*"));
  var checksum = parseInt(s.substr(s.indexOf("*")+1), 16);
  // console.log("data: ", data);
  // console.log("checksum: ", checksum, "count_checksum: ", checksumNMEA(data));
  if (checksum === checksumNMEA(data) && data.indexOf("GPGGA") > -1) {
    var arr = data.split(",");
    var lat = arr[2], lon = arr[4], alt = arr[9];
    if (lat === "" || lon === "")
      return false;

    var date = date_string_get(new Date());
    var geo = {
      latitude: NMEA2Degree(lat),
      longitude: NMEA2Degree(lon),
      altitude: alt,
      number_satellites: arr[7],
      hdop: arr[8],
      time: date
    };
    return geo;
  }

  return false;
}

function saveNMEA(data) {
  // fs.appendFileSync("./data/geo.log", data.join(",") + "\n");
  fs.appendFileSync("./data/geo.log", JSON.stringify(data) + "\n");
}

function mpu_start() {
  if (mpu.initialize()) {
    setInterval(mpu_reading, 17 /* 60 Hz */);
  }
  else {
    console.log("mpu9255 initialization failed ...");
  }
}

var ACCEL_DIVIDERS = [ 16384, 8192, 4096, 2048 ];
var GYRO_DIVIDERS = [ 131.0, 65.5, 32.8, 16.4 ];

function mpu_reading() {
  var m6 = mpu.getMotion6();
  var gyro_divider = GYRO_DIVIDERS[mpu.getFullScaleGyroRange()];
  var accel_divider = ACCEL_DIVIDERS[mpu.getFullScaleAccelRange()];
  var date = date_string_get(new Date());
  var ori = {
    alpha: m6[3] / gyro_divider,
    beta: m6[4] / gyro_divider,
    gamma: m6[5] / gyro_divider,
    time: date
  };
  var mot = {
    gacc: {
      x: m6[0] / accel_divider,
      y: m6[1] / accel_divider,
      z: m6[2] / accel_divider,
    },
    time: date
  };

  fs.appendFileSync("./data/ori.log", JSON.stringify(ori) + "\n");
  fs.appendFileSync("./data/mot.log", JSON.stringify(mot) + "\n");
}

mpu_start();
app.get("/data", http_get_data);

function http_get_data(req, res) {
  var data = {};

  if (fs.existsSync("./data/mot.log")) {
    var mot = fs.readFileSync("./data/mot.log", { encoding: "utf8" });
    mots = mot.trim().split("\n");
    data.mot = [];
    mots.forEach(function(mot) {
      try {
        data.mot.push(JSON.parse(mot));
      } catch(e) {}
    });
    fs.unlinkSync("./data/mot.log");
  }
  if (fs.existsSync("./data/ori.log")) {
    var ori = fs.readFileSync("./data/ori.log", { encoding: "utf8" });
    oris = ori.trim().split("\n");
    data.ori = [];
    oris.forEach(function(ori) {
      try {
        data.ori.push(JSON.parse(ori));
      } catch(e) {}
    });
    fs.unlinkSync("./data/ori.log");
  }
  if (fs.existsSync("./data/geo.log")) {
    var geo = fs.readFileSync("./data/geo.log", { encoding: "utf8" });
    geos = geo.trim().split("\n");
    data.geo = [];
    geos.forEach(function(geo) {
      try {
        data.geo.push(JSON.parse(geo));
      } catch(e) {}
    });
    fs.unlinkSync("./data/geo.log");
  }
  res.send(JSON.stringify(data).replace(/},{/g, '},</br>{')
    .replace(/\],"/g, '],<br/>"'));
}

httpServer.listen(configs.port_number, function() {
  console.log("http listening 0.0.0.0:" + configs.port_number);
});
