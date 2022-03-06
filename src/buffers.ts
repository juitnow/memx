enum CONSTANTS {
  POOL_SIZE = 64,
  BUFFER_SIZE = 8192,
}

const pool: Buffer[] = new Array(CONSTANTS.POOL_SIZE)
let recycles = 0
let offset = -1

process.on('exit', () => {
  console.log('RECYCLES', recycles)
})


export interface RecyclableBuffer extends Buffer {
  recycle(): void
}

export function allocateBuffer(size: number): RecyclableBuffer {
  if (size > CONSTANTS.BUFFER_SIZE) {
    const buffer = Buffer.allocUnsafeSlow(size) as RecyclableBuffer
    buffer.recycle = () => void 0
    return buffer
  }

  const buffer = offset >= 0 ? pool[offset--] : Buffer.allocUnsafeSlow(CONSTANTS.BUFFER_SIZE)
  const recyclable = buffer.subarray(0, size) as RecyclableBuffer
  let recycled = false
  recyclable.recycle = (): void => queueMicrotask(() => {
    if ((offset >= CONSTANTS.POOL_SIZE) || recycled) return
    pool[++offset] = buffer
    recycles ++
    recycled = true
  })

  return recyclable as RecyclableBuffer
}
