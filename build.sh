#!/bin/bash

export PATH="${PATH}:./node_modules/.bin"
export NODE_OPTIONS='--enable-source-maps'

set -xe

rm -rf build dist
mkdir -p build dist

# Check types and generate .d.ts files
tsc
tsc -p ./test

# Prep sources and tests
esbuild --format=cjs build.ts | node -

# Run tests and collect coverage
nyc --reporter=html --reporter=text mocha 'build/test/**/*.test.js'

# Run bench
node --expose-gc ./build/test/bench.js

# Extract and bundle our DTS
api-extractor run

# Lint our code
eslint src test
