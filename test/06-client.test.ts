import { AssertionError } from 'assert'
import { expect } from 'chai'
import { randomBytes } from 'crypto'
import { Adapter, MemxClient, ClusterAdapter, ServerAdapter } from '../src/index'

describe('Memcached Client', () => {
  const host = process.env.MEMCACHED_HOST || '127.0.0.1'
  const port = parseInt(process.env.MEMCACHED_PORT || '11211')

  const client = new MemxClient({ hosts: [ { host, port } ] })

  let key: string

  beforeEach(() => key = randomBytes(30).toString('base64'))

  describe('construction', () => {
    it('should construct without any arguments', () => {
      const _hosts = process.env.MEMCACHED_HOSTS
      const _ttl = process.env.MEMCACHED_TTL
      const _timeout = process.env.MEMCACHED_TIMEOUT
      try {
        process.env.MEMCACHED_HOSTS = 'host1'
        delete process.env.MEMCACHED_TTL
        delete process.env.MEMCACHED_TIMEOUT

        const client = new MemxClient()
        expect(client.adapter).to.be.instanceof(ClusterAdapter)

        const adapter = client.adapter as ClusterAdapter
        expect(adapter.servers).to.be.an('array')
        expect(adapter.servers[0].host).to.equal('host1')
      } finally {
        process.env.MEMCACHED_HOSTS = _hosts
        process.env.MEMCACHED_TTL = _ttl
        process.env.MEMCACHED_TIMEOUT = _timeout
      }
    })

    it('should construct with some options', () => {
      const client = new MemxClient({ hosts: 'host1' })
      expect(client.adapter).to.be.instanceof(ClusterAdapter)

      const adapter = client.adapter as ClusterAdapter
      expect(adapter.servers).to.be.an('array')
      expect(adapter.servers[0].host).to.equal('host1')
    })

    it('should construct with an adapter', () => {
      const server = new ServerAdapter({ host: 'host1' })
      const client = new MemxClient(server)
      expect(client.adapter).to.equal(server)
    })

    it('should not construct with something else', () => {
      expect(() => new MemxClient({} as any))
          .to.throw(AssertionError, 'Invalid client constructor arguments')
    })
  })

  describe('basic data types', () => {
    const tests = {
      'bigint': 123n,
      'string': 'FooBar!',
      'number': 54321.98,
      'true (boolean)': true,
      'false (boolean)': false,
      'object': { n: 1, b: false },
      'array': [ 1, 'foobar', true ],
      'null': null,
    } as const

    for (const [ test, value ] of Object.entries(tests)) {
      it(test, async () => {
        const cas = await client.set(key, value)
        expect(await client.getc(key)).eql({ value, cas })
        expect(await client.gatc(key, 1)).eql({ value, cas })
        expect(await client.get(key)).eql(value)
        expect(await client.gat(key, 1)).eql(value)
      })
    }

    it('undefined (fail)', async () => {
      await expect(client.set(key, <any> undefined))
          .to.be.rejectedWith(AssertionError, 'Unable to store value of type "undefined"')
    })

    it('symbol (fail)', async () => {
      await expect(client.set(key, <any> Symbol()))
          .to.be.rejectedWith(AssertionError, 'Unable to store value of type "symbol"')
    })
  })

  describe('extra data types', () => {
    it('date', async () => {
      const date = new Date()

      await client.set(key, new Date(date))

      const result = await client.getc<Date>(key)
      expect(result?.value).to.eql(date)
    })

    it('date (json)', async () => {
      const date = new Date()

      await client.set(key, { date, test: 'foobar' })

      const result = await client.getc(key)
      expect(result?.value).to.eql({ date, test: 'foobar' })
    })

    it('set', async () => {
      const set = new Set([ 'a', 'b', 'c' ])

      await client.set(key, set)

      const result = await client.getc(key)
      expect(result?.value).to.eql(set)
    })

    it('set (json)', async () => {
      const set = new Set([ 'a', 'b', 'c' ])

      await client.set(key, { set, test: 'foobar' })

      const result = await client.getc(key)
      expect(result?.value).to.eql({ set, test: 'foobar' })
    })

    it('map', async () => {
      const map = new Map().set('foo', 'bar').set('baz', 12345)

      await client.set(key, map)

      const result = await client.getc(key)
      expect(result?.value).to.eql(map)
    })

    it('map (json)', async () => {
      const map = new Map().set('foo', 'bar').set('baz', 12345)

      await client.set(key, { map, test: 'foobar' })

      const result = await client.getc(key)
      expect(result?.value).to.eql({ map, test: 'foobar' })
    })

    it('bigint (json)', async () => {
      const value = -12345678901234567890n

      await client.set(key, { value, test: 'foobar' })

      const result = await client.getc(key)
      expect(result?.value).to.eql({ value, test: 'foobar' })
    })

    it('date/map/set/bigint json', async () => {
      const date = new Date()
      const value = -12345678901234567890n
      const map = new Map()
          .set('set', new Set([ '1', 2, date, value ]))
          .set('map', new Map<any, any>([ [ 'a', '1' ], [ 'b', 2 ], [ 'c', date ], [ 'd', value ] ]))
          .set('date', date)
          .set('value', value)
          .set('test', 'foobar')
      const set = new Set([ 'a', 123 ])

      await client.set(key, { map, set, date, value })

      const result = await client.getc(key)
      expect(result?.value).to.eql({ map, set, date, value })
    })
  })

  describe('buffers and typed arrays', () => {
    const buffer = randomBytes(128)

    const tests = {
      Uint8Array: Uint8Array,
      Uint8ClampedArray: Uint8ClampedArray,
      Uint16Array: Uint16Array,
      Uint32Array: Uint32Array,
      Int8Array: Int8Array,
      Int16Array: Int16Array,
      Int32Array: Int32Array,
      BigUint64Array: BigUint64Array,
      BigInt64Array: BigInt64Array,
      Float32Array: Float32Array,
      Float64Array: Float64Array,
    } as const

    it('Buffer', async () => {
      const set = await client.set(key, buffer)
      const { value, cas } = await client.getc(key) || {}
      expect(cas).to.equal(set)
      expect(Buffer.compare(value as any, buffer)).to.equal(0)
    })

    for (const [ test, TypedArray ] of Object.entries(tests)) {
      it(test, async () => {
        const array = new TypedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength / 8)
        const set = await client.set(key, array)
        const { value, cas } = await client.getc(key) || {} as any
        expect(cas).to.equal(set)
        expect(value).to.be.instanceOf(TypedArray)
        expect(value.length).to.equal(array.length).to.be.greaterThan(0)
        expect([ ...value ]).to.have.members([ ...array ]).to.have.length.greaterThan(0)
      })
    }
  })

  /* ======================================================================== */

  describe('add/replace', () => {
    it('should add a value when none exists', async () => {
      const cas = await client.add(key, 'Foo, Bar and Baz')
      expect(cas).to.be.a('bigint')

      const get = await client.getc(key)
      expect(get).to.eql({
        value: 'Foo, Bar and Baz',
        cas,
      })

      expect(await client.add(key, 'Hello, world!')).to.be.undefined

      expect(await client.getc(key)).to.eql(get)
    })

    it('should replace a value when none exists', async () => {
      expect(await client.replace(key, 'Foo, Bar and Baz')).to.be.undefined
      expect(await client.getc(key)).to.be.undefined

      const cas = await client.set(key, 'Foo, Bar and Baz')
      expect(cas).to.be.a('bigint')

      expect(await client.getc(key)).to.eql({
        value: 'Foo, Bar and Baz',
        cas,
      })

      const replace = await client.replace(key, 'Hello, world!')
      expect(replace).to.be.a('bigint')

      expect(await client.getc(key)).to.eql({
        value: 'Hello, world!',
        cas: replace,
      })
    })
  })

  /* ======================================================================== */

  describe('append/prepend', () => {
    it('should append a value', async () => {
      expect(await client.append(key, 'Hello, world!')).to.be.false

      const cas = await client.set(key, 'Foo, Bar')
      expect(cas).to.be.a('bigint')

      expect(await client.getc(key)).to.eql({
        value: 'Foo, Bar',
        cas,
      })

      expect(await client.append(key, ' and Baz')).to.be.true

      const get = await client.getc(key)
      expect(get!.value).to.eql('Foo, Bar and Baz')
    })

    it('should prepend a value', async () => {
      expect(await client.prepend(key, 'Hello, world!')).to.be.false

      const cas = await client.set(key, 'Bar and Baz')
      expect(cas).to.be.a('bigint')

      expect(await client.getc(key)).to.eql({
        value: 'Bar and Baz',
        cas,
      })

      expect(await client.prepend(key, 'Foo, ')).to.be.true

      const get = await client.getc(key)
      expect(get!.value).to.eql('Foo, Bar and Baz')
    })
  })

  /* ======================================================================== */

  describe('increment/decrement', () => {
    it('should increment a value', async () => {
      const { cas, value } = await client.increment(key, 1, { initial: 123 }) as any

      expect(cas).to.be.a('bigint')
      expect(value).to.be.a('bigint')
      expect(value).to.equal(123n)

      expect(await client.getc(key)).to.eql({
        value: 123n,
        cas,
      })

      const { cas: cas2 } = await client.increment(key, 1) as any
      expect(await client.getc(key)).to.eql({
        value: 124n,
        cas: cas2,
      })

      expect(await client.increment(key, 1, { initial: 999, cas: cas2 + 10n })).to.be.undefined
    })

    it('should increment a value modified by a race condition', async () => {
      process.nextTick(() => client.set(key, 'foobar'))
      const promise = client.increment(key, 1, { initial: 123 }) as any

      const { cas, value } = await promise || {}

      expect(cas).to.be.a('bigint')
      expect(value).to.be.a('bigint')
      expect(value).to.equal(123n)

      const result = await client.getc(key)
      expect(result?.value).to.equal('foobar')
      expect(result?.cas).to.not.equal(cas)
    })

    it('should decrement a value', async () => {
      const { cas, value } = await client.decrement(key, 1, { initial: 123 }) as any
      expect(cas).to.be.a('bigint')

      expect(value).to.be.a('bigint')
      expect(value).to.equal(123n)

      expect(await client.getc(key)).to.eql({
        value: 123n,
        cas,
      })

      const { cas: cas2 } = await client.decrement(key, 1) as any
      expect(await client.getc(key)).to.eql({
        value: 122n,
        cas: cas2,
      })

      expect(await client.decrement(key, 1, { initial: 999, cas: cas2 + 10n })).to.be.undefined
    })

    it('should decrement a value modified by a race condition', async () => {
      process.nextTick(() => client.set(key, 'foobar'))
      const promise = client.decrement(key, 1, { initial: 123 }) as any

      const { cas, value } = await promise

      expect(cas).to.be.a('bigint')
      expect(value).to.be.a('bigint')
      expect(value).to.equal(123n)

      const result = await client.getc(key)
      expect(result?.value).to.equal('foobar')
      expect(result?.cas).to.not.equal(cas)
    })
  })

  /* ======================================================================== */

  describe('adapter passthrough', () => {
    const client = new MemxClient({
      get(...args: any[]): any {
        throw new Error('Method not implemented:' + args)
      },
      touch(...args: any[]): any {
        return [ 'touch', ...args ]
      },
      delete(...args: any[]): any {
        return [ 'delete', ...args ]
      },
      flush(...args: any[]): any {
        return [ 'flush', ...args ]
      },
      noop(...args: any[]): any {
        return [ 'noop', ...args ]
      },
      quit(...args: any[]): any {
        return [ 'quit', ...args ]
      },
      version(...args: any[]): any {
        return [ 'version', ...args ]
      },
      stats(...args: any[]): any {
        return [ 'stats', ...args ]
      },
    } as Adapter)

    it('touch', () => {
      expect(client.touch('key', 123)).to.eql([ 'touch', 'key', 123 ])
    })

    it('delete', () => {
      expect(client.delete('key', { cas: 123n })).to.eql([ 'delete', 'key', { cas: 123n } ])
    })

    it('flush', () => {
      expect(client.flush(123)).to.eql([ 'flush', 123 ])
    })

    it('noop', () => {
      expect(client.noop()).to.eql([ 'noop' ])
    })

    it('quit', () => {
      expect(client.quit()).to.eql([ 'quit' ])
    })

    it('version', () => {
      expect(client.version()).to.eql([ 'version' ])
    })

    it('stats', () => {
      expect(client.stats()).to.eql([ 'stats' ])
    })
  })

  /* ======================================================================== */

  describe('prefixes', () => {
    const prefixed = client.withPrefix('foo:')

    it('should expose the prefix', () => {
      expect(prefixed.prefix).to.equal('foo:')
    })

    it('get/set (1)', async () => {
      await prefixed.set(key, 'foobar')
      expect((await client.getc('foo:' + key))?.value).to.equal('foobar')
    })

    it('get/set (2)', async () => {
      await client.set('foo:' + key, 'foobar')
      expect((await prefixed.getc(key))?.value).to.equal('foobar')
    })

    it('add', async () => {
      await prefixed.add(key, 'foobar')
      expect((await client.getc('foo:' + key))?.value).to.equal('foobar')
    })

    it('replace', async () => {
      await client.set('foo:' + key, 'wrong')
      await prefixed.replace(key, 'foobar')
      expect((await client.getc('foo:' + key))?.value).to.equal('foobar')
    })

    it('append', async () => {
      await client.set('foo:' + key, 'foo')
      await prefixed.append(key, 'bar')
      expect((await client.getc('foo:' + key))?.value).to.equal('foobar')
    })

    it('prepend', async () => {
      await client.set('foo:' + key, 'bar')
      await prefixed.prepend(key, 'foo')
      expect((await client.getc('foo:' + key))?.value).to.equal('foobar')
    })

    it('increment', async () => {
      await prefixed.increment(key, 10, { initial: 50 })
      expect((await client.getc('foo:' + key))?.value).to.equal(50n)
    })

    it('decrement', async () => {
      await prefixed.decrement(key, 10, { initial: 50 })
      expect((await client.getc('foo:' + key))?.value).to.equal(50n)
    })

    it('touch', async function() {
      this.timeout(10000)
      this.slow(3000)

      await client.set('foo:' + key, 'foobar')

      expect((await prefixed.touch(key, 1))).to.be.true
      expect((await client.getc('foo:' + key))?.value).to.equal('foobar')

      await new Promise((resolve) => setTimeout(resolve, 2000))
      expect(await client.getc('foo:' + key)).to.be.undefined
    })

    it('delete', async () => {
      await client.set('foo:' + key, 'foobar')

      expect((await client.getc('foo:' + key))?.value).to.equal('foobar')
      expect(await prefixed.delete(key)).to.be.true
      expect((await client.getc('foo:' + key))?.value).to.be.undefined
    })
  })
})
