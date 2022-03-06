import { Adapter, Counter, Result } from './adapter'
import { Connection, ConnectionOptions } from './connection'
import { OPCODE, STATUS } from './constants'
import { RawIncomingPacket } from './decode'

function fail(packet: RawIncomingPacket, key?: string): never {
  const message = packet.value.toString('utf-8') || 'Unknown Error'
  const status = STATUS[packet.status] || `0x${packet.status.toString(16).padStart(4, '0')}`
  throw new Error(`${message} (status=${status}${key ? `, key=${key}` : ''})`)
}

function hashCode(key: string): number {
  const length = key.length
  let hash = 0

  for (let i = 0; i < length; i ++) hash = hash * 31 + key.charCodeAt(i)

  return hash
}

export interface ServerOptions extends ConnectionOptions {
  ttl?: number
}

export class Server implements Adapter {
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

  async get(
    key: string,
    options: { ttl?: number } = {},
  ): Promise<Result | void> {
    const { ttl } = options

    const hash = hashCode(key)
    void hash

    let extras: Buffer | undefined
    if (ttl) {
      extras = Buffer.alloc(4)
      extras.writeUInt32BE(ttl)
    }

    const [ response ] = await this.#connection.send({
      opcode: ttl ? OPCODE.GAT : OPCODE.GET,
      key: Buffer.from(key, 'utf-8'),
      extras,
    })

    switch (response.status) {
      case STATUS.OK:
        return {
          key,
          value: response.value,
          flags: response.extras.readUInt32BE(),
          cas: response.cas,
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

    const extras = Buffer.alloc(4)
    extras.writeUInt32BE(ttl)

    const [ response ] = await this.#connection.send({
      opcode: OPCODE.TOUCH,
      key: Buffer.from(key, 'utf-8'),
      extras,
    })

    switch (response.status) {
      case STATUS.OK:
        return true
      case STATUS.KEY_NOT_FOUND:
        return false
      default:
        fail(response, key)
    }
  }

  /* ======================================================================== */

  async #sar(
    opcode: OPCODE.SET | OPCODE.ADD | OPCODE.REPLACE,
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number },
  ): Promise<Result | void> {
    const { flags = 0, cas = 0n, ttl = this.#ttl } = options

    const extras = Buffer.alloc(8)
    extras.writeUInt32BE(flags, 0)
    extras.writeUInt32BE(ttl, 4)

    const [ response ] = await this.#connection.send({
      opcode: opcode,
      key: Buffer.from(key, 'utf-8'),
      value,
      cas,
      extras,
    })

    switch (response.status) {
      case STATUS.OK:
        return {
          key,
          value,
          flags,
          cas: response.cas,
        }
      case STATUS.KEY_NOT_FOUND:
      case STATUS.KEY_EXISTS:
        return
      default:
        fail(response, key)
    }
  }

  set(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<Result | void> {
    return this.#sar(OPCODE.SET, key, value, options)
  }

  add(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<Result | void> {
    return this.#sar(OPCODE.ADD, key, value, options)
  }

  replace(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<Result | void> {
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

    const [ response ] = await this.#connection.send({
      opcode: opcode,
      key: Buffer.from(key, 'utf-8'),
      value,
      cas,
    })

    switch (response.status) {
      case STATUS.OK:
        return true
      case STATUS.ITEM_NOT_STORED:
      case STATUS.KEY_EXISTS:
        return false
      default:
        fail(response, key)
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

  async #crement(
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

    const extras = Buffer.alloc(20)
    extras.writeBigInt64BE(BigInt(delta), 0)
    extras.writeBigInt64BE(BigInt(initial), 8)
    extras.writeUInt32BE(create ? ttl : 0xffffffff, 16)

    const [ response ] = await this.#connection.send({
      opcode: opcode,
      key: Buffer.from(key, 'utf-8'),
      extras,
      cas,
    })

    switch (response.status) {
      case STATUS.OK:
        return {
          key: key,
          value: response.value.readBigInt64BE(0),
          cas: response.cas,
        }
      case STATUS.KEY_NOT_FOUND:
      case STATUS.KEY_EXISTS:
        return
      default:
        fail(response, key)
    }
  }

  increment(
    key: string,
    delta: bigint | number = 1,
    options: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean } = {},
  ): Promise<Counter | void> {
    return this.#crement(OPCODE.INCREMENT, key, delta, options)
  }

  decrement(
    key: string,
    delta: bigint | number = 1,
    options: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean } = {},
  ): Promise<Counter | void> {
    return this.#crement(OPCODE.DECREMENT, key, delta, options)
  }

  /* ======================================================================== */

  async delete(
    key: string,
    options: { cas?: bigint } = {},
  ): Promise<boolean> {
    const { cas = 0n } = options

    const [ response ] = await this.#connection.send({
      opcode: OPCODE.DELETE,
      key: Buffer.from(key, 'utf-8'),
      cas,
    })

    switch (response.status) {
      case STATUS.OK:
        return true
      case STATUS.KEY_NOT_FOUND:
      case STATUS.KEY_EXISTS:
        return false
      default:
        fail(response, key)
    }
  }

  async flush(ttl: number = 0): Promise<void> {
    let extras: Buffer | undefined
    if (ttl > 0) {
      extras = Buffer.alloc(4)
      extras.writeUInt32BE(ttl)
    }

    const [ response ] = await this.#connection.send({
      opcode: OPCODE.FLUSH,
      extras,
    })

    switch (response.status) {
      case STATUS.OK:
        return
      default:
        fail(response)
    }
  }

  /* ======================================================================== */

  async noop(): Promise<void> {
    const [ response ] = await this.#connection.send({
      opcode: OPCODE.NOOP,
    })

    switch (response.status) {
      case STATUS.OK:
        return
      default:
        fail(response)
    }
  }

  async quit(): Promise<void> {
    const [ response ] = await this.#connection.send({
      opcode: OPCODE.QUIT,
    })

    switch (response.status) {
      case STATUS.OK:
        return
      default:
        fail(response)
    }
  }

  async version(): Promise<string> {
    const [ response ] = await this.#connection.send({
      opcode: OPCODE.VERSION,
    })

    switch (response.status) {
      case STATUS.OK:
        return response.value.toString('utf-8')
      default:
        fail(response)
    }
  }

  async stats(): Promise<Record<string, string>> {
    const response = await this.#connection.send({
      opcode: OPCODE.STAT,
    })

    return response.reduce((result, packet) => {
      if (packet.status === STATUS.OK) {
        const key = packet.key.toString('utf-8')
        const value = packet.value.toString('utf-8')
        if (key && value) result[key] = value
        return result
      }

      fail(packet)
    }, {} as Record<string, string>)
  }
}
