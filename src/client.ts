import assert from 'node:assert'
import { types } from 'node:util'

import { ClusterAdapter } from './cluster'
import { EMPTY_BUFFER, FLAGS } from './constants'
import { typedArrayFlags } from './internals'

import type { ClusterOptions } from './cluster'
import type { Adapter, AdapterResult, Counter, Stats } from './types'

/** JSON replacere function serializing `bigint`, {@link Date}, {@link Set} and {@link Map}. */
function replacer(this: any, key: string, value: any): any {
  if (typeof this[key] === 'bigint') return [ '\0__$BIGINT$__\0', this[key].toString() ]
  if (this[key] instanceof Date) return [ '\0__$DATE$__\0', this[key].toISOString() ]
  if (this[key] instanceof Set) return [ '\0__$SET$__\0', ...value ]
  if (this[key] instanceof Map) return [ '\0__$MAP$__\0', ...value.entries() ]
  return value
}

/** JSON reviver function deserializing `bigint`, {@link Date}, {@link Set} and {@link Map}. */
function reviver(this: any, _key: string, value: any): any {
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

/** Convert a {@link Serializable} or {@link Appendable} value into a {@link Buffer}. */
function toBuffer<T>(value: Serializable | Appendable, options: T): [ Buffer, T & { flags: number } ] {
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
  if (types.isTypedArray(value)) {
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

/** Node's own types doesn't provide this... Make our own */
type TypedArrayConstructor<T extends NodeJS.TypedArray> = {
  new (buffer: ArrayBuffer, offset?: number, length?: number): T
  BYTES_PER_ELEMENT: number
}

function fromBuffer<T extends Serializable>(result: AdapterResult): ClientResult<T> {
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
        return { value: makeTypedArray(Uint8Array, value) as T, cas }
      case FLAGS.UINT8CLAMPEDARRAY:
        return { value: makeTypedArray(Uint8ClampedArray, value) as T, cas }
      case FLAGS.UINT16ARRAY:
        return { value: makeTypedArray(Uint16Array, value) as T, cas }
      case FLAGS.UINT32ARRAY:
        return { value: makeTypedArray(Uint32Array, value) as T, cas }
      case FLAGS.INT8ARRAY:
        return { value: makeTypedArray(Int8Array, value) as T, cas }
      case FLAGS.INT16ARRAY:
        return { value: makeTypedArray(Int16Array, value) as T, cas }
      case FLAGS.INT32ARRAY:
        return { value: makeTypedArray(Int32Array, value) as T, cas }
      case FLAGS.BIGUINT64ARRAY:
        return { value: makeTypedArray(BigUint64Array, value) as T, cas }
      case FLAGS.BIGINT64ARRAY:
        return { value: makeTypedArray(BigInt64Array, value) as T, cas }
      case FLAGS.FLOAT32ARRAY:
        return { value: makeTypedArray(Float32Array, value) as T, cas }
      case FLAGS.FLOAT64ARRAY:
        return { value: makeTypedArray(Float64Array, value) as T, cas }

      case FLAGS.BUFFER:
      default:
        return { value: Buffer.from(value) as T, cas }
    }
  } finally {
    result.recycle()
  }
}

/** Create a {@link NodeJS.TypedArray} copying the contents of its source {@link Buffer} */
function makeTypedArray<T extends NodeJS.TypedArray>(
    constructor: TypedArrayConstructor<T>,
    source: Buffer,
): T {
  const clone = Buffer.from(source)
  const { buffer, byteOffset, byteLength } = clone
  return new constructor(buffer, byteOffset, byteLength / constructor.BYTES_PER_ELEMENT)
}

/* ========================================================================== */

/** Types that can be serialized by our {@link MemxClient}. */
export type Serializable = bigint | string | number | boolean | null | object

/** Types that can be appended/prepended by our {@link MemxClient}. */
export type Appendable = string | NodeJS.TypedArray

/** The `ClientResult` interface associate a value with its _CAS_. */
export interface ClientResult<T extends Serializable> {
  /** The value returned by the {@link MemxClient} */
  value: T
  /** The _CAS_ of the value being returned */
  cas: bigint
}

/**
 * A `Client` represents a high-level client for a _Memcached_ server.
 */
export class MemxClient {
  #adapter!: Adapter
  #prefix: string

  /** Construct a new {@link MemxClient} from environment variables */
  constructor()
  /** Construct a new {@link MemxClient} wrapping an existing {@link Adapter} */
  constructor(adapter: Adapter)
  /** Construct a new {@link MemxClient} given the specified {@link ClusterOptions} */
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

  /** Return the {@link Adapter} backing this {@link MemxClient} instance */
  get adapter(): Adapter {
    return this.#adapter
  }

  /** Return the prefix prepended to all keys managed by this {@link MemxClient} */
  get prefix(): string {
    return this.#prefix
  }

  /** Return a new {@link MemxClient} prefixing keys with the specified `string` */
  withPrefix(prefix: string): MemxClient {
    assert(prefix, 'Invalid prefix')
    const client = new MemxClient(this.#adapter)
    client.#prefix = prefix
    return client
  }

  /** Get the value (or `undefined`) associated with the given key */
  async get<T extends Serializable>(key: string): Promise<T | undefined> {
    const result = await this.#adapter.get(this.#prefix + key)
    return result && fromBuffer<T>(result).value
  }

  /** Get the value (or `undefined`) associated with the given key, and update its TTL */
  async gat<T extends Serializable>(key: string, ttl: number): Promise<T | undefined> {
    const result = await this.#adapter.gat(this.#prefix + key, ttl)
    return result && fromBuffer<T>(result).value
  }

  /** Get the value and _CAS_ associated with the given key */
  async getc<T extends Serializable>(key: string): Promise<ClientResult<T> | undefined> {
    const result = await this.#adapter.get(this.#prefix + key)
    return result && fromBuffer(result)
  }

  /** Get the value and _CAS_ associated with the given key, and update its TTL */
  async gatc<T extends Serializable>(key: string, ttl: number): Promise<ClientResult<T> | undefined> {
    const result = await this.#adapter.gat(this.#prefix + key, ttl)
    return result && fromBuffer(result)
  }

  async set(key: string, value: Serializable, options?: { cas?: bigint, ttl?: number }): Promise<bigint | undefined> {
    return this.#adapter.set(this.#prefix + key, ...toBuffer(value, options))
  }

  async add(key: string, value: Serializable, options?: { ttl?: number }): Promise<bigint | undefined> {
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
      ttl?: number,
  ): Promise<boolean> {
    return this.#adapter.touch(this.#prefix + key, ttl)
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
