import assert from 'node:assert'
import { types } from 'node:util'

import { FLAGS } from './constants'

import type { Socket } from 'node:net'

/* coverage ignore next */
export const socketFinalizationRegistry = new FinalizationRegistry((socket: Socket): void => {
  if (! socket.destroyed) socket.destroy()
})

export function typedArrayFlags(value: NodeJS.TypedArray): FLAGS {
  const flags =
    types.isUint8Array(value) ? FLAGS.UINT8ARRAY :
    types.isUint8ClampedArray(value) ? FLAGS.UINT8CLAMPEDARRAY :
    types.isUint16Array(value) ? FLAGS.UINT16ARRAY :
    types.isUint32Array(value) ? FLAGS.UINT32ARRAY :
    types.isInt8Array(value) ? FLAGS.INT8ARRAY :
    types.isInt16Array(value) ? FLAGS.INT16ARRAY :
    types.isInt32Array(value) ? FLAGS.INT32ARRAY :
    types.isBigUint64Array(value) ? FLAGS.BIGUINT64ARRAY :
    types.isBigInt64Array(value) ? FLAGS.BIGINT64ARRAY :
    types.isFloat32Array(value) ? FLAGS.FLOAT32ARRAY :
    types.isFloat64Array(value) ? FLAGS.FLOAT64ARRAY :
    assert.fail('Unsupported kind of TypedArray') // coverage ignore prev
  return flags
}

/* coverage ignore next */
export function logPromiseError(promise: Promise<any>, message: string): Promise<void> {
  /* eslint-disable-next-line no-console */
  return promise.catch((error) => console.log(message, error)).then(() => void 0)
}
