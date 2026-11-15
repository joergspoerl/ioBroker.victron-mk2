#!/bin/sh
# Runs INSIDE the ioBroker container (via docker exec). Argument: version.
# Keeps the adapter-local node_modules, restores them from the newest backup if
# they are missing, and verifies the instance version plus a live state.
set -e
VERSION=$1
PKG="iobroker.victron-mk2-${VERSION}.tgz"
TARGET=/opt/iobroker/node_modules/iobroker.victron-mk2

echo "stop adapter and back up the previous version"
mkdir -p /opt/iobroker/backups
iobroker stop victron-mk2.0 >/dev/null 2>&1 || true
sleep 2
if [ -d "$TARGET" ]; then
	tar czf "/opt/iobroker/backups/iobroker.victron-mk2-before-${VERSION}-$(date +%F-%H%M).tgz" -C /opt/iobroker/node_modules iobroker.victron-mk2
fi

echo "install ${VERSION}"
rm -rf /tmp/vm2new /tmp/vm2old
mkdir -p /tmp/vm2new
tar xzf "/tmp/$PKG" -C /tmp/vm2new
if [ -d "$TARGET" ]; then
	mv "$TARGET" /tmp/vm2old
fi
cp -a /tmp/vm2new/package "$TARGET"
if [ -d /tmp/vm2old/node_modules ]; then
	cp -a /tmp/vm2old/node_modules "$TARGET/node_modules"
fi
if [ ! -d "$TARGET/node_modules/serialport" ]; then
	echo "adapter-local dependencies missing - restoring them from the latest backup"
	rm -rf /tmp/vm2deps
	mkdir -p /tmp/vm2deps
	tar xzf "$(ls -t /opt/iobroker/backups/iobroker.victron-mk2-*.tgz | head -1)" -C /tmp/vm2deps
	cp -a /tmp/vm2deps/iobroker.victron-mk2/node_modules "$TARGET/node_modules"
fi
chown -R iobroker:iobroker "$TARGET"

echo "start adapter and verify"
iobroker start victron-mk2.0 >/dev/null
sleep 20
iobroker object get system.adapter.victron-mk2.0 | grep -o "\"version\":\"${VERSION}\"" | head -1
echo "state.state:      $(iobroker state getValue victron-mk2.0.state.state)"
echo "info.connection:  $(iobroker state getValue victron-mk2.0.info.connection)"
