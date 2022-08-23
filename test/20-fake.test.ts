import './.setup'

import { expect } from 'chai'
import { FakeAdapter, MemxFakeClient } from '../src/index'
import { adapterTests } from './adapter'

describe('Fake Adapter', () => {
  const adapter = new FakeAdapter()

  adapterTests(adapter)

  describe('noop/quit/version/stats', () => {
    it('should issue a noop', async () => {
      expect(await adapter.noop()).to.be.undefined
    })

    it('should quit', async () => {
      expect(await adapter.quit()).to.be.undefined
    })

    it('should get the version', async () => {
      const version = await adapter.version()
      expect(version).to.eql({ fake: '0.0.0-fake' })
    })

    it('should get the stats', async () => {
      const stats = await adapter.stats()
      expect(stats).to.eql({ fake: { version: '0.0.0-fake' } })
    })

    it('should expose a fake client', async () => {
      const client = new MemxFakeClient()
      expect(client.adapter).to.be.instanceof(FakeAdapter)
    })
  })
})
