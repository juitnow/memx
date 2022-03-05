import { decode, constants } from '../src/index'
import { expect } from 'chai'
import { randomFillSync } from 'crypto'

describe('Decoding Packets', () => {
  const processed: decode.RawIncomingPacket[] = []
  function handler(incoming: decode.RawIncomingPacket): void {
    processed.push(incoming)
  }

  afterEach(() => processed.splice(0))

  it('should decode packets from buffers of various length', () => {
    const packets = [
      randomFillSync(Buffer.alloc(24 + 0)),
      randomFillSync(Buffer.alloc(24 + 64)),
      randomFillSync(Buffer.alloc(24 + 512)),
    ]

    packets[0].writeUInt8(0x81, 0) // magic
    packets[1].writeUInt8(0x81, 0)
    packets[2].writeUInt8(0x81, 0)

    packets[0].writeUInt8(0x0, 5) // data type
    packets[1].writeUInt8(0x0, 5)
    packets[2].writeUInt8(0x0, 5)

    packets[0].writeUInt16BE(0, 2) // key length
    packets[1].writeUInt16BE(20, 2)
    packets[2].writeUInt16BE(200, 2)

    packets[0].writeUInt8(0, 4) // extras length
    packets[1].writeUInt8(10, 4)
    packets[2].writeUInt8(100, 4)

    packets[0].writeUInt32BE(0, 8) // body length
    packets[1].writeUInt32BE(64, 8)
    packets[2].writeUInt32BE(512, 8)

    const extras = [
      packets[0].subarray(24, 24).toString('hex'),
      packets[1].subarray(24, 34).toString('hex'),
      packets[2].subarray(24, 124).toString('hex'),
    ]

    const keys = [
      packets[0].subarray(24, 24).toString('hex'),
      packets[1].subarray(34, 54).toString('hex'),
      packets[2].subarray(124, 324).toString('hex'),
    ]

    const values = [
      packets[0].subarray(24).toString('hex'),
      packets[1].subarray(54).toString('hex'),
      packets[2].subarray(324).toString('hex'),
    ]

    const buffer = Buffer.concat(packets)

    for (let i = 1; i <= buffer.length; i ++) {
      const incoming = new decode.Decoder(handler)

      for (let s = 0, e = s + i; s < buffer.length; s = e, e = s + i) {
        if (e > buffer.length) e = buffer.length
        incoming.append(buffer, s, e)
      }

      expect(processed.length).to.equal(3, `Wrong packets received for i=${i}`)

      for (let n = 0; n < 3; n ++) {
        expect(processed[n].key.toString('hex')).to.equal(keys[n], `Wrong key for p=${n} i=${i}`)
        expect(processed[n].value.toString('hex')).to.equal(values[n], `Wrong value for p=${n} i=${i}`)
        expect(processed[n].extras.toString('hex')).to.equal(extras[n], `Wrong extras for p=${n} i=${i}`)
      }

      processed.splice(0)
    }
  })

  it('should decode a packet with some specific data', () => {
    const buffer = Buffer.from([
      0x81, 0x07, 0x00, 0x05, // response, opcode "quit", key length (x2)
      0x06, 0x00, 0x00, 0x03, // extras length, data type, status "too large" (x2)
      0x00, 0x00, 0x00, 0x11, // body length=15 (extra=6, key=5, value=6)
      0x01, 0x02, 0x03, 0x04, // sequence
      0x05, 0x06, 0x07, 0x08, // cas...
      0x09, 0x0a, 0x0b, 0x0c, // ...cas
      0x46, 0x6f, 0x6f, 0x42, 0x61, 0x72, // extra ("FooBar")
      0x48, 0x65, 0x6c, 0x6c, 0x6f, // key ("Hello")
      0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21, // value ("World")
    ])

    new decode.Decoder(handler).append(buffer, 0, buffer.length)

    expect(processed).to.eql([ {
      opcode: constants.OPCODE.QUIT,
      status: constants.STATUS.TOO_LARGE,
      sequence: 0x01020304,
      cas: 0x05060708090a0b0cn,
      extras: Buffer.from('FooBar', 'utf-8'),
      key: Buffer.from('Hello', 'utf-8'),
      value: Buffer.from('World!', 'utf-8'),
    } ])
  })
})
