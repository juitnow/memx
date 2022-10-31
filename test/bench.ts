/* eslint-disable no-console */

import memjs from 'memjs'

import { ServerAdapter } from '../src/index'

const m = memjs.Client.create('127.0.0.1:11211')
const s = new ServerAdapter({ host: '127.0.0.1', port: 11211 })

const k = 'fooBar'
const v = Buffer.from('AndSomethingLongerForTheWin', 'utf8')

async function gc(): Promise<void> {
  for (let i = 0; i < 4; i ++) {
    globalThis.gc?.()
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

async function main(): Promise<void> {
  let r1: bigint = 0n
  let r2: bigint = 0n
  let m1: number = 0
  let m2: number = 0

  console.log('Running benchmark')

  // Load up everythig first
  await s.set(k, v, {})
  ;(await s.get(k))!.recycle()
  ;(await s.get(k))!.recycle()

  await m.set(k, v, {})
  await m.get(k)
  await m.get(k)

  // Go on, test!

  await gc()

  const q = process.memoryUsage.rss()
  const s1 = process.hrtime.bigint()
  for (let i = 0; i < 10000; i ++) {
    await m.set(k, v, {})
    await m.get(k)
    await m.get(k)
  }
  const x1 = process.hrtime.bigint()
  m1 += (process.memoryUsage.rss() - q)
  r1 += (x1 - s1)

  await gc()

  const w = process.memoryUsage.rss()
  const s2 = process.hrtime.bigint()
  for (let i = 0; i < 10000; i ++) {
    await s.set(k, v, {})
    ;(await s.get(k))!.recycle()
    ;(await s.get(k))!.recycle()
  }
  const x2 = process.hrtime.bigint()
  m2 += (process.memoryUsage.rss() - w)
  r2 += (x2 - s2)

  // Report

  console.log()
  console.log()
  const pr = ((Number(r2) * 100) / Number(r1)).toFixed(2)
  const pm = ((m2 * 100) / m1).toFixed(2)
  console.log(`    | ${'nanos'.padStart(12)}    | ${'bytes'.padStart(9)}   |`)
  console.log('    +-----------------+-------------+')
  console.log(`mjs | ${r1.toString().padStart(12)} ns | ${Math.round(m1 / 10).toString().padStart(9)} b |`)
  console.log(`our | ${r2.toString().padStart(12)} ns | ${Math.round(m2 / 10).toString().padStart(9)} b |`)
  console.log(`    | ${pr.padStart(12)} %  | ${pm.padStart(9)} % |`)
  console.log('    +-----------------+-------------+')
}

main().catch((error) => console.error(error)).finally(async () => {
  await m.quit()
  await s.quit()
})
