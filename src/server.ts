import { Adapter, Counter, AdapterResult, Stats } from './types'
import { Connection, ConnectionOptions } from './connection'
import { BUFFERS, OPCODE, STATUS } from './constants'
import { RawIncomingPacket } from './decode'

const statsBigInt: readonly string[] = [
  'auth_cmds', 'auth_errors', 'bytes', 'bytes_read', 'bytes_written', 'cas_badval', 'cas_hits', 'cas_misses',
  'cmd_flush', 'cmd_get', 'cmd_set', 'cmd_touch', 'conn_yields', 'crawler_items_checked', 'crawler_reclaimed',
  'curr_items', 'decr_hits', 'decr_misses', 'delete_hits', 'delete_misses', 'direct_reclaims', 'evicted_active',
  'evicted_unfetched', 'evictions', 'expired_unfetched', 'get_expired', 'get_flushed', 'get_hits', 'get_misses',
  'hash_bytes', 'idle_kicks', 'incr_hits', 'incr_misses', 'limit_maxbytes', 'listen_disabled_num', 'log_watcher_sent',
  'log_watcher_skipped', 'log_watchers', 'log_worker_dropped', 'log_worker_written', 'lru_crawler_running',
  'lru_crawler_starts', 'lru_maintainer_juggles', 'lrutail_reflocked', 'malloc_fails', 'moves_to_cold',
  'moves_to_warm', 'moves_within_lru', 'read_buf_bytes', 'read_buf_bytes_free', 'read_buf_count', 'read_buf_oom',
  'reclaimed', 'rejected_connections', 'response_obj_bytes', 'response_obj_count', 'response_obj_oom',
  'round_robin_fallback', 'slab_reassign_busy_deletes', 'slab_reassign_busy_items', 'slab_reassign_chunk_rescues',
  'slab_reassign_evictions_nomem', 'slab_reassign_inline_reclaim', 'slab_reassign_rescues', 'slabs_moved',
  'store_no_memory', 'store_too_large', 'time_in_listen_disabled_us', 'total_items', 'touch_hits', 'touch_misses',
  'unexpected_napi_ids',
]

const statsNumber: readonly string[] = [
  'connection_structures', 'curr_connections', 'hash_power_level', 'max_connections', 'pid', 'pointer_size',
  'reserved_fds', 'slab_global_page_pool', 'threads', 'time', 'total_connections', 'uptime',
] as const

const statsBoolean: readonly string[] = [ 'accepting_conns', 'hash_is_expanding', 'slab_reassign_running' ] as const

const statsMicroseconds: readonly string[] = [ 'rusage_system', 'rusage_user' ] as const

function injectStats(key: string, value: string, stats: any): Stats {
  if (! key) return stats

  if (statsBigInt.includes(key)) {
    stats[key] = BigInt(value)
  } else if (statsNumber.includes(key)) {
    stats[key] = Number(value)
  } else if (statsBoolean.includes(key)) {
    stats[key] = !! Number(value)
  } else if (statsMicroseconds.includes(key)) {
    const splits = value.split('.')
    stats[key] = BigInt(`${splits[0]}${splits[1].padEnd(6, '0')}`)
  } else {
    stats[key] = value
  }
  return stats
}


function fail(packet: RawIncomingPacket, key?: string): never {
  const message = packet.value.toString('utf-8') || 'Unknown Error'
  const status = STATUS[packet.status] || `0x${packet.status.toString(16).padStart(4, '0')}`
  throw new Error(`${message} (status=${status}${key ? `, key=${key}` : ''})`)
}

export interface ServerOptions extends ConnectionOptions {
  ttl?: number
}

export class ServerAdapter implements Adapter {
  #buffer = Buffer.alloc(BUFFERS.KEY_TOO_BIG + 20) // 20 is the max extras we'll write

  #connection!: Connection
  #ttl!: number

  readonly #id!: string

  constructor(options: ServerOptions) {
    this.#connection = new Connection(options)
    this.#ttl = options.ttl || 0 // never
    this.#id = `${this.#connection.host}:${this.#connection.port}`
  }

  /* ======================================================================== */

  get connected(): boolean {
    return this.#connection.connected
  }

  get host(): string {
    return this.#connection.host
  }

  get port(): number {
    return this.#connection.port
  }

  get timeout(): number {
    return this.#connection.timeout
  }

  get ttl(): number {
    return this.#ttl
  }

  get id(): string {
    return this.#id
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
  ): Promise<AdapterResult | undefined> {
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
  ): Promise<bigint | undefined> {
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
  ): Promise<bigint | undefined> {
    return this.#sar(OPCODE.SET, key, value, options)
  }

  add(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<bigint | undefined> {
    return this.#sar(OPCODE.ADD, key, value, options)
  }

  replace(
    key: string,
    value: Buffer,
    options: { flags?: number, cas?: bigint, ttl?: number } = {},
  ): Promise<bigint | undefined> {
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
    options: { initial?: bigint | number, cas?: bigint, ttl?: number },
  ): Promise<Counter | undefined> {
    const {
      initial,
      cas = 0n,
      ttl = this.#ttl,
    } = options

    let keyOffset: number
    keyOffset = this.#buffer.writeBigUInt64BE(BigInt(delta))
    keyOffset = this.#buffer.writeBigUInt64BE(BigInt(initial || 0n), keyOffset)
    keyOffset = this.#buffer.writeUInt32BE(initial == undefined ? 0xffffffff : ttl, keyOffset)
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
            value: response.value.readBigUInt64BE(0),
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
  ): Promise<Counter | undefined> {
    return this.#counter(OPCODE.INCREMENT, key, delta, options)
  }

  decrement(
    key: string,
    delta: bigint | number = 1,
    options: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean } = {},
  ): Promise<Counter | undefined> {
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

  async version(): Promise<Record<string, string>> {
    const [ response ] = await this.#connection.send({
      opcode: OPCODE.VERSION,
    })

    try {
      switch (response.status) {
        case STATUS.OK:
          return { [this.#id]: response.value.toString('utf-8') }
        default:
          fail(response)
      }
    } finally {
      response.recycle()
    }
  }

  async stats(): Promise<Record<string, Stats>> {
    const responses = await this.#connection.send({
      opcode: OPCODE.STAT,
    })

    const stats = responses.reduce((result, packet) => {
      try {
        if (packet.status !== STATUS.OK) fail(packet)

        const key = packet.key.toString('utf-8')
        const value = packet.value.toString('utf-8')

        return injectStats(key, value, result)
      } finally {
        packet.recycle()
      }
    }, {})

    return { [this.#id]: stats as Stats }
  }
}
