import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { log } from '@plugjs/plug'
import chai from 'chai'
import chap from 'chai-as-promised'
import chae from 'chai-exclude'

import type { ChildProcess } from 'node:child_process'

let child: ChildProcess | undefined = undefined

chai.use(chap).use(chae)

beforeAll(() => {
  // do not spawn local "memcached" on GitHub
  if (process.env.GITHUB_ACTIONS) return

  return new Promise<void>((resolve, reject) => {
    const childProcess = spawn('memcached', { stdio: 'pipe' })

    const stdout = createInterface(childProcess.stdout)
    const stderr = createInterface(childProcess.stderr)
    stdout.on('line', (line) => log.notice(line))
    stderr.on('line', (line) => log.warn(line))

    const timeout = setTimeout(() => {
      log('Started "memcached" processs with PID', childProcess.pid)
      child = childProcess
      resolve()
    }, 1000)

    childProcess.on('error', (error: Error) => {
      clearTimeout(timeout)
      child = undefined
      reject(error)
    })

    childProcess.on('exit', (code: number, signal: string) => {
      clearTimeout(timeout)
      return reject(new Error(`Memcached exited with ${signal || code}`))
    })
  })
})

afterAll(() => {
  // do not kill local "memcached" on GitHub
  if (process.env.GITHUB_ACTIONS) return

  if (! child) throw new Error('Memcached server never started')

  log('\nStopping "memcached" process running with PID', child.pid)
  const childProcess = child
  child = undefined

  return new Promise((resolve, reject) => {
    childProcess.on('exit', resolve)
    childProcess.on('error', reject)
    childProcess.kill()
  })
})
