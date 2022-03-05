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

export interface RawOutgoingPacket {
  readonly opcode: OPCODE
  readonly sequence?: number
  readonly cas?: bigint
  readonly extras?: Buffer
  readonly key?: Buffer
  readonly value?: Buffer
}

export class Encoder {
  encode(packet: RawOutgoingPacket, seq: number = 0): Buffer {
    const {
      opcode,
      sequence = seq,
      cas = 0n,
      extras = EMPTY_BUFFER,
      key = EMPTY_BUFFER,
      value = EMPTY_BUFFER,
    } = packet

    const bodyLength = extras.length + key.length + value.length
    const buffer = Buffer.alloc(24 + bodyLength)

    buffer.writeUInt8(MAGIC.REQUEST, OFFSETS.MAGIC_$8)
    buffer.writeUInt8(opcode, OFFSETS.OPCODE_$8)
    buffer.writeUInt16BE(key.length, OFFSETS.KEY_LENGTH_$16)
    buffer.writeUInt8(extras.length, OFFSETS.EXTRAS_LENGTH_$8)
    buffer.writeUInt8(DATA_TYPE.RAW, OFFSETS.DATA_TYPE_$8)
    buffer.writeUInt16BE(VBUCKET.NIL, OFFSETS.STATUS_$16)
    buffer.writeUInt32BE(bodyLength, OFFSETS.BODY_LENGTH_$32)
    buffer.writeUInt32BE(sequence, OFFSETS.SEQUENCE_$32)
    buffer.writeBigUInt64BE(cas, OFFSETS.CAS_$64)

    let pos = 24
    if (extras.length) pos += extras.copy(buffer, pos)
    if (key.length) pos += key.copy(buffer, pos)
    if (value.length) pos += value.copy(buffer, pos)
    void pos

    return buffer
  }
}
