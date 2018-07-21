var fs = require("fs");
var uuidv1 = require("uuid/v1");

var mac_address = fs.readFileSync("/sys/class/net/eth0/address", { encoding: "utf8" });

console.log("mac_address: ", mac_address);

var uuid = uuidv1({
  node: mac_address.split(":").map(function(x) { return parseInt(x, 16) }),
  clockseq: 0x1111,
  msecs: new Date().getTime(),
  nsecs: 2222
});

console.log("uuid: ", uuid);



