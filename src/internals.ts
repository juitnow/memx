// Keep these here: they must be ignored by Istanbul, but ESBUILD swallows
// commments (for a reason: https://github.com/evanw/esbuild/issues/578)

import type { Socket } from 'net'

export const socketFinalizationRegistry = new FinalizationRegistry((socket: Socket): void => {
  if (! socket.destroyed) socket.destroy()
})
