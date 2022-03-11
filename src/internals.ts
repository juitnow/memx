// Keep these here: they must be ignored by Istanbul, but ESBUILD swallows
// commments (for a reason: https://github.com/evanw/esbuild/issues/578)

import assert from 'assert'
import type { Socket } from 'net'
import {
  isUint8Array,
  isUint8ClampedArray,
  isUint16Array,
  isUint32Array,
  isInt8Array,
  isInt16Array,
  isInt32Array,
  isBigUint64Array,
  isBigInt64Array,
  isFloat32Array,
  isFloat64Array,
} from 'util/types'

import { FLAGS } from './constants'

export const socketFinalizationRegistry = new FinalizationRegistry((socket: Socket): void => {
  if (! socket.destroyed) socket.destroy()
})

export function typedArrayFlags(value: NodeJS.TypedArray): FLAGS {
  const flags =
    isUint8Array(value) ? FLAGS.UINT8ARRAY :
    isUint8ClampedArray(value) ? FLAGS.UINT8CLAMPEDARRAY :
    isUint16Array(value) ? FLAGS.UINT16ARRAY :
    isUint32Array(value) ? FLAGS.UINT32ARRAY :
    isInt8Array(value) ? FLAGS.INT8ARRAY :
    isInt16Array(value) ? FLAGS.INT16ARRAY :
    isInt32Array(value) ? FLAGS.INT32ARRAY :
    isBigUint64Array(value) ? FLAGS.BIGUINT64ARRAY :
    isBigInt64Array(value) ? FLAGS.BIGINT64ARRAY :
    isFloat32Array(value) ? FLAGS.FLOAT32ARRAY :
    isFloat64Array(value) ? FLAGS.FLOAT64ARRAY :
    assert.fail('Unsupported kind of TypedArray')
  return flags
}

export function assertPromise(promise: Promise<any>, message: string): void {
  // eslint-disable-next-line no-console
  promise.catch((error) => console.log(message, error))
}
