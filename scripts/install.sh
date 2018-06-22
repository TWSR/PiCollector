#!/bin/sh

[ $(id -u) -eq 0 ] || {
  echo "Are you root?"
  exit 1
}

grep -rq 'run.sh' /etc/rc.local || {
  line=$(wc -l /etc/rc.local | awk '{print $1}')
  path=$(realpath $(dirname $0)/run.sh)
  str=${line}i$path
  sed -i $str /etc/rc.local
}

