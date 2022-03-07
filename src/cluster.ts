import { Adapter, Counter, GetResult, Stats } from './adapter'
import { ServerAdapter } from './server'


export interface ClusterOptions {
  hosts: (string | { host: string, port?: string })[],
  timeout?: number,
  ttl?: number
}

export class ClusterAdapter implements Adapter {
  readonly servers: readonly ServerAdapter[] = []

  constructor()
  constructor(servers: ServerAdapter[])
  constructor(options: ClusterOptions)

  constructor(serversOrOptions?: ServerAdapter[] | ClusterOptions) {
    void serversOrOptions
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
