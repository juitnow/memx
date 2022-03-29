import { Adapter, AdapterResult, Counter, Stats } from './types'
import { MemxClient } from './client'

interface Entry {
  value: Buffer,
  flags: number,
  cas: bigint,
  exp: number,
}

function toExp(ttl: number = 0): number {
  if (ttl === 0) return Number.MAX_SAFE_INTEGER
  return Date.now() + (ttl * 1000)
}

export class FakeAdapter implements Adapter {
  #cache = new Map<string, Entry>()
  #cas = 1n

  readonly ttl = 0

  #get(key: string): Entry | undefined {
    if (key.length > 250) throw new TypeError(`Key too long (len=${key.length})`)
    const entry = this.#cache.get(key)
    if (! entry) return

    if (Date.now() > entry.exp) {
      this.#cache.delete(key)
      return
    }

    return entry
  }

  #set(key: string, value: Buffer, flags?: number, ttl?: number): bigint {
    this.#cache.set(key, {
      value: value,
      flags: flags || 0,
      cas: ++this.#cas,
      exp: toExp(ttl),
    })
    return this.#cas
  }

  async get(
    key: string,
  ): Promise<AdapterResult | undefined> {
    const entry = this.#get(key)
    if (! entry) return

    return {
      value: entry.value,
      flags: entry.flags,
      cas: entry.cas,
      recycle: () => void 0,
    }
  }

  async gat(
    key: string,
    ttl: number,
  ): Promise<AdapterResult | undefined> {
    const entry = this.#get(key)
    if (! entry) return

    entry.exp = toExp(ttl)

    return {
      value: entry.value,
      flags: entry.flags,
      cas: entry.cas,
      recycle: () => void 0,
    }
  }

  async touch(
    key: string,
    ttl: number,
  ): Promise<boolean> {
    const entry = this.#get(key)
    if (entry) entry.exp = toExp(ttl)
    return !! entry
  }

  async set(
    key: string,
    value: Buffer,
    options: { flags?: number; cas?: bigint; ttl?: number } = {},
  ): Promise<bigint | undefined> {
    const entry = this.#get(key)
    if (entry && (options.cas !== undefined) && (entry.cas !== options.cas)) {
      return
    }

    return this.#set(key, value, options.flags, options.ttl)
  }

  async add(
    key: string,
    value: Buffer,
    options: { flags?: number; ttl?: number } = {},
  ): Promise<bigint | undefined> {
    if (this.#get(key)) return
    return this.#set(key, value, options.flags, options.ttl)
  }

  async replace(
    key: string,
    value: Buffer,
    options: { flags?: number; cas?: bigint; ttl?: number } = {},
  ): Promise<bigint | undefined> {
    if (! this.#get(key)) return
    return this.#set(key, value, options.flags, options.ttl)
  }

  async append(
    key: string,
    value: Buffer,
    options: { cas?: bigint } = {},
  ): Promise<boolean> {
    const entry = this.#get(key)
    if (! entry) return false

    if ((options.cas !== undefined) && (options.cas !== entry.cas)) return false

    entry.value = Buffer.concat([ entry.value, value ])
    return true
  }

  async prepend(
    key: string,
    value: Buffer,
    options: { cas?: bigint } = {},
  ): Promise<boolean> {
    const entry = this.#get(key)
    if (! entry) return false

    if ((options.cas !== undefined) && (options.cas !== entry.cas)) return false

    entry.value = Buffer.concat([ value, entry.value ])
    return true
  }

  async #counter(
    key: string,
    delta: number | bigint,
    options: { initial?: number | bigint; cas?: bigint; ttl?: number; create?: boolean },
  ): Promise<Counter | undefined> {
    const entry = this.#get(key)

    if (! entry) {
      if (options.initial !== undefined) {
        const value = Buffer.from(options.initial.toString())
        this.#set(key, value, undefined, options.ttl)
        return { value: BigInt(options.initial), cas: this.#cas }
      } else {
        return
      }
    }

    if ((options.cas !== undefined) && (options.cas !== entry.cas)) return

    try {
      const value = BigInt(entry.value.toString('utf-8')) + BigInt(delta)
      this.#set(key, Buffer.from(value.toString()), undefined, options.ttl)
      return { value, cas: this.#cas }
    } catch (error: any) {
      throw new TypeError(`${error.message} (status=NON_NUMERIC_VALUE, key=${key})`)
    }
  }

  increment(
    key: string,
    delta: number | bigint = 1n,
    options: { initial?: number | bigint; cas?: bigint; ttl?: number; create?: boolean } = {},
  ): Promise<Counter | undefined> {
    return this.#counter(key, delta, options)
  }

  decrement(
    key: string,
    delta: number | bigint = 1n,
    options: { initial?: number | bigint; cas?: bigint; ttl?: number; create?: boolean } = {},
  ): Promise<Counter | undefined> {
    return this.#counter(key, -delta, options)
  }

  async delete(
    key: string,
    options: { cas?: bigint } = {},
  ): Promise<boolean> {
    const entry = this.#get(key)
    if (entry && (options.cas !== undefined) && (entry.cas !== options.cas)) {
      return false
    }

    return this.#cache.delete(key)
  }

  async flush(
    ttl?: number,
  ): Promise<void> {
    if (! ttl) return this.#cache.clear()

    const wait = toExp(ttl) - Date.now()
    setTimeout(() => this.#cache.clear(), wait)
  }

  async noop(): Promise<void> {
    // noop!
  }
  async quit(): Promise<void> {
    // noop!
  }

  async version(): Promise<Record<string, string>> {
    return { fake: '0.0.0-fake' }
  }

  async stats(): Promise<Record<string, Stats>> {
    return { fake: { version: '0.0.0-fake' } as Stats }
  }
}

export class MemxFakeClient extends MemxClient {
  constructor() {
    super(new FakeAdapter())
  }
}
