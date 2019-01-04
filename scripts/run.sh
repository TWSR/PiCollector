#!/bin/sh

USER=$(stat -c "%U" $(realpath $0))
BASEDIR=$(realpath $(dirname $(realpath $0))/..)
DATE=$(date +%Y%m%d_%H%M%S)

chown -R $USER:$USER $BASEDIR
$BASEDIR/scripts/picollector_update.sh
$BASEDIR/scripts/privilege.sh

su $USER -c " \
  cd $BASEDIR; \
  printf '$DATE\\tPiCollector Start ... \\n' | tee -a data/run.log; \
  npm start > data/npm_start.log 2>&1 &
"

