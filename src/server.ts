import { Adapter, Counter, GetResult } from './adapter'
import { Connection, ConnectionOptions } from './connection'
import { BUFFERS, OPCODE, STATUS } from './constants'
import { RawIncomingPacket } from './decode'

function fail(packet: RawIncomingPacket, key?: string): never {
  const message = packet.value.toString('utf-8') || 'Unknown Error'
  const status = STATUS[packet.status] || `0x${packet.status.toString(16).padStart(4, '0')}`
  throw new Error(`${message} (status=${status}${key ? `, key=${key}` : ''})`)
}

// function hashCode(key: string): number {
//   const length = key.length
//   let hash = 0

//   for (let i = 0; i < length; i ++) hash = hash * 31 + key.charCodeAt(i)

//   return hash
// }

export interface ServerOptions extends ConnectionOptions {
  ttl?: number
}

export class Server implements Adapter {
  #buffer = Buffer.alloc(BUFFERS.KEY_TOO_BIG + 20) // 20 is the max extras we'll write

  #connection!: Connection
  #ttl!: number

  constructor(options: ServerOptions) {
    this.#connection = new Connection(options)
    this.#ttl = options.ttl || 0 // never
  }

  get connected(): boolean {
    return this.#connection.connected
  }

  /* ======================================================================== */

  #writeKey(key: string, offset: number = 0): number {
    const keyLength = this.#buffer.write(key, offset, BUFFERS.KEY_TOO_BIG, 'utf-8')
    if (keyLength > BUFFERS.KEY_SIZE) throw new Error(`Key too long (len=${keyLength})`)
    return keyLength
  }

  /* ======================================================================== */

  async get(
    key: string,
    options: { ttl?: number } = {},
  ): Promise<GetResult | void> {
    const { ttl } = options

    let keyOffset = 0
    if (ttl) keyOffset = this.#buffer.writeUInt32BE(ttl)
    const keyLength = this.#writeKey(key, keyOffset)

    const [ response ] = await this.#connection.send({
      opcode: ttl ? OPCODE.GAT : OPCODE.GET,
      extras: this.#buffer,
      extrasOffset: 0,
      extrasLength: keyOffset,
      key: this.#buffer,
      keyOffset,
      keyLength,
    })

    switch (response.status) {
      case STATUS.OK:
        return {
          value: response.value,
          flags: response.extras.readUInt32BE(),
          cas: response.cas,
          recycle: () => response.recycle(),
        }
      case STATUS.KEY_NOT_FOUND:
        return
      default:
        fail(response, key)
    }
  }

  async touch(
    key: string,
    options: { ttl?: number } = {},
  ): Promise<boolean> {
    const { ttl = this.#ttl } = options

    const keyOffset = this.#buffer.writeUInt32BE(ttl)
    const keyLength = this.#writeKey(key, keyOffset)

    const [ response ] = await this.#connection.send({
      opcode: OPCODE.TOUCH,
      extras: this.#buffer,
      extrasOffset: 0,
      extrasLength: keyOffset,
      key: this.#buffer,
      keyOffset,
      keyLength,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return true
        case STATUS.KEY_NOT_FOUND:
          return false
        default:
          fail(response, key)
      }
    } finally {
      response.recycle()
    }
  }

  /* ======================================================================== */

  async #sar(
    opcode: OPCODE.SET | OPCODE.ADD | OPCODE.REPLACE,
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number },
  ): Promise<bigint | void> {
    const { flags = 0, cas = 0n, ttl = this.#ttl } = options

    let keyOffset: number
    keyOffset = this.#buffer.writeUInt32BE(flags)
    keyOffset = this.#buffer.writeUInt32BE(ttl, keyOffset)
    const keyLength = this.#writeKey(key, keyOffset)

    const [ response ] = await this.#connection.send({
      opcode: opcode,
      cas,
      extras: this.#buffer,
      extrasOffset: 0,
      extrasLength: keyOffset,
      key: this.#buffer,
      keyOffset,
      keyLength,
      value,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return response.cas
        case STATUS.KEY_NOT_FOUND:
        case STATUS.KEY_EXISTS:
          return
        default:
          fail(response, key)
      }
    } finally {
      response.recycle()
    }
  }

  set(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<bigint | void> {
    return this.#sar(OPCODE.SET, key, value, options)
  }

  add(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<bigint | void> {
    return this.#sar(OPCODE.ADD, key, value, options)
  }

  replace(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<bigint | void> {
    return this.#sar(OPCODE.REPLACE, key, value, options)
  }

  /* ======================================================================== */

  async #pend(
    opcode: OPCODE.APPEND | OPCODE.PREPEND,
    key: string,
    value: Buffer,
    options: { cas?: bigint },
  ): Promise<boolean> {
    const { cas = 0n } = options

    const keyLength = this.#writeKey(key)

    const [ response ] = await this.#connection.send({
      opcode: opcode,
      cas,
      key: Buffer.from(key, 'utf-8'),
      keyOffset: 0,
      keyLength,
      value,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return true
        case STATUS.ITEM_NOT_STORED:
        case STATUS.KEY_EXISTS:
          return false
        default:
          fail(response, key)
      }
    } finally {
      response.recycle()
    }
  }

  append(
    key: string,
    value: Buffer,
    options: { cas?: bigint } = {},
  ): Promise<boolean> {
    return this.#pend(OPCODE.APPEND, key, value, options)
  }

  prepend(
    key: string,
    value: Buffer,
    options: { cas?: bigint } = {},
  ): Promise<boolean> {
    return this.#pend(OPCODE.PREPEND, key, value, options)
  }

  /* ======================================================================== */

  async #counter(
    opcode: OPCODE.INCREMENT | OPCODE.DECREMENT,
    key: string,
    delta: bigint | number,
    options: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean },
  ): Promise<Counter | void> {
    const {
      initial = 0n,
      cas = 0n,
      ttl = this.#ttl,
      create = true,
    } = options

    let keyOffset: number
    keyOffset = this.#buffer.writeBigInt64BE(BigInt(delta))
    keyOffset = this.#buffer.writeBigInt64BE(BigInt(initial), keyOffset)
    keyOffset = this.#buffer.writeUInt32BE(create ? ttl : 0xffffffff, keyOffset)
    const keyLength = this.#writeKey(key, keyOffset)

    const [ response ] = await this.#connection.send({
      opcode: opcode,
      extras: this.#buffer,
      extrasOffset: 0,
      extrasLength: keyOffset,
      key: this.#buffer,
      keyOffset,
      keyLength,
      cas,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return {
            value: response.value.readBigInt64BE(0),
            cas: response.cas,
          }
        case STATUS.KEY_NOT_FOUND:
        case STATUS.KEY_EXISTS:
          return
        default:
          fail(response, key)
      }
    } finally {
      response.recycle()
    }
  }

  increment(
    key: string,
    delta: bigint | number = 1,
    options: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean } = {},
  ): Promise<Counter | void> {
    return this.#counter(OPCODE.INCREMENT, key, delta, options)
  }

  decrement(
    key: string,
    delta: bigint | number = 1,
    options: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean } = {},
  ): Promise<Counter | void> {
    return this.#counter(OPCODE.DECREMENT, key, delta, options)
  }

  /* ======================================================================== */

  async delete(
    key: string,
    options: { cas?: bigint } = {},
  ): Promise<boolean> {
    const { cas = 0n } = options

    const keyLength = this.#writeKey(key)

    const [ response ] = await this.#connection.send({
      opcode: OPCODE.DELETE,
      key: this.#buffer,
      keyOffset: 0,
      keyLength,
      cas,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return true
        case STATUS.KEY_NOT_FOUND:
        case STATUS.KEY_EXISTS:
          return false
        default:
          fail(response, key)
      }
    } finally {
      response.recycle()
    }
  }

  async flush(ttl: number = 0): Promise<void> {
    const extrasLength = ttl ? this.#buffer.writeUInt32BE(ttl) : 0

    const [ response ] = await this.#connection.send({
      opcode: OPCODE.FLUSH,
      extras: this.#buffer,
      extrasOffset: 0,
      extrasLength,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return
        default:
          fail(response)
      }
    } finally {
      response.recycle()
    }
  }

  /* ======================================================================== */

  async noop(): Promise<void> {
    const [ response ] = await this.#connection.send({
      opcode: OPCODE.NOOP,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return
        default:
          fail(response)
      }
    } finally {
      response.recycle()
    }
  }

  async quit(): Promise<void> {
    const [ response ] = await this.#connection.send({
      opcode: OPCODE.QUIT,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return
        default:
          fail(response)
      }
    } finally {
      response.recycle()
    }
  }

  async version(): Promise<string> {
    const [ response ] = await this.#connection.send({
      opcode: OPCODE.VERSION,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return response.value.toString('utf-8')
        default:
          fail(response)
      }
    } finally {
      response.recycle()
    }
  }

  async stats(): Promise<Record<string, string>> {
    const responses = await this.#connection.send({
      opcode: OPCODE.STAT,
    })

    return responses.reduce((result, packet) => {
      try {
        if (packet.status === STATUS.OK) {
          const key = packet.key.toString('utf-8')
          const value = packet.value.toString('utf-8')
          if (key && value) result[key] = value
          return result
        }

        fail(packet)
      } finally {
        packet.recycle()
      }
    }, {} as Record<string, string>)
  }
}
