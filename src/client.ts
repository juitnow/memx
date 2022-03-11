import assert from 'assert'
import { isTypedArray } from 'util/types'

import { ClusterAdapter, ClusterOptions } from './cluster'
import { EMPTY_BUFFER, FLAGS } from './constants'
import { typedArrayFlags } from './internals'
import { Adapter, Counter, Stats } from './types'

function replacer(this: any, key: string, value: any): any {
  if (typeof this[key] === 'bigint') return [ '\0__$BIGINT$__\0', this[key].toString() ]
  if (this[key] instanceof Date) return [ '\0__$DATE$__\0', this[key].toISOString() ]
  if (this[key] instanceof Set) return [ '\0__$SET$__\0', ...value ]
  if (this[key] instanceof Map) return [ '\0__$MAP$__\0', ...value.entries() ]
  return value
}

function reviver(this: any, key: string, value: any): any {
  if (Array.isArray(value)) {
    switch (value[0]) {
      case '\0__$BIGINT$__\0': return BigInt(value[1])
      case '\0__$DATE$__\0': return new Date(value[1])
      case '\0__$SET$__\0': return new Set(value.slice(1))
      case '\0__$MAP$__\0': return new Map(value.slice(1))
    }
  }
  return value
}


function toBuffer<T>(value: any, options: T): [ Buffer, T & { flags: number } ] {
  if (Buffer.isBuffer(value)) return [ value, { ...options, flags: FLAGS.BUFFER } ]

  switch (typeof value) {
    case 'bigint':
      return [ Buffer.from(value.toString(), 'utf-8'), { ...options, flags: FLAGS.BIGINT } ]
    case 'boolean':
      return [ Buffer.alloc(1, value ? 0xff : 0x00), { ...options, flags: FLAGS.BOOLEAN } ]
    case 'number':
      return [ Buffer.from(value.toString(), 'utf-8'), { ...options, flags: FLAGS.NUMBER } ]
    case 'string':
      return [ Buffer.from(value, 'utf-8'), { ...options, flags: FLAGS.STRING } ]
    case 'object':
      break // more checks below...
    default:
      assert.fail(`Unable to store value of type "${typeof value}"`)
  }

  // typed arrays are special
  if (isTypedArray(value)) {
    const flags = typedArrayFlags(value)
    const buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    return [ buffer, { ...options, flags } ]
  }

  // null is also special...
  if (value === null) return [ EMPTY_BUFFER, { ...options, flags: FLAGS.NULL } ]

  // any other "object" gets serialized as JSON
  const json = JSON.stringify(value, replacer)
  return [ Buffer.from(json, 'utf-8'), { ...options, flags: FLAGS.JSON } ]
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
  #prefix: string

  constructor()
  constructor(adapter: Adapter)
  constructor(options: ClusterOptions)

  constructor(adapterOrOptions?: Adapter | ClusterOptions) {
    if (! adapterOrOptions) {
      this.#adapter = new ClusterAdapter()
    } else if ('get' in adapterOrOptions) {
      this.#adapter = adapterOrOptions
    } else if ('hosts' in adapterOrOptions) {
      this.#adapter = new ClusterAdapter(adapterOrOptions)
    }

    this.#prefix = ''

    assert(this.#adapter, 'Invalid client constructor arguments')
  }

  get adapter(): Adapter {
    return this.#adapter
  }

  get prefix(): string {
    return this.#prefix
  }

  withPrefix(prefix: string): Client {
    assert(prefix, 'Invalid prefix')
    const client = new Client(this.#adapter)
    client.#prefix = prefix
    return client
  }

  async get<T extends Serializable>(key: string, options?: { ttl?: number }): Promise<ClientResult<T> | undefined> {
    const result = await this.#adapter.get(this.#prefix + key, options)
    if (! result) return

    try {
      const { flags, value, cas } = result
      switch (flags) {
        case FLAGS.BIGINT:
          return { value: BigInt(value.toString('utf-8')) as T, cas }
        case FLAGS.BOOLEAN:
          return { value: !!value[0] as T, cas }
        case FLAGS.NUMBER:
          return { value: Number(value.toString('utf-8' )) as T, cas }
        case FLAGS.STRING:
          return { value: value.toString('utf-8' ) as T, cas }

        case FLAGS.NULL:
          return { value: null as T, cas }
        case FLAGS.JSON:
          return { value: JSON.parse(value.toString('utf-8' ), reviver) as T, cas }

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
          return { value: makeTypedArray(Int32Array, value, 4) as T, cas }
        case FLAGS.BIGUINT64ARRAY:
          return { value: makeTypedArray(BigUint64Array, value, 8) as T, cas }
        case FLAGS.BIGINT64ARRAY:
          return { value: makeTypedArray(BigInt64Array, value, 8) as T, cas }
        case FLAGS.FLOAT32ARRAY:
          return { value: makeTypedArray(Float32Array, value, 4) as T, cas }
        case FLAGS.FLOAT64ARRAY:
          return { value: makeTypedArray(Float64Array, value, 8) as T, cas }

        case FLAGS.BUFFER:
        default:
          return { value: Buffer.from(value) as T, cas }
      }
    } finally {
      result.recycle()
    }
  }

  async set(key: string, value: Serializable, options?: { cas?: bigint, ttl?: number }): Promise<bigint | undefined> {
    return this.#adapter.set(this.#prefix + key, ...toBuffer(value, options))
  }

  async add(key: string, value: Serializable, options?: { cas?: bigint, ttl?: number }): Promise<bigint | undefined> {
    return this.#adapter.add(this.#prefix + key, ...toBuffer(value, options))
  }

  async replace(key: string, value: Serializable, options?: { cas?: bigint, ttl?: number }): Promise<bigint | undefined> {
    return this.#adapter.replace(this.#prefix + key, ...toBuffer(value, options))
  }

  append(
    key: string,
    value: Appendable,
    options?: { cas?: bigint },
  ): Promise<boolean> {
    return this.#adapter.append(this.#prefix + key, ...toBuffer(value, options))
  }

  prepend(
    key: string,
    value: Appendable,
    options?: { cas?: bigint },
  ): Promise<boolean> {
    return this.#adapter.prepend(this.#prefix + key, ...toBuffer(value, options))
  }

  async increment(
    key: string,
    delta?: bigint | number,
    options?: { initial?: bigint | number, cas?: bigint, ttl?: number },
  ): Promise<Counter | undefined> {
    const counter = await this.#adapter.increment(this.#prefix + key, delta, options)

    if ((options?.initial !== undefined) && (counter?.value === BigInt(options.initial))) {
      const cas = await this.replace(key, counter.value, { cas: counter.cas, ttl: options.ttl })
      counter.cas = cas ?? counter.cas
    }
    return counter
  }

  async decrement(
    key: string,
    delta?: bigint | number,
    options?: { initial?: bigint | number, cas?: bigint, ttl?: number },
  ): Promise<Counter | undefined> {
    const counter = await this.#adapter.decrement(this.#prefix + key, delta, options)

    if ((options?.initial !== undefined) && (counter?.value === BigInt(options.initial))) {
      const cas = await this.replace(key, counter.value, { cas: counter.cas, ttl: options.ttl })
      counter.cas = cas ?? counter.cas
    }
    return counter
  }

  touch(
    key: string,
    options?: { ttl?: number },
  ): Promise<boolean> {
    return this.#adapter.touch(this.#prefix + key, options)
  }

  delete(
    key: string,
    options?: { cas?: bigint },
  ): Promise<boolean> {
    return this.#adapter.delete(this.#prefix + key, options)
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
