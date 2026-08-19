#!/bin/bash
cd "$(dirname "$0")/.." || exit

echo "Compressing"

if [ -f ./build/asphyxia-core-armv7 ]; then
  rm -f ./build/asphyxia-core-armv7.zip
  cd build
  zip -qq asphyxia-core-armv7.zip asphyxia-core-armv7
  cd ..
else
  echo "armv7 binary not present, skipping"
fi

rm -f ./build/asphyxia-core-arm64.zip
cd build
zip -qq asphyxia-core-arm64.zip asphyxia-core-arm64
cd ..
