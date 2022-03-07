#!/bin/bash

export PATH="${PATH}:./node_modules/.bin"
export NODE_OPTIONS='--enable-source-maps'

set -xe

rm -rf build dist
mkdir -p build dist

# Check types and generate .d.ts files
tsc
cp build/types/index.d.ts index.d.ts

# Prep sources and tests
esbuild --format=cjs build.ts | node -

set +e

# Run tests and collect coverage
nyc --reporter=html --reporter=text mocha 'build/test/**/*.test.js'

# Run bench
node --expose-gc ./build/test/bench.js

# Lint our code
eslint src test
