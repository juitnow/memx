import { expect } from 'chai'

import { constants, encode } from '../src/index'

describe('Encoding Packets', () => {
  it('should encode a packet with all information required', () => {
    const encoder = new encode.Encoder()

    const buffer = encoder.encode({
      opcode: constants.OPCODE.QUIT,
      sequence: 0x01020304,
      cas: 0x05060708090a0b0cn,
      extras: Buffer.from('FooBar', 'utf-8'),
      key: Buffer.from('Hello', 'utf-8'),
      value: Buffer.from('World!', 'utf-8'),
    })

    expect(buffer.toString('hex')).to.eql(Buffer.from([
      0x80, 0x07, 0x00, 0x05, // request, opcode "quit", key length (x2)
      0x06, 0x00, 0x00, 0x00, // extras length, data type, vbucket 0x00 (x2)
      0x00, 0x00, 0x00, 0x11, // body length=15 (extra=6, key=5, value=6)
      0x01, 0x02, 0x03, 0x04, // sequence
      0x05, 0x06, 0x07, 0x08, // cas...
      0x09, 0x0a, 0x0b, 0x0c, // ...cas
      0x46, 0x6f, 0x6f, 0x42, 0x61, 0x72, // extra ("FooBar")
      0x48, 0x65, 0x6c, 0x6c, 0x6f, // key ("Hello")
      0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21, // value ("World")
    ]).toString('hex'))
  })

  it('should encode a packet with minimal details', () => {
    const encoder = new encode.Encoder()

    const buffer = encoder.encode({
      opcode: constants.OPCODE.DECREMENT,
    }, 0x01020304)

    expect(buffer.toString('hex')).to.eql(Buffer.from([
      0x80, 0x06, 0x00, 0x00, // request, opcode "decrement", key length (x2)
      0x00, 0x00, 0x00, 0x00, // extras length, data type, vbucket 0x00 (x2)
      0x00, 0x00, 0x00, 0x00, // body length=15 (extra=6, key=5, value=6)
      0x01, 0x02, 0x03, 0x04, // sequence
      0x00, 0x00, 0x00, 0x00, // cas...
      0x00, 0x00, 0x00, 0x00, // ...cas
    ]).toString('hex'))
  })
})
