import { randomBytes } from 'node:crypto'

import { expect } from 'chai'


import { Bundle, MemxClient, Factory, PoorManLock } from '../src/index'

describe('Utilities', () => {
  const host = process.env.MEMCACHED_HOST || '127.0.0.1'
  const port = parseInt(process.env.MEMCACHED_PORT || '11211')

  const client = new MemxClient({ hosts: [ { host, port } ] })

  let key: string

  beforeEach(() => key = randomBytes(30).toString('base64'))

  describe('factories', () => {
    it('should create an object and cache it', async () => {
      let counter = 0

      const factory = new Factory(client, (key: string) => ({ key, count: ++ counter }))

      // should create
      expect(await factory.get(key)).to.eql({ key, count: 1 })
      expect((await client.getc(key))?.value).to.eql({ key, count: 1 })

      // should return cached
      expect(await factory.get(key)).to.eql({ key, count: 1 })

      // should recreate when deleted
      await client.delete(key)
      expect(await factory.get(key)).to.eql({ key, count: 2 })
    })

    it('should not cache an object when the factory does not create it', async () => {
      const factory = new Factory(client, (key: string) => void key as unknown as string)

      // should not create
      expect(await factory.get(key)).to.be.undefined
      expect(await client.getc(key)).to.be.undefined
    })
  })

  describe('bundles', () => {
    it('should add some entries to a bundle', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.getc(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      expect(await bundle.list()).to.eql({
        foo: 'this is foo',
        bar: 'this is bar',
      })
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.equal('this is bar')

      await bundle.add('bar', 'this is another bar')
      expect((await client.getc(key))?.value).to.equal('foo\0bar\0bar')

      expect(await bundle.list()).to.eql({
        foo: 'this is foo',
        bar: 'this is another bar',
      })
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.equal('this is another bar')
    })

    it('should compact keys when listing missing keys', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.getc(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      await client.delete(`${key}:bar`)
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      expect(await bundle.list()).to.eql({
        foo: 'this is foo',
      })
      expect((await client.getc(key))?.value).to.equal('foo')
    })

    it('should compact keys when getting missing keys', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.getc(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      await client.delete(`${key}:bar`)
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('bar')).to.be.undefined
      expect((await client.getc(key))?.value).to.equal('foo')
    })

    it('should return values even when the master key is evicted', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.getc(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      await client.delete(key)

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.equal('this is bar')
      expect(await bundle.list()).to.eql({})
    })

    it('should delete an entry', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.getc(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      await bundle.delete('bar')
      expect((await client.getc(key))?.value).to.equal('foo')
      expect((await client.getc(`${key}:bar`))).to.be.undefined

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.be.undefined
      expect(await bundle.list()).to.eql({ foo: 'this is foo' })
    })

    it('should delete an entry even when the master key is evicted', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.getc(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).to.equal('foo\0bar')

      await client.delete(key)

      expect(await bundle.list()).to.eql({})

      await bundle.delete('bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.be.undefined
    })
  })

  describe('poor man lock', () => {
    it('should lock', async () => {
      const lock = new PoorManLock(client, key)
      const record: string[] = []

      expect((await client.getc(key))?.value).to.be.undefined

      record.push('create 1')
      const p1 = lock.execute(async () => {
        expect((await client.getc(key))?.value).to.be.false // "anonymous"

        record.push('start 1')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        record.push('end 1')

        expect((await client.getc(key))?.value).to.be.false // "anonymous"
      })

      record.push('create 2')
      const p2 = lock.execute(async () => {
        expect((await client.getc(key))?.value).to.equal('foo') // owner "foo"
        record.push('execute 2')
      }, { owner: 'foo', timeout: 2000 })

      await Promise.allSettled([ p1, p2 ])

      // lock should be cleared
      expect((await client.getc(key))?.value).to.be.undefined
      expect(record).to.eql([ 'create 1', 'create 2', 'start 1', 'end 1', 'execute 2' ])
    }, 3000)

    it('should timeout while acquiring an anonymous lock', async () => {
      const lock = new PoorManLock(client, key)
      const record: string[] = []

      expect((await client.getc(key))?.value).to.be.undefined

      record.push('create 1')
      const p1 = lock.execute(async () => {
        expect((await client.getc(key))?.value).to.be.false // anonymous

        record.push('start 1')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        record.push('end 1')

        expect((await client.getc(key))?.value).to.be.false // anonymous

        return 'hello, world!'
      })

      await new Promise((resolve) => setTimeout(resolve, 10)) // wait a tad

      record.push('create 2')
      const p2 = lock.execute(async () => {
        record.push('execute 2')
      }, { timeout: 500 })

      await Promise.allSettled([ p1, p2 ])

      expect(await p1).to.equal('hello, world!')
      await expect(p2).to.be.rejectedWith(Error, `Lock "${key}" timeout (owner=anonymous)`)

      await new Promise((resolve) => setTimeout(resolve, 10)) // wait a tad

      expect((await client.getc(key))?.value).to.be.undefined
      expect(record).to.eql([ 'create 1', 'start 1', 'create 2', 'end 1' ])
    }, 3000)

    it('should timeout while acquiring a named lock', async () => {
      const lock = new PoorManLock(client, key)
      const record: string[] = []

      expect((await client.getc(key))?.value).to.be.undefined

      record.push('create 1')
      const p1 = lock.execute(async () => {
        expect((await client.getc(key))?.value).to.equal('foobar') // owner "foobar"

        record.push('start 1')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        record.push('end 1')

        expect((await client.getc(key))?.value).to.equal('foobar') // owner "foobar"

        return 'hello, world!'
      }, { owner: 'foobar' })

      await new Promise((resolve) => setTimeout(resolve, 10)) // wait a tad

      record.push('create 2')
      const p2 = lock.execute(async () => {
        record.push('execute 2')
      }, { timeout: 500 })

      await Promise.allSettled([ p1, p2 ])

      expect(await p1).to.equal('hello, world!')
      await expect(p2).to.be.rejectedWith(Error, `Lock "${key}" timeout (owner="foobar")`)

      await new Promise((resolve) => setTimeout(resolve, 10)) // wait a tad

      expect((await client.getc(key))?.value).to.be.undefined
      expect(record).to.eql([ 'create 1', 'start 1', 'create 2', 'end 1' ])
    }, 3000)
  })
})
