import net, { Socket } from 'net'

import { Encoder, RawOutgoingPacket } from './encode'
import { Decoder, RawIncomingPacket } from './decode'
import { BUFFERS, OPCODE } from './constants'
import { socketFinalizationRegistry } from './finalization'

type RawIncomingPackets = [ RawIncomingPacket, ...RawIncomingPacket[] ]

class Deferred {
  #resolve!: (value: RawIncomingPackets) => void
  #reject!: (reason: Error) => void
  #packets: RawIncomingPacket[] = []

  readonly promise: Promise<RawIncomingPackets>
  readonly opcode: OPCODE

  constructor(opcode: OPCODE) {
    this.opcode = opcode

    this.promise = new Promise((resolve, reject) => {
      this.#resolve = resolve
      this.#reject = reject
    })
  }

  append(packet: RawIncomingPacket): void {
    this.#packets.push(packet)
  }

  resolve(packet: RawIncomingPacket): void {
    this.#packets.push(packet)
    this.#resolve(this.#packets as RawIncomingPackets)
  }

  reject(error: Error): void {
    this.#reject(error)
  }
}

export interface ConnectionOptions {
  host: string,
  port: number,
  timeout?: number,
  factory?: typeof net.connect,
}

export class Connection {
  readonly #decoder = new Decoder((packet) => this.#receive(packet))
  readonly #encoder = new Encoder()

  readonly #socketBuffer = Buffer.allocUnsafeSlow(BUFFERS.BUFFER_SIZE)
  readonly #decodeBuffer = Buffer.allocUnsafeSlow(BUFFERS.BUFFER_SIZE)

  readonly #defers = new Map<number, Deferred>()
  readonly #factory: typeof net.connect
  readonly #timeout: number

  #socket?: Promise<Socket>
  #sequence = 0

  readonly host!: string
  readonly port!: number

  constructor(options: ConnectionOptions) {
    const { host, port, timeout = 10, factory = net.connect } = options
    this.#factory = factory
    this.#timeout = timeout
    Object.defineProperties(this, {
      host: { value: host, enumerable: true, configurable: false },
      port: { value: port, enumerable: true, configurable: false },
    })
  }

  #connect(): Promise<Socket> {
    return this.#socket || (this.#socket = new Promise((resolve, reject) => {
      const socket: Socket = this.#factory({
        host: this.host,
        port: this.port,
        timeout: this.#timeout,
        onread: {
          buffer: this.#socketBuffer,
          callback: (bytes: number, buffer: Buffer): boolean => {
            this.#decoder.append(buffer, 0, bytes)
            return true
          },
        },
      })

      socket.on('timeout', () => socket.destroy(new Error('Timeout')))
      socket.on('error', reject)

      socket.on('close', () => {
        socketFinalizationRegistry.unregister(this)
        this.#socket = undefined
      })

      socket.on('connect', () => {
        socketFinalizationRegistry.register(this, socket, this)

        socket.off('error', reject)
        socket.on('error', (error) => {
          for (const deferred of this.#defers.values()) {
            process.nextTick(() => deferred.reject(error))
          }
          this.#defers.clear()
          this.#socket = undefined
        })

        socket.unref()
        resolve(socket)
      })
    }))
  }

  #receive(packet: RawIncomingPacket): void {
    const deferred = this.#defers.get(packet.sequence)
    if (deferred) {
      if (deferred.opcode === packet.opcode) {
        if ((packet.opcode === OPCODE.STAT) && (packet.key.length !== 0)) {
          return deferred.append(packet)
        }
        return deferred.resolve(packet)
      } else {
        const sent = `0x${deferred.opcode.toString(16).padStart(2, '0')}`
        const received = `0x${packet.opcode.toString(16).padStart(2, '0')}`
        return deferred.reject(new Error(`Opcode mismatch (sent=${sent}, received=${received})`))
      }
    }
  }

  get connected(): boolean {
    return !! this.#socket
  }

  async send(packet: RawOutgoingPacket): Promise<RawIncomingPackets> {
    const sequence = ++ this.#sequence
    const buffer = this.#encoder.encode(this.#decodeBuffer, packet, sequence)
    const deferred = new Deferred(packet.opcode)

    this.#defers.set(sequence, deferred)

    const socket = await this.#connect()
    socket.write(buffer, (error) => {
      if (error) return deferred.reject(error)
    })

    const timeout = setTimeout(() => deferred.reject(new Error('No response')), this.#timeout)

    return deferred.promise.finally(() => {
      clearTimeout(timeout)
      this.#defers.delete(sequence)
    })
  }

  async destroy(): Promise<boolean> {
    const socket = await this.#socket
    if (! socket) return false

    return new Promise<boolean>((resolve, reject) => {
      socket
          .once('error', reject)
          .once('close', resolve)
          .destroy()
    })
  }
}
