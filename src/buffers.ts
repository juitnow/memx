import { BUFFERS } from './constants'

const pool: Buffer[] = new Array(BUFFERS.POOL_SIZE)
let offset = -1

/** A `RecyclableBuffer` is a {@link Buffer} that can be recycled by a pool. */
export interface RecyclableBuffer extends Buffer {
  /** Recycle this buffer. */
  recycle(): void
}

/**
 * Allocate a {@link RecyclableBuffer} of _size_ bytes.
 *
 * Up to {@link BUFFERS.POOL_SIZE} (64) buffers will be recycled once their
 * `recycle()` method is called _if_ their size is not bigger than
 * {@link BUFFERS.BUFFER_SIZE} (8192 bytes).
 */
export function allocateBuffer(size: number): RecyclableBuffer {
  if (size > BUFFERS.BUFFER_SIZE) {
    const buffer = Buffer.allocUnsafeSlow(size) as RecyclableBuffer
    buffer.recycle = () => void 0
    return buffer
  }

  const buffer = offset >= 0 ? pool[offset--] : Buffer.allocUnsafeSlow(BUFFERS.BUFFER_SIZE)
  const recyclable = buffer.subarray(0, size) as RecyclableBuffer
  let recycled = false
  recyclable.recycle = (): void => queueMicrotask(() => {
    if ((offset >= BUFFERS.POOL_SIZE) || recycled) return
    pool[++offset] = buffer
    recycled = true
  })

  return recyclable as RecyclableBuffer
}
