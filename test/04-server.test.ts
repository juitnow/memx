import { expect } from 'chai'
import { randomBytes } from 'crypto'
import { Server } from '../src/index'

import { FakeSocket } from './fake-socket'

describe('Simple Client', () => {
  const host = process.env.MEMCACHED_HOST || '127.0.0.1'
  const port = parseInt(process.env.MEMCACHED_PORT || '11211')
  const client = new Server({ host, port })

  let key: string
  let value: Buffer

  beforeEach(() => {
    key = randomBytes(30).toString('base64')
    value = randomBytes(64)
  })

  /* ======================================================================== */

  describe('get/set/touch', () => {
    it('should set and get a value', async () => {
      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      const get = await client.get(key)
      expect(get).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      get!.recycle()
    })

    it('should set and get a value with flags', async () => {
      const cas = await client.set(key, value, { flags: 12345 })
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 12345,
        cas,
      })
    })

    it('should set a value with ttl and get it back', async function() {
      this.timeout(10000)
      this.slow(3000)

      const cas = await client.set(key, value, { ttl: 1 })
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      await new Promise((resolve) => setTimeout(resolve, 2000))

      expect(await client.get(key)).to.be.undefined
    })

    it('should set and get a value with cas', async function() {
      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      const cas2 = await client.set(key, value2, { cas: cas! })
      expect(cas2).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value: value2,
        flags: 0,
        cas: cas2,
      })

      const value3 = randomBytes(32)
      expect(await client.set(key, value3, { cas: cas! })).to.be.undefined

      expect(await client.get(key)).excluding('recycle').to.eql({
        value: value2,
        flags: 0,
        cas: cas2,
      })
    })

    it('should get a value and change its ttl', async function() {
      this.timeout(10000)
      this.slow(3000)

      expect(await client.get(key, { ttl: 1 })).to.be.undefined

      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key, { ttl: 1 })).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })
      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await client.get(key)).to.be.undefined
    })

    it('should change the ttl of a value', async function() {
      this.timeout(10000)
      this.slow(3000)

      expect(await client.touch(key, { ttl: 1 })).to.eql(false)

      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.touch(key, { ttl: 1 })).to.eql(true)
      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await client.get(key)).to.be.undefined
    })

    it('should get and set a super-long value', async () => {
      const longValue = randomBytes(128 * 1024) // yes, 128kb

      const cas = await client.set(key, longValue)
      expect(cas).to.be.a('bigint')

      const get = await client.get(key)
      expect(get).excluding('recycle').to.eql({
        value: longValue,
        flags: 0,
        cas,
      })

      get!.recycle()
    })

    it('should fail when keys are too long', async () => {
      const longKey = randomBytes(128).toString('hex').substring(0, 251) // max
      const goodKey = longKey.substring(0, 250) // good

      expect(longKey.length).to.equal(251)
      expect(goodKey.length).to.equal(250)

      await expect(client.get(longKey)).to.be.rejectedWith(Error, 'Key too long (len=251)')
      await expect(client.get(goodKey)).to.be.fulfilled
    })
  })

  /* ======================================================================== */

  describe('add/replace', () => {
    it('should add a value when none exists', async () => {
      const cas = await client.add(key, value)
      expect(cas).to.be.a('bigint')

      const get = await client.get(key)
      expect(get).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.add(key, value2)).to.be.undefined

      expect(await client.get(key)).excluding('recycle').to.eql(get)
    })

    it('should replace a value when none exists', async () => {
      expect(await client.replace(key, value)).to.be.undefined
      expect(await client.get(key)).to.be.undefined

      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      const replace = await client.replace(key, value2)
      expect(replace).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value: value2,
        flags: 0,
        cas: replace,
      })
    })
  })

  /* ======================================================================== */

  describe('append/prepend', () => {
    it('should append a value', async () => {
      expect(await client.append(key, value)).to.be.false

      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.append(key, value2)).to.be.true

      const get = await client.get(key)
      expect(get!.value).to.eql(Buffer.concat([ value, value2 ]))
    })

    it('should append a value with cas', async () => {
      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.append(key, value2, { cas: cas! + 10n })).to.be.false
      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      expect(await client.append(key, value2, { cas: cas! })).to.be.true

      const get = await client.get(key)
      expect(get!.value).to.eql(Buffer.concat([ value, value2 ]))
    })

    it('should prepend a value', async () => {
      expect(await client.prepend(key, value)).to.be.false

      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.prepend(key, value2)).to.be.true

      const get = await client.get(key)
      expect(get!.value).to.eql(Buffer.concat([ value2, value ]))
    })

    it('should prepend a value with cas', async () => {
      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.prepend(key, value2, { cas: cas! + 10n })).to.be.false
      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      expect(await client.prepend(key, value2, { cas: cas! })).to.be.true

      const get = await client.get(key)
      expect(get!.value).to.eql(Buffer.concat([ value2, value ]))
    })
  })

  /* ======================================================================== */

  describe('increment/decrement', () => {
    it('should create and increment a counter', async () => {
      expect(await client.increment(key)).property('value').equal(0n)
      expect(await client.increment(key)).property('value').equal(1n)
      expect(await client.increment(key, 10)).property('value').equal(11n)
      expect(await client.get(key)).property('value').eql(Buffer.from('11'))
    })

    it('should create and decrement a counter', async () => {
      expect(await client.decrement(key, 1, { initial: 90 })).property('value').equal(90n)
      expect(await client.decrement(key, 10)).property('value').equal(80n)
      expect(await client.decrement(key)).property('value').equal(79n)
      expect(await client.get(key)).property('value').eql(Buffer.from('79'))
    })

    it('should work with existing numbers', async () => {
      await(client.set(key, Buffer.from('20')))
      expect(await client.increment(key)).property('value').equal(21n)
      expect(await client.get(key)).property('value').eql(Buffer.from('21'))

      await(client.set(key, Buffer.from('21')))
      expect(await client.decrement(key)).property('value').equal(20n)
      expect(await client.get(key)).property('value').eql(Buffer.from('20'))
    })

    it('should skip creation of counters on demand', async () => {
      expect(await client.increment(key, 1, { create: false })).to.be.undefined
      expect(await client.decrement(key, 1, { create: false })).to.be.undefined
    })

    it('should alter the counter with cas', async () => {
      const cas = await(client.set(key, Buffer.from('20')))
      expect(cas).to.be.a('bigint')

      expect(await client.increment(key, 1, { cas: cas! + 10n })).to.be.undefined
      expect(await client.decrement(key, 1, { cas: cas! + 10n })).to.be.undefined

      const inc = await client.increment(key, 1, { cas: cas! })
      expect(inc!.value).to.equal(21n)

      const dec = await client.decrement(key, 1, { cas: inc!.cas })
      expect(dec!.value).to.equal(20n)
    })

    it('should fail when trying to use a string as a counter', async () => {
      await(client.set(key, Buffer.from('foobar')))

      await expect(client.increment(key, 1))
          .to.be.rejectedWith(Error, `(status=NON_NUMERIC_VALUE, key=${key})`)

      await expect(client.decrement(key, 1))
          .to.be.rejectedWith(Error, `(status=NON_NUMERIC_VALUE, key=${key})`)
    })

    it('should create a counter with a ttl', async function() {
      this.timeout(10000)
      this.slow(3000)

      const ctr = await(client.increment(key, 1, { ttl: 1 }))
      expect(ctr).to.eql({
        value: 0n,
        cas: ctr!.cas,
      })

      expect(await client.get(key)).property('value').eql(Buffer.from('0'))

      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await client.get(key)).to.be.undefined
    })
  })

  /* ======================================================================== */

  describe('delete/flush', () => {
    it('should delete an existing value', async () => {
      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      expect(await client.delete(key)).to.be.true
      expect(await client.get(key)).to.be.undefined

      expect(await client.delete(key)).to.be.false
    })

    it('should delete a value with cas', async () => {
      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      expect(await client.delete(key, { cas: cas! + 10n })).to.be.false
      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      expect(await client.delete(key, { cas: cas! })).to.be.true
      expect(await client.get(key)).to.be.undefined

      expect(await client.delete(key)).to.be.false
    })

    it('should flush caches immediately', async () => {
      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      expect(await client.flush())
      expect(await client.get(key)).to.be.undefined
    })

    it('should flush caches with a timeout', async function() {
      this.timeout(10000)
      this.slow(4000)

      const cas = await client.set(key, value)
      expect(cas).to.be.a('bigint')

      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      expect(await client.flush(2)) // 1 seconds doesn't work?
      expect(await client.get(key)).excluding('recycle').to.eql({
        value,
        flags: 0,
        cas,
      })

      await new Promise((resolve) => setTimeout(resolve, 3000))
      expect(await client.get(key)).to.be.undefined
    })
  })

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
      expect(await client.version()).to.match(/^\d+\.\d+\.\d+$/)
    })

    it('should get the stats', async () => {
      const stats = await client.stats()
      const version = await client.version()
      expect(stats).to.be.an('object').property('version').equal(version)
    })
  })

  /* ======================================================================== */

  describe('edge cases', () => {
    const client = new Server({
      host: 'host',
      port: 123456,
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
    })

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
