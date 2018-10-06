#!/bin/sh

[ $(id -u) -eq 0 ] || {
  echo "Are you root?"
  exit 1
}

USER=$(stat -c "%U" $(realpath $0))
BASEDIR=$(realpath $(dirname $0)/..)

cd $BASEDIR
[ -n "$(git status | grep behind)" ] && {
  now=$(date '+[%Y/%m/%d %H:%M:%S]')
  echo "${now}\tpatch found from github, updating ..." | tee -a data/update.log
  fuser -k 3000/tcp | tee -a data/update.log
  su $USER -c "cd $BASEDIR; git pull | tee -a data/update.log"
  $BASEDIR/scripts/run.sh
}

