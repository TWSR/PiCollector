#!/bin/sh

[ $(id -u) -eq 0 ] || {
  echo "Are you root?"
  exit 1
}

chmod a+rw /dev/i2c-1
chmod a+rw /dev/ttyUSB0
chmod a+rw /sys/class/leds/led0/trigger
chmod a+rw /sys/class/leds/led0/brightness

