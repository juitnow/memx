import { expect } from 'chai'
import { randomBytes } from 'crypto'
import { Bundle, Client, Factory } from '../src/index'

describe('Utilities', () => {
  const host = process.env.MEMCACHED_HOST || '127.0.0.1'
  const port = parseInt(process.env.MEMCACHED_PORT || '11211')

  const client = new Client({ hosts: [ { host, port } ] })

  let key: string

  beforeEach(() => key = randomBytes(30).toString('base64'))

  describe('factories', () => {
    it('should create an object and cache it', async () => {
      let counter = 0

      const factory = new Factory(client, (key: string) => ({ key, count: ++ counter }))

      // should create
      expect(await factory.get(key)).to.eql({ key, count: 1 })
      expect((await client.get(key))?.value).to.eql({ key, count: 1 })

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
      expect(await client.get(key)).to.be.undefined
    })
  })

  describe('bundles', () => {
    it('should add some entries to a bundle', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.get(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.get(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      expect(await bundle.list()).to.eql({
        foo: 'this is foo',
        bar: 'this is bar',
      })
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.equal('this is bar')

      await bundle.add('bar', 'this is another bar')
      expect((await client.get(key))?.value).to.equal('foo\0bar\0bar')

      expect(await bundle.list()).to.eql({
        foo: 'this is foo',
        bar: 'this is another bar',
      })
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.equal('this is another bar')
    })

    it('should compact keys when listing missing keys', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.get(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.get(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      await client.delete(`${key}:bar`)
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      expect(await bundle.list()).to.eql({
        foo: 'this is foo',
      })
      expect((await client.get(key))?.value).to.equal('foo')
    })

    it('should compact keys when getting missing keys', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.get(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.get(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      await client.delete(`${key}:bar`)
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      expect(await bundle.get('bar')).to.be.undefined
      expect((await client.get(key))?.value).to.equal('foo')
    })

    it('should return values even when the master key is evicted', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.get(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.get(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      await client.delete(key)

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.equal('this is bar')
      expect(await bundle.list()).to.eql({})
    })

    it('should delete an entry', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.get(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.get(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      await bundle.delete('bar')
      expect((await client.get(key))?.value).to.equal('foo')
      expect((await client.get(`${key}:bar`))).to.be.undefined

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.be.undefined
      expect(await bundle.list()).to.eql({ foo: 'this is foo' })
    })

    it('should delete an entry even when the master key is evicted', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).to.eql({})
      expect((await client.get(key))).to.be.undefined

      await bundle.add('foo', 'this is foo')
      expect((await client.get(key))?.value).to.equal('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.get(key))?.value).to.equal('foo\0bar')

      await client.delete(key)

      expect(await bundle.list()).to.eql({})

      await bundle.delete('bar')

      expect(await bundle.get('foo')).to.equal('this is foo')
      expect(await bundle.get('bar')).to.be.undefined
    })
  })
})