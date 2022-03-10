import { expect } from 'chai'
import { connection, constants } from '../src/index'

/* ========================================================================== */

import { FakeSocket } from './fake-socket'

const Connection = connection.Connection as {
  new (options?: any): connection.Connection
}

/* ========================================================================== */

describe('Connection', () => {
  const host = process.env.MEMCACHED_HOST || '127.0.0.1'
  const port = parseInt(process.env.MEMCACHED_PORT || '11211')

  it('should construct an instance', () => {
    const c0 = new Connection()
    expect(c0).to.have.property('host', 'localhost')
    expect(c0).to.have.property('port', 11211)
    expect(c0).to.have.property('timeout', 10)

    const c1 = new Connection({ host: 'foo' })
    expect(c1).to.have.property('host', 'foo')
    expect(c1).to.have.property('port', 11211)
    expect(c1).to.have.property('timeout', 10)

    const c2 = new Connection({ host: 'bar', port: 12345, timeout: 99 })
    expect(c2).to.have.property('host', 'bar')
    expect(c2).to.have.property('port', 12345)
    expect(c2).to.have.property('timeout', 99)

    expect(() => new Connection({ host: '', port: 54321 }))
        .to.throw(Error, 'No host name specified')

    expect(() => new Connection({ host: 'foo', port: 0 }))
        .to.throw(Error, 'Invalid port 0')

    expect(() => new Connection({ host: 'foo', port: 65536 }))
        .to.throw(Error, 'Invalid port 65536')

    expect(() => new Connection({ host: 'foo', port: 12.34 }))
        .to.throw(Error, 'Invalid port 12.34')
  })

  it('should create and destroy a connection', async () => {
    const connection = new Connection({ host, port, factory: (): any => {
      throw new Error('SHOULD NOT CONNECT')
    } })
    const destroyed = await connection.destroy()
    expect(destroyed).to.be.false
  })

  it('should create and connect', async () => {
    const connection = new Connection({ host, port, timeout: 1234, factory: (options: any): any => {
      expect(options.host).to.equal(host)
      expect(options.port).to.equal(port)
      expect(options.timeout).to.equal(1234)
      expect(options.onread.buffer).to.be.instanceof(Buffer).with.property('length', 8192)
      expect(options.onread.callback).to.be.a('function')

      return new class extends FakeSocket {
        $write(string: string, callback: (error?: Error) => void): void {
          expect(string).to.equal('800700000000000000000000000000010000000000000000')
          this.$respond('810700000000000000000000000000010000000000000000')
          callback()
        }
      }(options)
    } })

    const reply = await connection.send({ opcode: constants.OPCODE.QUIT })
    expect(reply).to.eql([ {
      opcode: constants.OPCODE.QUIT,
      status: constants.STATUS.OK,
      sequence: 1,
      cas: 0n,
      key: constants.EMPTY_BUFFER,
      value: constants.EMPTY_BUFFER,
      extras: constants.EMPTY_BUFFER,
      recycle: reply[0].recycle,
    } ])

    expect(await connection.destroy()).to.be.false
  })

  it('should handle errors connecting', async () => {
    const connection = new Connection({ host, port, factory: (options: any): any => {
      return new FakeSocket(options, false)
    } })

    await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
        .to.be.rejectedWith(Error, 'Connection Error')
  })

  it('should handle timeouts connecting', async () => {
    const connection = new Connection({ host, port, factory: (options: any): any => {
      return new FakeSocket(options, 'timeout')
    } })

    await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
        .to.be.rejectedWith(Error, 'Timeout')
  })

  it('should handle errors writing', async () => {
    const connection = new Connection({ host, port, factory: (options: any): any => {
      return new FakeSocket(options)
    } })

    await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
        .to.be.rejectedWith(Error, 'Write Error')
  })

  it('should handle timeouts writing', async () => {
    const connection = new Connection({ host, port, factory: (options: any): any => {
      return new class extends FakeSocket {
        $write(): void {
          this.emit('timeout')
        }
      }(options)
    } })

    await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
        .to.be.rejectedWith(Error, 'Timeout')
  })

  it('should fail when response has a different opcode', async () => {
    const connection = new Connection({ host, port, factory: (options: any): any => {
      return new class extends FakeSocket {
        $write(string: string, callback: (error?: Error) => void): void {
          expect(string).to.equal('800700000000000000000000000000010000000000000000')
          this.$respond('810000000000000000000000000000010000000000000000')
          callback()
        }
      }(options)
    } })

    await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
        .to.be.rejectedWith(Error, 'Opcode mismatch (sent=0x07, received=0x00)')
  })

  // it('should fail when the status is faulty', async () => {
  //   const connection = new Connection({ host, port, factory: (options: any): any => {
  //     return new class extends FakeSocket {
  //       $write(string: string, callback: (error?: Error) => void): void {
  //         expect(string).to.equal('800700000000000000000000000000010000000000000000')
  //         this.$respond('81070000000000010000000d00000001000000000000000048656c6c6f2c20776f726c6421')
  //         callback()
  //       }
  //     }(options)
  //   } })

  //   await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
  //       .to.be.rejectedWith(Error, '[KEY_NOT_FOUND] Hello, world!')
  // })

  // it('should fail when the status is unknown', async () => {
  //   const connection = new Connection({ host, port, factory: (options: any): any => {
  //     return new class extends FakeSocket {
  //       $write(string: string, callback: (error?: Error) => void): void {
  //         expect(string).to.equal('800700000000000000000000000000010000000000000000')
  //         this.$respond('810700000000012300000000000000010000000000000000')
  //         callback()
  //       }
  //     }(options)
  //   } })

  //   await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
  //       .to.be.rejectedWith(Error, '[UNKNOWN 0x0123] Unknown Error')
  // })

  it('should handle multiple packets for "stat"', async () => {
    const connection = new Connection({ host, port, factory: (options: any): any => {
      return new class extends FakeSocket {
        $write(string: string, callback: (error?: Error) => void): void {
          expect(string).to.equal('801000000000000000000000000000010000000000000000')
          this.$respond('811000030000000000000006000000010000000000000000666f6f626172')
          this.$respond('811000000000000000000000000000010000000000000000')
          callback()
        }
      }(options)
    } })

    const result = await connection.send({ opcode: constants.OPCODE.STAT })
    expect(result).to.eql([ {
      opcode: 16,
      status: 0,
      sequence: 1,
      cas: 0n,
      key: Buffer.from('foo'),
      value: Buffer.from('bar'),
      extras: constants.EMPTY_BUFFER,
      recycle: result[0].recycle,
    }, {
      opcode: 16,
      status: 0,
      sequence: 1,
      cas: 0n,
      key: constants.EMPTY_BUFFER,
      value: constants.EMPTY_BUFFER,
      extras: constants.EMPTY_BUFFER,
      recycle: result[1].recycle,
    } ])
  })

  it('should timeout when resoponse is lagging', async function() {
    this.slow(200)

    const connection = new Connection({ host, port, timeout: 100, factory: (options: any): any => {
      return new class extends FakeSocket {
        $write(string: string, callback: (error?: Error) => void): void {
          expect(string).to.equal('800700000000000000000000000000010000000000000000')
          this.$respond('810700000000000000000000000000020000000000000000')
          callback()
        }
      }(options)
    } })

    const now = Date.now()

    await expect(connection.send({ opcode: constants.OPCODE.QUIT }))
        .to.be.rejectedWith(Error, 'No response')

    expect(Date.now() - now).to.be.closeTo(100, 10)
  })

  it('should work with a real memcached server', async function() {
    this.slow(200)

    const connection = new Connection({ host, port })
    expect(connection.connected).to.be.false

    const promise = connection.send({ opcode: constants.OPCODE.QUIT })
    expect(connection.connected).to.be.true

    const result = await promise
    expect(result).to.eql([ {
      opcode: constants.OPCODE.QUIT,
      status: constants.STATUS.OK,
      sequence: 1,
      cas: 0n,
      key: constants.EMPTY_BUFFER,
      value: constants.EMPTY_BUFFER,
      extras: constants.EMPTY_BUFFER,
      recycle: result[0].recycle,
    } ])

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(connection.connected).to.be.false
  })
})
