#!/bin/bash

npm install
grep -rq 0x73 node_modules/mpu9250 || {
  (cd node_modules/mpu9250; patch < ../../patch/0001-modify-for-mpu9255.patch)
}
sudo $(dirname $0)/privilege.sh

