import { AssertionError } from 'node:assert'
import { randomBytes } from 'node:crypto'

import { expect } from 'chai'

import { ClusterAdapter, ServerAdapter } from '../src/index'

import type { ServerOptions } from '../src/index'

function check(cluster: ClusterAdapter, servers: Required<ServerOptions>[]): void {
  expect(cluster.servers).to.be.an('array')

  const options: ServerOptions[] = cluster.servers.map((server) => ({
    host: server.host,
    port: server.port,
    timeout: server.timeout,
    ttl: server.ttl,
  }))

  expect(options).to.eql(servers)
}

describe('Cluster Adapter', () => {
  describe('construction', () => {
    it('should construct with an array of servers', () => {
      const server1 = new ServerAdapter({ host: 'host1' })
      const server2 = new ServerAdapter({ host: 'host2' })
      const cluster = new ClusterAdapter([ server1, server2 ])

      expect(cluster.servers).to.eql([ server1, server2 ])
      expect(cluster.servers[0]).to.equal(server1)
      expect(cluster.servers[1]).to.equal(server2)

      // "foo" and "bar" hash to two different servers!
      expect(cluster.server('foo')).to.equal(server1)
      expect(cluster.server('bar')).to.equal(server2)
      expect(cluster.server).to.equal(ClusterAdapter.prototype.server)
    })

    it('should construct with a single server', () => {
      const server = new ServerAdapter({ host: 'host1' })
      const cluster = new ClusterAdapter([ server ])

      expect(cluster.servers).to.eql([ server ])
      expect(cluster.servers[0]).to.equal(server)

      expect(cluster.server('foo')).to.equal(server)
      expect(cluster.server('bar')).to.equal(server)
      expect(cluster.server).to.not.equal(ClusterAdapter.prototype.server)
    })

    it('should not construct with out servers', () => {
      expect(() => new ClusterAdapter([])).to.throw(Error, 'No hosts configured')
    })

    it('should construct with environment variables', () => {
      const _hosts = process.env.MEMCACHED_HOSTS
      const _ttl = process.env.MEMCACHED_TTL
      const _timeout = process.env.MEMCACHED_TIMEOUT
      try {
        process.env.MEMCACHED_HOSTS = 'host1,host2:12345,host3:foo'
        delete process.env.MEMCACHED_TTL
        delete process.env.MEMCACHED_TIMEOUT

        check(new ClusterAdapter(), [
          { host: 'host1', port: 11211, timeout: 1000, ttl: 0 },
          { host: 'host2', port: 12345, timeout: 1000, ttl: 0 },
          { host: 'host3', port: 11211, timeout: 1000, ttl: 0 },
        ])

        process.env.MEMCACHED_HOSTS = 'host1,host2'
        process.env.MEMCACHED_TIMEOUT = '99'
        process.env.MEMCACHED_TTL = '12'

        check(new ClusterAdapter(), [
          { host: 'host1', port: 11211, timeout: 99, ttl: 12 },
          { host: 'host2', port: 11211, timeout: 99, ttl: 12 },
        ])

        process.env.MEMCACHED_HOSTS = 'host:12345'
        process.env.MEMCACHED_TIMEOUT = 'foo'
        process.env.MEMCACHED_TTL = 'bar'

        check(new ClusterAdapter(), [
          { host: 'host', port: 12345, timeout: 1000, ttl: 0 },
        ])

        delete process.env.MEMCACHED_HOSTS
        delete process.env.MEMCACHED_TTL
        delete process.env.MEMCACHED_TIMEOUT

        expect(() => new ClusterAdapter()).to.throw(Error, 'No hosts configured')
      } finally {
        process.env.MEMCACHED_HOSTS = _hosts
        process.env.MEMCACHED_TTL = _ttl
        process.env.MEMCACHED_TIMEOUT = _timeout
      }
    })

    it('should construct with options (hosts=string)', () => {
      check(new ClusterAdapter({ hosts: 'host1,host2:12345' }), [
        { host: 'host1', port: 11211, timeout: 1000, ttl: 0 },
        { host: 'host2', port: 12345, timeout: 1000, ttl: 0 },
      ])

      check(new ClusterAdapter({ hosts: 'host1,host2:12345', timeout: 98, ttl: 12 }), [
        { host: 'host1', port: 11211, timeout: 98, ttl: 12 },
        { host: 'host2', port: 12345, timeout: 98, ttl: 12 },
      ])
    })

    it('should construct with options (hosts=string[])', () => {
      check(new ClusterAdapter({ hosts: [ 'host1,host2:12345', 'host3:54321' ] }), [
        { host: 'host1', port: 11211, timeout: 1000, ttl: 0 },
        { host: 'host2', port: 12345, timeout: 1000, ttl: 0 },
        { host: 'host3', port: 54321, timeout: 1000, ttl: 0 },
      ])

      check(new ClusterAdapter({ hosts: [ 'host1,host2:12345', 'host3:54321' ], timeout: 98, ttl: 12 }), [
        { host: 'host1', port: 11211, timeout: 98, ttl: 12 },
        { host: 'host2', port: 12345, timeout: 98, ttl: 12 },
        { host: 'host3', port: 54321, timeout: 98, ttl: 12 },
      ])
    })

    it('should construct with options (hosts=options[])', () => {
      check(new ClusterAdapter({ hosts: [
        { host: 'host1' },
        { host: 'host2', port: 12345 },
        { host: 'host3', timeout: 98 },
        { host: 'host4', ttl: 0 },
      ] }), [
        { host: 'host1', port: 11211, timeout: 1000, ttl: 0 },
        { host: 'host2', port: 12345, timeout: 1000, ttl: 0 },
        { host: 'host3', port: 11211, timeout: 98, ttl: 0 },
        { host: 'host4', port: 11211, timeout: 1000, ttl: 0 },
      ])

      check(new ClusterAdapter({ hosts: [
        { host: 'host1' },
        { host: 'host2', port: 12345 },
        { host: 'host3', timeout: 98 },
        { host: 'host4', ttl: 4 },
      ], timeout: 76, ttl: 4 }), [
        { host: 'host1', port: 11211, timeout: 76, ttl: 4 },
        { host: 'host2', port: 12345, timeout: 76, ttl: 4 },
        { host: 'host3', port: 11211, timeout: 98, ttl: 4 },
        { host: 'host4', port: 11211, timeout: 76, ttl: 4 },
      ])

      expect(() => new ClusterAdapter({ hosts: [
        { host: 'host1' },
        { host: 'host2', ttl: 123 },
      ], ttl: 321 })).to.throw(AssertionError, 'TTL Mismatch (123 != 321)')
    })
  })

  describe('methods', () => {
    const val = randomBytes(64)

    it('get', async () => {
      const cluster = new ClusterAdapter([
        { get: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { get: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.get('foo')).to.eql([ 1, 'foo' ])
      expect(await cluster.get('bar')).to.eql([ 2, 'bar' ])
    })

    it('gat', async () => {
      const cluster = new ClusterAdapter([
        { gat: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { gat: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.gat('foo', 100)).to.eql([ 1, 'foo', 100 ])
      expect(await cluster.gat('bar', 100)).to.eql([ 2, 'bar', 100 ])
    })

    it('touch', async () => {
      const cluster = new ClusterAdapter([
        { touch: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { touch: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.touch('foo', 100)).to.eql([ 1, 'foo', 100 ])
      expect(await cluster.touch('bar', 100)).to.eql([ 2, 'bar', 100 ])
    })

    it('set', async () => {
      const cluster = new ClusterAdapter([
        { set: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { set: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.set('foo', val, { ttl: 100 })).to.eql([ 1, 'foo', val, { ttl: 100 } ])
      expect(await cluster.set('bar', val, { ttl: 100 })).to.eql([ 2, 'bar', val, { ttl: 100 } ])
    })

    it('add', async () => {
      const cluster = new ClusterAdapter([
        { add: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { add: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.add('foo', val, { ttl: 100 })).to.eql([ 1, 'foo', val, { ttl: 100 } ])
      expect(await cluster.add('bar', val, { ttl: 100 })).to.eql([ 2, 'bar', val, { ttl: 100 } ])
    })

    it('replace', async () => {
      const cluster = new ClusterAdapter([
        { replace: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { replace: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.replace('foo', val, { ttl: 100 })).to.eql([ 1, 'foo', val, { ttl: 100 } ])
      expect(await cluster.replace('bar', val, { ttl: 100 })).to.eql([ 2, 'bar', val, { ttl: 100 } ])
    })

    it('append', async () => {
      const cluster = new ClusterAdapter([
        { append: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { append: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.append('foo', val, { cas: 100n })).to.eql([ 1, 'foo', val, { cas: 100n } ])
      expect(await cluster.append('bar', val, { cas: 100n })).to.eql([ 2, 'bar', val, { cas: 100n } ])
    })

    it('prepend', async () => {
      const cluster = new ClusterAdapter([
        { prepend: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { prepend: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.prepend('foo', val, { cas: 100n })).to.eql([ 1, 'foo', val, { cas: 100n } ])
      expect(await cluster.prepend('bar', val, { cas: 100n })).to.eql([ 2, 'bar', val, { cas: 100n } ])
    })

    it('increment', async () => {
      const cluster = new ClusterAdapter([
        { increment: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { increment: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.increment('foo', 123n, { cas: 100n })).to.eql([ 1, 'foo', 123n, { cas: 100n } ])
      expect(await cluster.increment('bar', 123n, { cas: 100n })).to.eql([ 2, 'bar', 123n, { cas: 100n } ])
    })

    it('decrement', async () => {
      const cluster = new ClusterAdapter([
        { decrement: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { decrement: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.decrement('foo', 123n, { cas: 100n })).to.eql([ 1, 'foo', 123n, { cas: 100n } ])
      expect(await cluster.decrement('bar', 123n, { cas: 100n })).to.eql([ 2, 'bar', 123n, { cas: 100n } ])
    })

    it('delete', async () => {
      const cluster = new ClusterAdapter([
        { delete: async (...args: any) => [ 1, ...args ] } as any as ServerAdapter,
        { delete: async (...args: any) => [ 2, ...args ] } as any as ServerAdapter,
      ])

      expect(await cluster.delete('foo', { cas: 100n })).to.eql([ 1, 'foo', { cas: 100n } ])
      expect(await cluster.delete('bar', { cas: 100n })).to.eql([ 2, 'bar', { cas: 100n } ])
    })

    it('flush', async () => {
      const calls: any = {}

      const cluster = new ClusterAdapter([
        { flush: async (...args: any) => calls[1] = args } as any as ServerAdapter,
        { flush: async (...args: any) => calls[2] = args } as any as ServerAdapter,
      ])

      await(cluster.flush(12345))
      expect(calls).to.eql({ 1: [ 12345 ], 2: [ 12345 ] })
    })

    it('noop', async () => {
      const calls: any = {}

      const cluster = new ClusterAdapter([
        { noop: async (...args: any) => calls[1] = args } as any as ServerAdapter,
        { noop: async (...args: any) => calls[2] = args } as any as ServerAdapter,
      ])

      await(cluster.noop())
      expect(calls).to.eql({ 1: [], 2: [] })
    })

    it('quit', async () => {
      const calls: any = {}

      const cluster = new ClusterAdapter([
        { quit: async (...args: any) => calls[1] = args } as any as ServerAdapter,
        { quit: async (...args: any) => calls[2] = args } as any as ServerAdapter,
      ])

      await(cluster.quit())
      expect(calls).to.eql({ 1: [], 2: [] })
    })

    it('version', async () => {
      const cluster = new ClusterAdapter([
        { version: async (...args: any) => ({ 1: [ 'one', ...args ] }) } as any as ServerAdapter,
        { version: async (...args: any) => ({ 2: [ 'two', ...args ] }) } as any as ServerAdapter,
      ])

      expect(await(cluster.version())).to.eql({ 1: [ 'one' ], 2: [ 'two' ] })
    })

    it('stats', async () => {
      const cluster = new ClusterAdapter([
        { stats: async (...args: any) => ({ 1: [ 'one', ...args ] }) } as any as ServerAdapter,
        { stats: async (...args: any) => ({ 2: [ 'two', ...args ] }) } as any as ServerAdapter,
      ])

      expect(await(cluster.stats())).to.eql({ 1: [ 'one' ], 2: [ 'two' ] })
    })
  })
})
