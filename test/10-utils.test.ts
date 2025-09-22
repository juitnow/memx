import { randomBytes } from 'node:crypto'

import { exec } from '@plugjs/build'

import { Bundle, Factory, MemxClient, PoorManLock } from '../src/index'

describe('Utilities', () => {
  const host = process.env.MEMCACHED_HOST || '127.0.0.1'
  const port = parseInt(process.env.MEMCACHED_PORT || '11211')

  const client = new MemxClient({ hosts: [ { host, port } ] })

  let key: string

  beforeEach(() => void (key = randomBytes(30).toString('base64')))

  describe('factories', () => {
    it('should create an object and cache it', async () => {
      let counter = 0

      const factory = new Factory(client, (key: string) => ({ key, count: ++ counter }))

      // should create
      expect(await factory.get(key)).toEqual({ key, count: 1 })
      expect((await client.getc(key))?.value).toEqual({ key, count: 1 })

      // should return cached
      expect(await factory.get(key)).toEqual({ key, count: 1 })

      // should recreate when deleted
      await client.delete(key)
      expect(await factory.get(key)).toEqual({ key, count: 2 })
    })

    it('should not cache an object when the factory does not create it', async () => {
      const factory = new Factory(client, (key: string) => void key as unknown as string)

      // should not create
      expect(await factory.get(key)).toBeUndefined()
      expect(await client.getc(key)).toBeUndefined()
    })
  })

  describe('bundles', () => {
    it('should add some entries to a bundle', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).toEqual({})
      expect((await client.getc(key))).toBeUndefined()

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      expect(await bundle.list()).toEqual({
        foo: 'this is foo',
        bar: 'this is bar',
      })
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      expect(await bundle.get('foo')).toStrictlyEqual('this is foo')
      expect(await bundle.get('bar')).toStrictlyEqual('this is bar')

      await bundle.add('bar', 'this is another bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar\0bar')

      expect(await bundle.list()).toEqual({
        foo: 'this is foo',
        bar: 'this is another bar',
      })
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      expect(await bundle.get('foo')).toStrictlyEqual('this is foo')
      expect(await bundle.get('bar')).toStrictlyEqual('this is another bar')
    })

    it('should compact keys when listing missing keys', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).toEqual({})
      expect((await client.getc(key))).toBeUndefined()

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      await client.delete(`${key}:bar`)
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      expect(await bundle.list()).toEqual({
        foo: 'this is foo',
      })
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
    })

    it('should compact keys when getting missing keys', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).toEqual({})
      expect((await client.getc(key))).toBeUndefined()

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      await client.delete(`${key}:bar`)
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      expect(await bundle.get('foo')).toStrictlyEqual('this is foo')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      expect(await bundle.get('bar')).toBeUndefined()
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
    })

    it('should return values even when the master key is evicted', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).toEqual({})
      expect((await client.getc(key))).toBeUndefined()

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      await client.delete(key)

      expect(await bundle.get('foo')).toStrictlyEqual('this is foo')
      expect(await bundle.get('bar')).toStrictlyEqual('this is bar')
      expect(await bundle.list()).toEqual({})
    })

    it('should delete an entry', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).toEqual({})
      expect((await client.getc(key))).toBeUndefined()

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      await bundle.delete('bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
      expect((await client.getc(`${key}:bar`))).toBeUndefined()

      expect(await bundle.get('foo')).toStrictlyEqual('this is foo')
      expect(await bundle.get('bar')).toBeUndefined()
      expect(await bundle.list()).toEqual({ foo: 'this is foo' })
    })

    it('should delete an entry even when the master key is evicted', async () => {
      const bundle = new Bundle<string>(client, key)

      expect(await bundle.list()).toEqual({})
      expect((await client.getc(key))).toBeUndefined()

      await bundle.add('foo', 'this is foo')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo')
      await bundle.add('bar', 'this is bar')
      expect((await client.getc(key))?.value).toStrictlyEqual('foo\0bar')

      await client.delete(key)

      expect(await bundle.list()).toEqual({})

      await bundle.delete('bar')

      expect(await bundle.get('foo')).toStrictlyEqual('this is foo')
      expect(await bundle.get('bar')).toBeUndefined()
    })
  })

  describe('poor man lock', () => {
    it('should lock', async () => {
      const lock = new PoorManLock(client, key)
      const record: string[] = []

      expect((await client.getc(key))?.value).toBeUndefined()

      record.push('create 1')
      const p1 = lock.execute(async () => {
        expect((await client.getc(key))?.value).toBeFalse() // "anonymous"

        record.push('start 1')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        record.push('end 1')

        expect((await client.getc(key))?.value).toBeFalse() // "anonymous"
      })

      record.push('create 2')
      const p2 = lock.execute(async () => {
        expect((await client.getc(key))?.value).toStrictlyEqual('foo') // owner "foo"
        record.push('execute 2')
      }, { owner: 'foo', timeout: 2000 })

      await Promise.allSettled([ p1, p2 ])

      // lock should be cleared
      expect((await client.getc(key))?.value).toBeUndefined()
      expect(record).toEqual([ 'create 1', 'create 2', 'start 1', 'end 1', 'execute 2' ])
    }, 3000)

    it('should timeout while acquiring an anonymous lock', async () => {
      const lock = new PoorManLock(client, key)
      const record: string[] = []

      expect((await client.getc(key))?.value).toBeUndefined()

      record.push('create 1')
      const p1 = lock.execute(async () => {
        expect((await client.getc(key))?.value).toBeFalse() // anonymous

        record.push('start 1')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        record.push('end 1')

        expect((await client.getc(key))?.value).toBeFalse() // anonymous

        return 'hello, world!'
      })

      record.push('create 2')
      const p2 = lock.execute(async () => {
        record.push('execute 2')
      }, { timeout: 500 })

      await Promise.allSettled([ p1, p2 ])

      expect(await p1).toStrictlyEqual('hello, world!')
      await expect(p2).toBeRejectedWithError(`Lock "${key}" timeout (owner=anonymous)`)

      expect((await client.getc(key))?.value).toBeUndefined()
      expect(record).toEqual([ 'create 1', 'create 2', 'start 1', 'end 1' ])
    }, 3000)

    it('should timeout while acquiring a named lock', async () => {
      const lock = new PoorManLock(client, key)
      const record: string[] = []

      expect((await client.getc(key))?.value).toBeUndefined()

      record.push('create 1')
      const p1 = lock.execute(async () => {
        expect((await client.getc(key))?.value).toStrictlyEqual('foobar') // owner "foobar"

        record.push('start 1')
        await new Promise((resolve) => setTimeout(resolve, 1000))
        record.push('end 1')

        expect((await client.getc(key))?.value).toStrictlyEqual('foobar') // owner "foobar"

        return 'hello, world!'
      }, { owner: 'foobar' })

      record.push('create 2')
      const p2 = lock.execute(async () => {
        record.push('execute 2')
      }, { timeout: 500 })

      await Promise.allSettled([ p1, p2 ])

      expect(await p1).toStrictlyEqual('hello, world!')
      await expect(p2).toBeRejectedWithError(`Lock "${key}" timeout (owner="foobar")`)

      expect((await client.getc(key))?.value).toBeUndefined()
      expect(record).toEqual([ 'create 1', 'create 2', 'start 1', 'end 1' ])
    }, 3000)

    it('should acquire when another process holding the lock crashes', async () => {
      const lockname = `distributed-${process.pid}-${Math.floor(Math.random() * 100000)}`
      const child = exec('tsrun', './test/locker.ts', lockname)

      // this should give the child process enough time to start and lock
      await new Promise((resolve) => void setTimeout(resolve, 500))

      // the first attempt to locking should fail, the child should be locking!
      await expect(new PoorManLock(client, lockname).execute(() => {
        log.error('Initial lock attempt succesful')
      }, { timeout: 100, owner: `test-parent-${process.pid}` }))
          .toBeRejectedWithError(/timeout/)

      // the second attempt should succeed, once the child dies...
      const p1 = new PoorManLock(client, lockname).execute(() => {
        log('Parent process executing 1')
      }, { owner: `test-parent-${process.pid}@1` })
      const p2 = new PoorManLock(client, lockname).execute(() => {
        log('Parent process executing 2')
      }, { owner: `test-parent-${process.pid}@2` })
      const p3 = new PoorManLock(client, lockname).execute(() => {
        log('Parent process executing 3')
      }, { owner: `test-parent-${process.pid}@3` })

      // reap up the child's leftovers...
      await Promise.all([ p1, p2, p3, child ])
    }, 10000)
  })
})
