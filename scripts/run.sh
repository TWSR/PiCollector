#!/bin/sh

USER=$(stat -c "%U" $(realpath $0))
BASEDIR=$(realpath $(dirname $(realpath $0))/..)
DATE=$(date +%Y%m%d_%H%M%S)
su $USER -c " \
  cd $BASEDIR; \
  printf '$DATE\\tPiCollector Start ... \\n' | tee data/run.log; \
  (npm start > data/npm_start.log 2>&1 &); \
  echo $! > data/npm_start.pid
"


