import { DATA_TYPE, EMPTY_BUFFER, MAGIC, OFFSETS } from './constants'
import assert from 'assert'
import { allocateBuffer, RecyclableBuffer } from './buffers'

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
  recycle: () => void
}

export class Decoder {
  #consumer: (packet: RawIncomingPacket) => void
  #header = Buffer.allocUnsafeSlow(24)
  #body?: RecyclableBuffer
  #pos = 0

  constructor(consumer: (packet: RawIncomingPacket) => void) {
    this.#consumer = consumer
  }

  append(buffer: Buffer, start: number, end: number): void {
    const header = this.#header

    while (start < end) {
      if (this.#pos < 24) {
        const copied = buffer.copy(header, this.#pos, start, end)
        this.#pos += copied
        start += copied
      }

      if (this.#pos < 24) return

      let extras = EMPTY_BUFFER
      let key = EMPTY_BUFFER
      let value = EMPTY_BUFFER
      let recycle = () => void 0

      const bodyLength = header.readUInt32BE(OFFSETS.BODY_LENGTH_$32)
      if (bodyLength) {
        const body = this.#body || (this.#body = allocateBuffer(bodyLength))

        const copied = buffer.copy(body, this.#pos - 24, start, end)
        this.#pos += copied
        start += copied

        if (this.#pos - 24 < body.length) return

        const keyLength = header.readUInt16BE(OFFSETS.KEY_LENGTH_$16)
        const extrasLength = header.readUInt8(OFFSETS.EXTRAS_LENGTH_$8)
        const valueLength = bodyLength - keyLength - extrasLength

        key = keyLength ? body.subarray(extrasLength, extrasLength + keyLength) : EMPTY_BUFFER
        value = valueLength ? body.subarray(extrasLength + keyLength) : EMPTY_BUFFER
        extras = extrasLength ? body.subarray(0, extrasLength) : EMPTY_BUFFER
        recycle = () => void body.recycle()
      }

      const packet: RawIncomingPacket = {
        opcode: header.readUInt8(OFFSETS.OPCODE_$8),
        status: header.readUInt16BE(OFFSETS.STATUS_$16),
        sequence: header.readUInt32BE(OFFSETS.SEQUENCE_$32),
        cas: header.readBigUInt64BE(OFFSETS.CAS_$64),
        extras,
        key,
        value,
        recycle,
      }

      const magic = header.readUInt8(OFFSETS.MAGIC_$8)
      const dataType = header.readUInt8(OFFSETS.DATA_TYPE_$8)
      assert.equal(magic, MAGIC.RESPONSE, 'Invalid magic in header')
      assert.equal(dataType, DATA_TYPE.RAW, 'Invalid data type in header')

      this.#pos = 0
      this.#body = undefined
      this.#consumer(packet)
    }
  }
}
