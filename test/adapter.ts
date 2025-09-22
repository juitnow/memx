import { randomBytes } from 'node:crypto'

import type { Adapter } from '../src/index'

export function adapterTests(client: Adapter): void {
  let key: string
  let value: Buffer

  beforeEach(() => {
    key = randomBytes(30).toString('base64')
    value = randomBytes(64)
  })

  describe('get/set/touch', () => {
    it('should set and get a value', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      const get = await client.get(key)
      expect(get).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      get!.recycle()
    })

    it('should set and get a value with flags', async () => {
      const cas = await client.set(key, value, { flags: 12345 })
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 12345,
        cas,
      })
    })

    it('should set a value with ttl and get it back', async () => {
      const cas = await client.set(key, value, { ttl: 1 })
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      await new Promise((resolve) => setTimeout(resolve, 2000))

      expect(await client.get(key)).toBeUndefined()
    }, 10000)

    it('should set and get a value with cas', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      const cas2 = await client.set(key, value2, { cas: cas! })
      expect(cas2).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value: value2,
        flags: 0,
        cas: cas2,
      })

      const value3 = randomBytes(32)
      expect(await client.set(key, value3, { cas: cas! })).toBeUndefined()

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value: value2,
        flags: 0,
        cas: cas2,
      })
    })

    it('should get and touch (gat) a value', async () => {
      expect(await client.gat(key, 0)).toBeUndefined()

      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      const result = await client.gat(key, 1)
      expect(result).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(result?.recycle()).toBeUndefined()

      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await client.get(key)).toBeUndefined()
    }, 10000)

    it('should change the ttl of a value', async () => {
      expect(await client.touch(key, 1)).toEqual(false)

      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.touch(key, 1)).toEqual(true)
      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await client.get(key)).toBeUndefined()
    }, 10000)

    it('should get and set a super-long value', async () => {
      const longValue = randomBytes(128 * 1024) // yes, 128kb

      const cas = await client.set(key, longValue)
      expect(cas).toBeA('bigint')

      const get = await client.get(key)
      expect(get).toEqual({
        recycle: expect.toBeA('function'),
        value: longValue,
        flags: 0,
        cas,
      })

      get!.recycle()
    })

    it('should fail when keys are too long', async () => {
      const longKey = randomBytes(128).toString('hex').substring(0, 251) // max
      const goodKey = longKey.substring(0, 250) // good

      expect(longKey.length).toStrictlyEqual(251)
      expect(goodKey.length).toStrictlyEqual(250)

      await expect(client.get(longKey)).toBeRejectedWithError('Key too long (len=251)')
      await expect(client.get(goodKey)).toBeResolved()

      await expect(client.set(longKey, value)).toBeRejectedWithError('Key too long (len=251)')
      await expect(client.set(goodKey, value)).toBeResolved()
    })

    it('should work across multiple requests in parallel', async () => {
      const data: [ string, Buffer ][] = []
      for (let i = 0; i < 10000; i++) {
        data.push([ randomBytes(16).toString('hex'), randomBytes(128) ])
      }

      const setPromises = data.map(([ key, value ]) => client.set(key, value))
      const getPromises = data.map(([ key ]) => client.get(key))

      const sets = await Promise.all(setPromises)
      expect(sets).toBeA('array').toHaveLength(data.length)
      sets.forEach((cas) => expect(cas).toBeA('bigint'))

      const gets = await Promise.all(getPromises)
      expect(gets).toBeA('array').toHaveLength(data.length)
      gets.forEach((result, i) => expect(result?.value).toEqual(data[i][1]))
    }, 80000)
  })

  /* ======================================================================== */

  describe('add/replace', () => {
    it('should add a value when none exists', async () => {
      const cas = await client.add(key, value)
      expect(cas).toBeA('bigint')

      const get = await client.get(key)
      expect(get).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.add(key, value2)).toBeUndefined()

      expect(await client.get(key)).toEqual({ ...get, recycle: expect.toBeA('function') })
    })

    it('should replace a value when none exists', async () => {
      expect(await client.replace(key, value)).toBeUndefined()
      expect(await client.get(key)).toBeUndefined()

      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      const replace = await client.replace(key, value2)
      expect(replace).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value: value2,
        flags: 0,
        cas: replace,
      })
    })
  })

  /* ======================================================================== */

  describe('append/prepend', () => {
    it('should append a value', async () => {
      expect(await client.append(key, value)).toBeFalse()

      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.append(key, value2)).toBeTrue()

      const get = await client.get(key)
      expect(get!.value).toEqual(Buffer.concat([ value, value2 ]))
    })

    it('should append a value with cas', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.append(key, value2, { cas: cas! + 10n })).toBeFalse()
      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(await client.append(key, value2, { cas: cas! })).toBeTrue()

      const get = await client.get(key)
      expect(get!.value).toEqual(Buffer.concat([ value, value2 ]))
    })

    it('should prepend a value', async () => {
      expect(await client.prepend(key, value)).toBeFalse()

      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.prepend(key, value2)).toBeTrue()

      const get = await client.get(key)
      expect(get!.value).toEqual(Buffer.concat([ value2, value ]))
    })

    it('should prepend a value with cas', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      const value2 = randomBytes(32)
      expect(await client.prepend(key, value2, { cas: cas! + 10n })).toBeFalse()
      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(await client.prepend(key, value2, { cas: cas! })).toBeTrue()

      const get = await client.get(key)
      expect(get!.value).toEqual(Buffer.concat([ value2, value ]))
    })
  })

  /* ======================================================================== */

  describe('increment/decrement', () => {
    it('should create and increment a counter', async () => {
      expect(await client.increment(key, 1, { initial: 0 })).toHaveProperty('value', expect.toEqual(0n))
      expect(await client.increment(key)).toHaveProperty('value', expect.toEqual(1n))
      expect(await client.increment(key, 10)).toHaveProperty('value', expect.toEqual(11n))
      expect(await client.get(key)).toHaveProperty('value', expect.toEqual(Buffer.from('11')))
    })

    it('should create and decrement a counter', async () => {
      expect(await client.decrement(key, 1, { initial: 90 })).toHaveProperty('value', expect.toEqual(90n))
      expect(await client.decrement(key, 10)).toHaveProperty('value', expect.toEqual(80n))
      expect(await client.decrement(key)).toHaveProperty('value', expect.toEqual(79n))
      expect(await client.get(key)).toHaveProperty('value', expect.toEqual(Buffer.from('79')))
    })

    it('should work with existing numbers', async () => {
      await(client.set(key, Buffer.from('20')))
      expect(await client.increment(key)).toHaveProperty('value', expect.toEqual(21n))
      expect(await client.get(key)).toHaveProperty('value', expect.toEqual(Buffer.from('21')))

      await(client.set(key, Buffer.from('21')))
      expect(await client.decrement(key)).toHaveProperty('value', expect.toEqual(20n))
      expect(await client.get(key)).toHaveProperty('value', expect.toEqual(Buffer.from('20')))
    })

    it('should skip creation of counters on demand', async () => {
      expect(await client.increment(key, 1)).toBeUndefined()
      expect(await client.decrement(key, 1)).toBeUndefined()
    })

    it('should alter the counter with cas', async () => {
      const cas = await(client.set(key, Buffer.from('20')))
      expect(cas).toBeA('bigint')

      expect(await client.increment(key, 1, { cas: cas! + 10n })).toBeUndefined()
      expect(await client.decrement(key, 1, { cas: cas! + 10n })).toBeUndefined()

      const inc = await client.increment(key, 1, { cas: cas! })
      expect(inc!.value).toStrictlyEqual(21n)

      const dec = await client.decrement(key, 1, { cas: inc!.cas })
      expect(dec!.value).toStrictlyEqual(20n)
    })

    it('should fail when trying to use a string as a counter', async () => {
      await(client.set(key, Buffer.from('foobar')))

      await expect(client.increment(key, 1))
          .toBeRejectedWithError(`(status=NON_NUMERIC_VALUE, key=${key})`, true)

      await expect(client.decrement(key, 1))
          .toBeRejectedWithError(`(status=NON_NUMERIC_VALUE, key=${key})`, true)
    })

    it('should create a counter with a ttl', async () => {
      const ctr = await(client.increment(key, 1, { initial: 0n, ttl: 1 }))
      expect(ctr).toEqual({
        value: 0n,
        cas: ctr!.cas,
      })

      expect(await client.get(key)).toHaveProperty('value', expect.toEqual(Buffer.from('0')))

      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await client.get(key)).toBeUndefined()
    }, 10000)
  })

  /* ======================================================================== */

  describe('delete/flush', () => {
    it('should delete an existing value', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(await client.delete(key)).toBeTrue()
      expect(await client.get(key)).toBeUndefined()

      expect(await client.delete(key)).toBeFalse()
    })

    it('should delete a value with cas', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(await client.delete(key, { cas: cas! + 10n })).toBeFalse()
      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(await client.delete(key, { cas: cas! })).toBeTrue()
      expect(await client.get(key)).toBeUndefined()

      expect(await client.delete(key)).toBeFalse()
    })

    it('should flush caches immediately', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(await client.flush())
      expect(await client.get(key)).toBeUndefined()
    })

    it('should flush caches with a timeout', async () => {
      const cas = await client.set(key, value)
      expect(cas).toBeA('bigint')

      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      expect(await client.flush(2)) // 1 seconds doesn't work?
      expect(await client.get(key)).toEqual({
        recycle: expect.toBeA('function'),
        value,
        flags: 0,
        cas,
      })

      await new Promise((resolve) => setTimeout(resolve, 3000))
      expect(await client.get(key)).toBeUndefined()
    }, 10000)
  })
}
