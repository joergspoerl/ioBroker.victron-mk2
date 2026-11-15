#!/usr/bin/env bash
# Reproducible deployment of the locally built adapter to pi4's ioBroker container.
# Replaces the previous manual tar swap (which once lost the adapter-local
# node_modules). Usage: scripts/deploy-pi4.sh
# Overrides: MK2_DEPLOY_HOST, MK2_DEPLOY_CONTAINER.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=${MK2_DEPLOY_HOST:-pi4}
CONTAINER=${MK2_DEPLOY_CONTAINER:-iob_iobroker}
VERSION=$(node -p "require('./package.json').version")
PKG="iobroker.victron-mk2-${VERSION}.tgz"

echo "[1/4] build + test + pack (${VERSION})"
npm run build
npm test
npm pack --silent >/dev/null

echo "[2/4] copy package and remote script to ${HOST}"
scp -q "$PKG" "$HOST:/tmp/"
scp -q scripts/deploy-pi4-remote.sh "$HOST:/tmp/"

echo "[3/4] install in container ${CONTAINER}"
ssh "$HOST" "sudo -n docker cp /tmp/$PKG $CONTAINER:/tmp/ && sudo -n docker cp /tmp/deploy-pi4-remote.sh $CONTAINER:/tmp/ && sudo -n docker exec $CONTAINER sh /tmp/deploy-pi4-remote.sh $VERSION"

echo "[4/4] done"
