import assert from 'node:assert'

import { logPromiseError } from './internals'

import type { MemxClient, Serializable } from './client'

export class Factory<T extends Serializable> {
  #factory: (key: string) => T | Promise<T>
  #client: MemxClient
  #ttl?: number

  constructor(client: MemxClient, factory: (key: string) => T | Promise<T>, ttl?: number) {
    assert(typeof factory === 'function', 'Invalid or no factory specified')
    assert(client, 'No client specified')

    this.#factory = factory
    this.#client = client
    this.#ttl = ttl
  }

  async get(key: string): Promise<T> {
    const cached = await this.#client.getc(key)
    if (cached) {
      void logPromiseError(
          this.#client.touch(key),
          `Factory error touching key "${this.#client.prefix}${key}"`)
      return cached.value as T
    }

    const created = await this.#factory(key)
    if (created) {
      void logPromiseError(
          this.#client.set(key, created, { ttl: this.#ttl }),
          `Factory error setting key "${this.#client.prefix}${key}"`)
    }
    return created
  }
}

export class Bundle<T extends Serializable = Serializable> {
  #client: MemxClient
  #name: string
  #ttl: number

  constructor(client: MemxClient, name: string, ttl?: number) {
    assert(client, 'No client specified')
    assert(name, 'No bundle name specified')

    this.#client = client
    this.#name = name
    this.#ttl = ttl || 0
  }

  async #appendKey(key: string): Promise<void> {
    await logPromiseError((async (): Promise<void> => {
      const added = await this.#client.add(this.#name, key, { ttl: this.#ttl })
      if (!added) {
        await this.#client.append(this.#name, `\0${key}`)
        await this.#client.touch(this.#name, this.#ttl)
      }
    })(), `Bundle "${this.#client.prefix}${this.#name}" error recording key "${key}"`)
  }

  async #removeKey(key: string): Promise<void> {
    await logPromiseError((async (): Promise<void> => {
      const result = await this.#client.getc<string>(this.#name)
      if (! result) return
      const keys = result.value.split('\0').filter((k) => k !== key).join('\0')
      await this.#client.set(this.#name, keys, { cas: result.cas, ttl: this.#ttl })
    })(), `Bundle "${this.#client.prefix}${this.#name}" error clearing key "${key}"`)
  }

  async add(key: string, value: T): Promise<void> {
    await this.#client.set(`${this.#name}:${key}`, value, { ttl: this.#ttl })
    await this.#appendKey(key)
  }

  async get(key: string): Promise<T | undefined> {
    const result = await this.#client.getc<T>(`${this.#name}:${key}`)
    if (result) return result.value
    await this.#removeKey(key)
    return undefined
  }

  async delete(key: string): Promise<void> {
    await this.#client.delete(`${this.#name}:${key}`)
    await this.#removeKey(key)
  }

  async list(): Promise<Record<string, T>> {
    const result = await this.#client.getc<string>(this.#name)
    if (! result) return {}

    const results: Record<string, T> = {}
    const promises: Promise<void>[] = []

    for (const key of new Set(result.value.split('\0'))) {
      promises.push(this.#client.getc<T>(`${this.#name}:${key}`).then((result) => {
        if (result) results[key] = result.value
      }))
    }

    await Promise.all(promises)

    await logPromiseError(
        this.#client.set(this.#name, Object.keys(results).join('\0'), { cas: result.cas, ttl: this.#ttl }),
        `Bundle "${this.#client.prefix}${this.#name}" error compacting keys`)

    return results
  }
}

export class PoorManLock {
  #client: MemxClient
  #name: string

  constructor(client: MemxClient, name: string) {
    assert(client, 'No client specified')
    assert(name, 'No lock name specified')

    this.#client = client
    this.#name = name
  }

  async execute<T>(
      executor: () => T | Promise<T>,
      options?: { timeout?: number, owner?: string },
  ): Promise<T> {
    const { timeout = 5000, owner = false } = options || {}
    const end = Date.now() + timeout

    let cas: bigint | undefined
    do {
      cas = await this.#client.add(this.#name, owner, { ttl: 2 })
      if (cas !== undefined) break
      await new Promise((resolve) => void setTimeout(resolve, 100).unref())
    } while (Date.now() < end)

    if (cas === undefined) {
      const other = await this.#client.getc(this.#name)
      const owner = (other && other.value) ? `"${other.value}"` : 'anonymous'
      throw new Error(`Lock "${this.#client.prefix}${this.#name}" timeout (owner=${owner})`)
    }

    // the replacer runs asynchronously and sets the last "cas"... if our
    // code ends while this is running, we effectively loose our "cas" and
    // never delete the lock... simply store all these promises...
    let promise: Promise<void> = Promise.resolve()
    const interval = setInterval(() => {
      promise = logPromiseError((async (): Promise<void> => {
        const replaced = await this.#client.replace(this.#name, owner, { ttl: 2, cas })
        assert(replaced !== undefined, `Lock "${this.#client.prefix}${this.#name}" not replaced`)
        cas = replaced
      })(), `Error extending lock "${this.#client.prefix}${this.#name}"`)
    }, 100).unref()

    try {
      return await executor()
    } finally {
      clearInterval(interval)
      await promise // await for any running replacer
      await logPromiseError(
          this.#client.delete(this.#name, { cas }),
          `Error deleting lock "${this.#client.prefix}${this.#name}"`,
      )
    }
  }
}
