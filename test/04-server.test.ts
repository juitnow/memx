import './.setup'

import { expect } from 'chai'
import { ServerAdapter } from '../src/index'

import { adapterTests } from './adapter'
import { FakeSocket } from './fake-socket'

describe('Server Adapter', () => {
  const host = process.env.MEMCACHED_HOST || '127.0.0.1'
  const port = parseInt(process.env.MEMCACHED_PORT || '11211')
  const client = new ServerAdapter({ host, port })

  /* ======================================================================== */

  describe('construction', () => {
    it('should construct an instance', () => {
      const s1 = new ServerAdapter({ host: 'foo' })
      expect(s1).to.have.property('host', 'foo')
      expect(s1).to.have.property('port', 11211)
      expect(s1).to.have.property('timeout', 1000)
      expect(s1).to.have.property('ttl', 0)
      expect(s1).to.have.property('id', 'foo:11211')

      const s2 = new ServerAdapter({ host: 'bar', port: 12345, timeout: 99, ttl: 100 })
      expect(s2).to.have.property('host', 'bar')
      expect(s2).to.have.property('port', 12345)
      expect(s2).to.have.property('timeout', 99)
      expect(s2).to.have.property('ttl', 100)
      expect(s2).to.have.property('id', 'bar:12345')
    })
  })

  /* ======================================================================== */

  /* Run adapter tests (shared for test adapter) */
  adapterTests(client)

  /* ======================================================================== */

  describe('noop/quit/version/stats', () => {
    it('should issue a noop', async () => {
      expect(await client.noop()).to.be.undefined
    })

    it('should quit and reconnect', async function() {
      this.slow(200)

      expect(client.connected).to.be.true

      expect(await client.quit()).to.be.undefined
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(client.connected).to.be.false

      expect(await client.noop()).to.be.undefined
      expect(client.connected).to.be.true
    })

    it('should get the version', async () => {
      const version = await client.version()
      expect(version[client.id]).to.match(/^\d+\.\d+\.\d+$/)
    })

    it('should get the stats', async () => {
      const stats = await client.stats()
      const versions = await client.version()
      const version = versions[client.id]

      expect(stats[client.id]).to.be.an('object')
      expect(stats[client.id].version).to.be.a('string').equal(version) // strings
      expect(stats[client.id].pid).to.be.a('number') // numbers
      expect(stats[client.id].cmd_get).to.be.a('bigint') // bigint
      expect(stats[client.id].accepting_conns).to.be.a('boolean') // boolean
      expect(stats[client.id].rusage_user).to.be.a('bigint') // microseconds
    })
  })

  /* ======================================================================== */

  describe('edge cases', () => {
    const client = new ServerAdapter({
      host: 'host',
      port: 12345,
      factory: (options: any): any => {
        return new class extends FakeSocket {
          $write(string: string, callback: (error?: Error) => void): void {
            const opcode = string.substring(2, 4)
            const sequence = string.substring(24, 32)
            this.$respond(`81${opcode}00000000012300000000${sequence}0000000000000000`)
            callback()
          }
        }(options)
      },
    } as any)

    // it('should get and touch (gat) a value with the default TTL', async function() {
    //   this.timeout(10000)
    //   this.slow(3000)

    //   const client = new ServerAdapter({ host, port, ttl: 1 })
    //   const key = randomBytes(30).toString('base64')
    //   const value = randomBytes(64)

    //   expect(await client.get(key)).to.be.undefined

    //   const cas = await client.set(key, value, { ttl: 3600 })
    //   expect(cas).to.be.a('bigint')

    //   expect(await client.gat(key)).excluding('recycle').to.eql({
    //     value,
    //     flags: 0,
    //     cas,
    //   })

    //   await new Promise((resolve) => setTimeout(resolve, 2000))
    //   expect(await client.get(key)).to.be.undefined
    // })

    it('should fail on get', async () => {
      await expect(client.get('foo')).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
    })

    it('should fail on touch', async () => {
      await expect(client.touch('foo')).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
    })

    it('should fail on set/add/replace', async () => {
      await expect(client.set('foo', Buffer.alloc(10))).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
      await expect(client.add('foo', Buffer.alloc(10))).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
      await expect(client.replace('foo', Buffer.alloc(10))).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
    })

    it('should fail on append/prepend', async () => {
      await expect(client.append('foo', Buffer.alloc(10))).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
      await expect(client.prepend('foo', Buffer.alloc(10))).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
    })

    it('should fail on increment/decrement', async () => {
      await expect(client.increment('foo', 1)).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
      await expect(client.decrement('foo', 1)).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
    })

    it('should fail on delete', async () => {
      await expect(client.delete('foo')).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123, key=foo)')
    })

    it('should fail on flush', async () => {
      await expect(client.flush()).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123)')
    })

    it('should fail on noop', async () => {
      await expect(client.noop()).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123)')
    })

    it('should fail on quit', async () => {
      await expect(client.quit()).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123)')
    })

    it('should fail on version', async () => {
      await expect(client.version()).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123)')
    })

    it('should fail on stats', async () => {
      await expect(client.stats()).to.be.rejectedWith(Error, 'Unknown Error (status=0x0123)')
    })
  })
})
