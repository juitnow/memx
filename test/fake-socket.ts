import { EventEmitter } from 'stream'

export class FakeSocket extends EventEmitter {
  options: any
  isref = true

  constructor(options: any, connect: boolean | 'timeout' = true) {
    super()
    this.options = options
    this.on('error', () => process.nextTick(() => this.emit('close', true)))
    process.nextTick(() => {
      connect == 'timeout' ? this.emit('timeout') :
      connect ? this.emit('connect') :
      this.emit('error', new Error('Connection Error'))
    })
  }

  unref(): void {
    this.isref = false
  }

  write(buffer: Buffer, callback: (error?: Error) => void): void {
    if (this.isref) return callback(new Error('Socket is not unref-ed'))
    this.$write(buffer.toString('hex'), callback)
  }

  destroy(error?: Error): this {
    if (error) this.emit('error', error)
    else this.emit('close', false)
    return this
  }

  $write(string: string, callback: (error?: Error) => void): void {
    callback(new Error('Write Error'))
  }

  $respond(buffer: Buffer | string): void {
    process.nextTick(() => {
      if (typeof buffer === 'string') buffer = Buffer.from(buffer, 'hex')
      this.options.onread.callback(buffer.length, buffer)
    })
  }
}
