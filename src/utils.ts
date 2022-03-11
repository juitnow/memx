/* eslint-disable no-console */

import assert from 'assert'
import { Client, ClientResult, Serializable } from './client'
import { logPromiseError } from './internals'

export class Factory<T extends Serializable> {
  #factory: (key: string) => T | Promise<T>
  #client: Client
  #ttl?: number

  constructor(client: Client, factory: (key: string) => T | Promise<T>, ttl?: number) {
    assert(typeof factory === 'function', 'Invalid or no factory specified')
    assert(client, 'No client specified')

    this.#factory = factory
    this.#client = client
    this.#ttl = ttl
  }

  async get(key: string): Promise<T> {
    const cached = await this.#client.get(key, { ttl: this.#ttl })
    if (cached) return cached.value as T

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
  #client: Client
  #name: string
  #ttl: number

  constructor(client: Client, name: string, ttl?: number) {
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
        await this.#client.touch(this.#name, { ttl: this.#ttl })
      }
    })(), `Bundle error recording key "${this.#client.prefix}${key}"`)
  }

  async #removeKey(key: string): Promise<void> {
    await logPromiseError((async (): Promise<void> => {
      const result = await this.#client.get<string>(this.#name)
      if (! result) return
      const keys = result.value.split('\0').filter((k) => k !== key).join('\0')
      await this.#client.set(this.#name, keys, { cas: result.cas, ttl: this.#ttl })
    })(), `Bundle error clearing key "${this.#client.prefix}${key}"`)
  }

  async add(key: string, value: T): Promise<void> {
    await this.#client.set(`${this.#name}:${key}`, value, { ttl: this.#ttl })
    await this.#appendKey(key)
  }

  async get(key: string): Promise<T | void> {
    const result = await this.#client.get<T>(`${this.#name}:${key}`)
    if (result) return result.value
    await this.#removeKey(key)
  }

  async delete(key: string): Promise<void> {
    await this.#client.delete(`${this.#name}:${key}`)
    await this.#removeKey(key)
  }

  async list(): Promise<Record<string, T>> {
    const result = await this.#client.get<string>(this.#name)
    if (! result) return {}

    const results: Record<string, T> = {}
    const promises: Promise<void | ClientResult<T>>[] = []

    for (const key of new Set(result.value.split('\0'))) {
      promises.push(this.#client.get<T>(`${this.#name}:${key}`).then((result) => {
        if (result) results[key] = result.value
      }))
    }

    await Promise.all(promises)

    await logPromiseError(
        this.#client.set(this.#name, Object.keys(results).join('\0'), { cas: result.cas, ttl: this.#ttl }),
        'Error compacting bundle keys')

    return results
  }
}
