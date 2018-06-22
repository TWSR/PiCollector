#!/bin/sh

[ $(id -u) -eq 0 ] || {
  echo "Are you root?"
  exit 1
}

ln -s $(realpath ./script/run.sh) /etc/rcS.d/S55picollector

