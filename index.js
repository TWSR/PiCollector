var configs = require("./config.json");
var fs = require("fs");
var http = require("http");
var express = require("express");
var app = express();
var mpu9250 = require("mpu9250");
var SerialPort = require("serialport");

configs.mpu.address = parseInt(configs.mpu.address, 16);
var mpu = new mpu9250(configs.mpu);

var port = new SerialPort(configs.gps.device, { baudRate: configs.gps.baudrate });

var httpServer = http.createServer(app);
var sp_buffer = "";
port.on("data", function (data) {
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

function checksumNMEA(str) {
  var c = 0;
  for(var i=0;i<str.length;i++) c ^= str[i].charCodeAt(0);
  return c;
}

function parseNMEA(buf) {
  var s = buf.substring(buf.indexOf("$")+1, buf.indexOf("\r\n"));
  var data = s.substring(0, s.indexOf("*"));
  var checksum = parseInt(s.substr(s.indexOf("*")+1), 16);
  // console.log("data: ", data);
  // console.log("checksum: ", checksum, "count_checksum: ", checksumNMEA(data));
  if (checksum === checksumNMEA(data) && data.indexOf("GPGGA") > -1) {
    return data.split(",");
  }

  return false;
}

function saveNMEA(data) {
  fs.appendFileSync("./data/geo.log", data.join(",") + "\n");
}

if (mpu.initialize()) {
  setInterval(reading, 17 /* 60 Hz */);
}
else {
  console.log("mpu9255 initialization failed ...");
}

function reading() {
  var m9 = mpu.getMotion9();
  // console.log('MPU VALUE : ', m9);
  // console.log('Temperature : ' + mpu.getTemperatureCelsius());
  fs.appendFileSync("./data/acc.log", m9.join(".") + "\n");
}


app.get("/data", http_get_data);

function http_get_data(req, res) {
  var data = {};

  if (fs.existsSync("./data/acc.log")) {
    var acc = fs.readFileSync("./data/acc.log", { encoding: "utf8" });
    accs = acc.trim().split("\n");
    data.acc = accs;
    fs.unlinkSync("./data/acc.log");
  }
  if (fs.existsSync("./data/geo.log")) {
    var geo = fs.readFileSync("./data/geo.log", { encoding: "utf8" });
    geos = geo.trim().split("\n");
    data.geo = geos;
    fs.unlinkSync("./data/geo.log");
  }
  res.send(JSON.stringify(data));
}

httpServer.listen(configs.port_number, function() {
  console.log("http listening 0.0.0.0:" + configs.port_number);
});
