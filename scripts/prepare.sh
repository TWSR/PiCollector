#!/bin/sh

npm install
(cd node_modules/mpu9250; patch < ../../patch/0001-modify-for-mpu9255.patch)
sudo $(dirname $0)/privilege.sh
sudo $(dirname $0)/install.sh

