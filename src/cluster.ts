import { Adapter, Counter, GetResult, Stats } from './adapter'
import { ServerAdapter } from './server'

function parseHosts(hosts?: string): { host: string, port?: number }[] {
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
  hosts: string | (string | { host: string, port?: number })[],
  timeout?: number,
  ttl?: number
}

export class ClusterAdapter implements Adapter {
  readonly servers: readonly ServerAdapter[]

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
      const hosts: { host: string, port?: number }[] = []

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

    // Freeze our lists of servers
    Object.freeze(this.servers)
  }

  server(key: string): ServerAdapter {
    const length = key.length

    let hash = 0
    for (let i = 0; i < length; i ++) hash = hash * 31 + key.charCodeAt(i)

    return this.servers[hash % this.servers.length]
  }

  get(key: string, options?: { ttl?: number | undefined }): Promise<void | GetResult> {
    return this.server(key).get(key, options)
  }

  touch(key: string, options?: { ttl?: number | undefined }): Promise<boolean> {
    return this.server(key).touch(key, options)
  }

  set(key: string, value: Buffer, options?: { flags?: number | undefined; cas?: bigint | undefined; ttl?: number | undefined }): Promise<bigint | void> {
    return this.server(key).set(key, value, options)
  }

  add(key: string, value: Buffer, options?: { flags?: number | undefined; cas?: bigint | undefined; ttl?: number | undefined }): Promise<bigint | void> {
    return this.server(key).add(key, value, options)
  }

  replace(key: string, value: Buffer, options?: { flags?: number | undefined; cas?: bigint | undefined; ttl?: number | undefined }): Promise<bigint | void> {
    return this.server(key).replace(key, value, options)
  }

  append(key: string, value: Buffer, options?: { cas?: bigint | undefined }): Promise<boolean> {
    return this.server(key).append(key, value, options)
  }

  prepend(key: string, value: Buffer, options?: { cas?: bigint | undefined }): Promise<boolean> {
    return this.server(key).prepend(key, value, options)
  }

  increment(key: string, delta?: number | bigint, options?: { initial?: number | bigint | undefined; cas?: bigint | undefined; ttl?: number | undefined; create?: boolean | undefined }): Promise<void | Counter> {
    return this.server(key).increment(key, delta, options)
  }

  decrement(key: string, delta?: number | bigint, options?: { initial?: number | bigint | undefined; cas?: bigint | undefined; ttl?: number | undefined; create?: boolean | undefined }): Promise<void | Counter> {
    return this.server(key).decrement(key, delta, options)
  }

  delete(key: string, options?: { cas?: bigint | undefined }): Promise<boolean> {
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
