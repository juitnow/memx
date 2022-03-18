import { Adapter, Counter, AdapterResult, Stats } from './types'
import { ServerAdapter, ServerOptions } from './server'
import assert from 'assert'

function parseHosts(hosts?: string): ServerOptions[] {
  const result: { host: string, port?: number }[] = []
  if (! hosts) return result

  for (const part of hosts.split(',')) {
    const [ host, p ] = part.split(':')
    const port = parseInt(p) || undefined
    result.push({ host, port })
  }

  return result
}


export interface ClusterOptions {
  hosts: string | string[] | ServerOptions[],
  timeout?: number,
  ttl?: number
}

export class ClusterAdapter implements Adapter {
  readonly servers: readonly ServerAdapter[]
  readonly ttl: number

  constructor()
  constructor(servers: ServerAdapter[])
  constructor(options: ClusterOptions)

  constructor(serversOrOptions?: ServerAdapter[] | ClusterOptions) {
    // If we have an array of servers, just copy it and use it
    if (Array.isArray(serversOrOptions)) {
      this.servers = [ ...serversOrOptions ]

    // This was created with "options"... Convert and construct
    } else if (serversOrOptions) {
      const { ttl, timeout, hosts: defs } = serversOrOptions
      const hosts: ServerOptions[] = []

      if (Array.isArray(defs)) {
        defs.forEach((def) => {
          if (typeof def === 'string') hosts.push(...parseHosts(def))
          else hosts.push({ port: 11211, ...def })
        })
      } else {
        hosts.push(...parseHosts(defs))
      }

      this.servers = hosts.map((host) => new ServerAdapter({ ttl, timeout, ...host }))

    // Anything else gets initialized from environment variables
    } else {
      const hosts = parseHosts(process.env.MEMCACHED_HOSTS)
      const ttl = process.env.MEMCACHED_TTL && parseInt(process.env.MEMCACHED_TTL) || undefined
      const timeout = process.env.MEMCACHED_TIMEOUT && parseInt(process.env.MEMCACHED_TIMEOUT) || undefined

      this.servers = hosts.map((host) => new ServerAdapter({ ttl, timeout, ...host }))
    }

    // Validate and shortcut in case of single-servers setup
    if (this.servers.length < 1) throw new Error('No hosts configured')
    if (this.servers.length === 1) this.server = (): ServerAdapter => this.servers[0]

    // Check TTLs are all the same
    this.ttl = this.servers[0].ttl
    this.servers.slice(1).forEach((server) => {
      assert.equal(server.ttl, this.ttl, `TTL Mismatch (${server.ttl} != ${this.ttl})`)
    })

    // Freeze our lists of servers
    Object.freeze(this.servers)
  }

  server(key: string): ServerAdapter {
    const length = key.length

    let hash = 0
    for (let i = 0; i < length; i ++) hash = hash * 31 + key.charCodeAt(i)

    return this.servers[hash % this.servers.length]
  }

  get(key: string): Promise<AdapterResult | undefined> {
    return this.server(key).get(key)
  }

  gat(key: string, ttl: number): Promise<AdapterResult | undefined> {
    return this.server(key).gat(key, ttl)
  }

  touch(key: string, ttl?: number): Promise<boolean> {
    return this.server(key).touch(key, ttl)
  }

  set(key: string, value: Buffer, options?: { flags?: number; cas?: bigint; ttl?: number }): Promise<bigint | undefined> {
    return this.server(key).set(key, value, options)
  }

  add(key: string, value: Buffer, options?: { flags?: number; ttl?: number }): Promise<bigint | undefined> {
    return this.server(key).add(key, value, options)
  }

  replace(key: string, value: Buffer, options?: { flags?: number; cas?: bigint; ttl?: number }): Promise<bigint | undefined> {
    return this.server(key).replace(key, value, options)
  }

  append(key: string, value: Buffer, options?: { cas?: bigint }): Promise<boolean> {
    return this.server(key).append(key, value, options)
  }

  prepend(key: string, value: Buffer, options?: { cas?: bigint }): Promise<boolean> {
    return this.server(key).prepend(key, value, options)
  }

  increment(key: string, delta?: number | bigint, options?: { initial?: number | bigint; cas?: bigint; ttl?: number; create?: boolean }): Promise<Counter | undefined> {
    return this.server(key).increment(key, delta, options)
  }

  decrement(key: string, delta?: number | bigint, options?: { initial?: number | bigint; cas?: bigint; ttl?: number; create?: boolean }): Promise<Counter | undefined> {
    return this.server(key).decrement(key, delta, options)
  }

  delete(key: string, options?: { cas?: bigint }): Promise<boolean> {
    return this.server(key).delete(key, options)
  }

  async flush(ttl?: number): Promise<void> {
    await Promise.all(this.servers.map((server) => server.flush(ttl)))
  }

  async noop(): Promise<void> {
    await Promise.all(this.servers.map((server) => server.noop()))
  }

  async quit(): Promise<void> {
    await Promise.all(this.servers.map((server) => server.quit()))
  }

  async version(): Promise<Record<string, string>> {
    const versions = await Promise.all(this.servers.map((server) => server.version()))
    return versions.reduce((v1, v2) => ({ ...v1, ...v2 }))
  }

  async stats(): Promise<Record<string, Stats>> {
    const stats = await Promise.all(this.servers.map((server) => server.stats()))
    return stats.reduce((v1, v2) => ({ ...v1, ...v2 }))
  }
}
