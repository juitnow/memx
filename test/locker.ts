/* eslint-disable no-console */
import { log } from '@plugjs/build'

import { MemxClient, PoorManLock } from '../src/index'

const host = process.env.MEMCACHED_HOST || '127.0.0.1'
const port = parseInt(process.env.MEMCACHED_PORT || '11211')
const client = new MemxClient({ hosts: [ { host, port } ] })

async function test(): Promise<void> {
  console.log(`Child process using lock "${process.argv[2]}"`)

  const lock = new PoorManLock(client, process.argv[2])
  try {
    await lock.execute(async () => {
      console.log('Child process locking')
      await new Promise((resolve) => void setTimeout(resolve, 2000))
      console.log('Child process exiting')
      process.exit(123)
    }, { owner: `test-child-${process.pid}` })
  } finally {
    console.log('Child process exit interrupted ???')
    process.exit(123)
  }
}

test().catch((error) => log.error('Error in child process test', error))
