import { spawn } from 'node:child_process'

import { log } from '@plugjs/plug'

before(() => {
  return new Promise<void>((resolve, reject) => {
    log('Starting "memcached"')

    const child = spawn('memcached', { stdio: 'inherit' })

    const timeout = setTimeout(() => {
      after(() => {
        log('Terminating "memcached"')
        child.kill()
      })
      resolve()
    }, 1000)

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code, signal) => {
      clearTimeout(timeout)
      return reject(new Error(`Memcached exited with ${signal || code}`))
    })
  })
})
