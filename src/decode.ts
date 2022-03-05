import { DATA_TYPE, EMPTY_BUFFER, MAGIC, OFFSETS } from './constants'
import assert from 'assert'

// Reading the full header would be like
// const magic =         header.readUInt8        (0)
// const opcode =        header.readUInt8        (1)
// const key_length =    header.readUInt16BE     (2)
// const extras_length = header.readUInt8        (4)
// const data_type =     header.readUInt8        (5)
// const status =        header.readUInt16BE     (6)
// const body_length =   header.readUInt32BE     (8)
// const sequence =      header.readUInt32BE    (12)
// const cas =           header.readBigUInt64BE (16)

export interface RawIncomingPacket {
  readonly opcode: number
  readonly status: number
  readonly sequence: number
  readonly cas: bigint
  readonly extras: Buffer
  readonly key: Buffer
  readonly value: Buffer
}

export class Decoder {
  #consumer: (packet: RawIncomingPacket) => void
  #header = Buffer.alloc(24)
  #body?: Buffer
  #pos = 0

  constructor(consumer: (packet: RawIncomingPacket) => void) {
    this.#consumer = consumer
  }

  append(buffer: Buffer, start: number, end: number): void {
    while (start < end) {
      if (this.#pos < 24) {
        const copied = buffer.copy(this.#header, this.#pos, start, end)
        this.#pos += copied
        start += copied
      }

      if (this.#pos < 24) return

      let key: Buffer
      let value: Buffer
      let extras: Buffer

      const bodyLength = this.#header.readUInt32BE(OFFSETS.BODY_LENGTH_$32)
      if (bodyLength) {
        const body = this.#body || (this.#body = Buffer.alloc(bodyLength))

        const copied = buffer.copy(body, this.#pos - 24, start, end)
        this.#pos += copied
        start += copied

        if (this.#pos - 24 < body.length) return

        const keyLength = this.#header.readUInt16BE(OFFSETS.KEY_LENGTH_$16)
        const extrasLength = this.#header.readUInt8(OFFSETS.EXTRAS_LENGTH_$8)

        key = body.subarray(extrasLength, extrasLength + keyLength)
        value = body.subarray(extrasLength + keyLength)
        extras = body.subarray(0, extrasLength)
      } else {
        extras = key = value = EMPTY_BUFFER
      }

      const magic = this.#header.readUInt8(OFFSETS.MAGIC_$8)
      const dataType = this.#header.readUInt8(OFFSETS.DATA_TYPE_$8)
      assert.equal(magic, MAGIC.RESPONSE, 'Invalid magic in header')
      assert.equal(dataType, DATA_TYPE.RAW, 'Invalid data type in header')

      const packet: RawIncomingPacket = {
        opcode: this.#header.readUInt8(OFFSETS.OPCODE_$8),
        status: this.#header.readUInt16BE(OFFSETS.STATUS_$16),
        sequence: this.#header.readUInt32BE(OFFSETS.SEQUENCE_$32),
        cas: this.#header.readBigUInt64BE(OFFSETS.CAS_$64),
        key,
        value,
        extras,
      }

      this.#body = undefined
      this.#pos = 0

      this.#consumer(packet)
    }
  }
}
