import { DATA_TYPE, EMPTY_BUFFER, MAGIC, VBUCKET, OPCODE, OFFSETS } from './constants'

// Writing the full header would be like
// header.writeUInt8       (magic,         0)
// header.writeUInt8       (opcode,        1)
// header.writeUInt16BE    (key_length,    2)
// header.writeUInt8       (extras_length, 4)
// header.writeUInt8       (data_type,     5)
// header.writeUInt16BE    (status,        6)
// header.writeUInt32BE    (body_length,   8)
// header.writeUInt32BE    (sequence,     12)
// header.writeBigUInt64BE (cas,          16)

// keep as an "enum", the compiler will replace with values
enum SIZES {
  BUFFER_SIZE = 16384, // normal buffer size
  HEADER_SIZE = 24, // header size
  BODY_SIZE = 16360, // body size: buffer - header
}

export interface RawOutgoingPacket {
  readonly opcode: OPCODE
  readonly sequence?: number
  readonly cas?: bigint

  readonly extras?: Buffer
  readonly extrasOffset?: number
  readonly extrasLength?: number

  readonly key?: Buffer
  readonly keyOffset?: number
  readonly keyLength?: number

  readonly value?: Buffer
  readonly valueOffset?: number
  readonly valueLength?: number
}

export class Encoder {
  readonly #buffer = Buffer.allocUnsafe(SIZES.BUFFER_SIZE)

  encode(packet: RawOutgoingPacket, seq: number = 0): Buffer {
    const {
      opcode,
      sequence = seq,
      cas = 0n,

      extras = EMPTY_BUFFER,
      extrasOffset = 0,
      extrasLength = extras.length,

      key = EMPTY_BUFFER,
      keyOffset = 0,
      keyLength = key.length,

      value = EMPTY_BUFFER,
      valueOffset = 0,
      valueLength = value.length,
    } = packet

    // console.log('-->', extrasOffset, extrasLength)

    const bodyLength = extrasLength + keyLength + valueLength
    const length = bodyLength + SIZES.HEADER_SIZE

    const buffer = bodyLength <= SIZES.BODY_SIZE ? this.#buffer :
        Buffer.allocUnsafe(SIZES.HEADER_SIZE + bodyLength)

    buffer.writeUInt8(MAGIC.REQUEST, OFFSETS.MAGIC_$8)
    buffer.writeUInt8(opcode, OFFSETS.OPCODE_$8)
    buffer.writeUInt16BE(keyLength, OFFSETS.KEY_LENGTH_$16)
    buffer.writeUInt8(extrasLength, OFFSETS.EXTRAS_LENGTH_$8)
    buffer.writeUInt8(DATA_TYPE.RAW, OFFSETS.DATA_TYPE_$8)
    buffer.writeUInt16BE(VBUCKET.NIL, OFFSETS.STATUS_$16)
    buffer.writeUInt32BE(bodyLength, OFFSETS.BODY_LENGTH_$32)
    buffer.writeUInt32BE(sequence, OFFSETS.SEQUENCE_$32)
    buffer.writeBigUInt64BE(cas, OFFSETS.CAS_$64)

    let pos = 24
    if (extrasLength) pos += extras.copy(buffer, pos, extrasOffset, extrasOffset + extrasLength)
    if (keyLength) pos += key.copy(buffer, pos, keyOffset, keyOffset + keyLength)
    if (valueLength) pos += value.copy(buffer, pos, valueOffset, valueOffset + valueLength)
    void pos

    return buffer.length === length ? buffer : buffer.subarray(0, length)
  }
}
