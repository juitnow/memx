import assert from 'assert'
import {
  isTypedArray,
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

import { ClusterAdapter, ClusterOptions } from './cluster'
import { FLAGS } from './constants'
import { ServerAdapter } from './server'
import { Adapter, Counter, Stats } from './types'

function toBuffer<T>(value: any, options: T): [ Buffer, T & { flags: number } ] {
  switch (typeof value) {
    case 'bigint':
      return [ Buffer.from(value.toString(), 'utf-8'), { ...options, flags: FLAGS.BIGINT } ]
    case 'string':
      return [ Buffer.from(value, 'utf-8'), { ...options, flags: FLAGS.STRING } ]
    case 'number':
    case 'boolean':
      return [ Buffer.from(JSON.stringify(value), 'utf-8'), { ...options, flags: FLAGS.STRING } ]
    case 'object':
      break // more checks below...
    default:
      throw new TypeError(`Unable to store value of type "${typeof value}"`)
  }

  if (Buffer.isBuffer(value)) {
    return [ value, { ...options, flags: FLAGS.BUFFER } ]
  }

  if (isTypedArray(value)) {
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
      undefined
    assert(flags, 'Unsupported kind of TypedArray')

    const buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    return [ buffer, { ...options, flags } ]
  }

  // here we have a typeof "object" (includes "null")... use JSON
  return [ Buffer.from(JSON.stringify(value), 'utf-8'), { ...options, flags: FLAGS.STRING } ]
}

function makeTypedArray<T extends NodeJS.TypedArray>(
  constructor: new (buffer: ArrayBuffer, offset?: number, length?: number) => T,
  source: Buffer,
  bytesPerValue: number,
): T {
  const clone = Buffer.from(source)
  const { buffer, byteOffset, byteLength } = clone
  return new constructor(buffer, byteOffset, byteLength / bytesPerValue)
}

export type Serializable = bigint | string | number | boolean | null | object
export type Appendable = string | NodeJS.TypedArray

export interface ClientResult<T extends Serializable> {
  value: T
  cas: bigint
}

export class Client {
  #adapter!: Adapter

  constructor()
  constructor(adapter: Adapter)
  constructor(options: ClusterOptions)

  constructor(adapterOrOptions?: Adapter | ClusterOptions) {
    if (! adapterOrOptions) {
      this.#adapter = new ServerAdapter()
    } else if ('get' in adapterOrOptions) {
      this.#adapter = adapterOrOptions
    } else if ('hosts' in adapterOrOptions) {
      this.#adapter = new ClusterAdapter(adapterOrOptions)
    }

    assert(this.#adapter, 'Invalid client constructor arguments')
  }

  async get<T extends Serializable>(key: string, options?: { ttl?: number }): Promise<ClientResult<T> | void> {
    const result = await this.#adapter.get(key, options)
    if (! result) return

    new Uint8Array()
    Uint16Array

    try {
      const { flags, value, cas } = result
      switch (flags) {
        case FLAGS.BIGINT:
          return { value: BigInt(value.toString('utf-8' )) as T, cas }
        case FLAGS.STRING:
          return { value: value.toString('utf-8' ) as T, cas }
        case FLAGS.JSON:
          return { value: JSON.parse(value.toString('utf-8' )) as T, cas }
        case FLAGS.BUFFER:
          return { value: Buffer.from(value) as T, cas }
        case FLAGS.UINT8ARRAY:
          return { value: makeTypedArray(Uint8Array, value, 1) as T, cas }
        case FLAGS.UINT8CLAMPEDARRAY:
          return { value: makeTypedArray(Uint8ClampedArray, value, 1) as T, cas }
        case FLAGS.UINT16ARRAY:
          return { value: makeTypedArray(Uint16Array, value, 2) as T, cas }
        case FLAGS.UINT32ARRAY:
          return { value: makeTypedArray(Uint32Array, value, 4) as T, cas }
        case FLAGS.INT8ARRAY:
          return { value: makeTypedArray(Int8Array, value, 1) as T, cas }
        case FLAGS.INT16ARRAY:
          return { value: makeTypedArray(Int16Array, value, 2) as T, cas }
        case FLAGS.INT32ARRAY:
          return { value: makeTypedArray(Int8Array, value, 4) as T, cas }
        case FLAGS.BIGUINT64ARRAY:
          return { value: makeTypedArray(BigUint64Array, value, 8) as T, cas }
        case FLAGS.BIGINT64ARRAY:
          return { value: makeTypedArray(BigInt64Array, value, 8) as T, cas }
        case FLAGS.FLOAT32ARRAY:
          return { value: makeTypedArray(Float32Array, value, 4) as T, cas }
        case FLAGS.FLOAT64ARRAY:
          return { value: makeTypedArray(Float64Array, value, 8) as T, cas }
        default:
          throw new Error(`Unsupported data type (flags=0x${flags.toString(16).padStart(8, '0')})`)
      }
    } finally {
      result.recycle()
    }
  }

  touch(key: string, options?: { ttl?: number }): Promise<boolean> {
    return this.#adapter.touch(key, options)
  }

  set(key: string, value: Serializable, options?: { cas?: bigint, ttl?: number }): Promise<bigint | void> {
    return this.#adapter.set(key, ...toBuffer(value, options))
  }

  add(key: string, value: Serializable, options?: { cas?: bigint, ttl?: number }): Promise<bigint | void> {
    return this.#adapter.add(key, ...toBuffer(value, options))
  }

  replace(key: string, value: Serializable, options?: { cas?: bigint, ttl?: number }): Promise<bigint | void> {
    return this.#adapter.replace(key, ...toBuffer(value, options))
  }

  append(
    key: string,
    value: Appendable,
    options?: { cas?: bigint },
  ): Promise<boolean> {
    return this.#adapter.append(key, ...toBuffer(value, options))
  }

  prepend(
    key: string,
    value: Appendable,
    options?: { cas?: bigint },
  ): Promise<boolean> {
    return this.#adapter.prepend(key, ...toBuffer(value, options))
  }

  increment(
    key: string,
    delta?: bigint | number,
    options?: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean },
  ): Promise<Counter | void> {
    return this.#adapter.increment(key, delta, options)
  }

  decrement(
    key: string,
    delta?: bigint | number,
    options?: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean },
  ): Promise<Counter | void> {
    return this.#adapter.decrement(key, delta, options)
  }

  delete(
    key: string,
    options?: { cas?: bigint },
  ): Promise<boolean> {
    return this.#adapter.delete(key, options)
  }

  flush(ttl?: number): Promise<void> {
    return this.#adapter.flush(ttl)
  }

  noop(): Promise<void> {
    return this.#adapter.noop()
  }

  quit(): Promise<void> {
    return this.#adapter.quit()
  }

  version(): Promise<Record<string, string>> {
    return this.#adapter.version()
  }

  stats(): Promise<Record<string, Stats>> {
    return this.#adapter.stats()
  }
}
