export interface GetResult {
  value: Buffer
  flags: number,
  cas: bigint
  recycle: () => void
}

export interface Counter {
  value: bigint,
  cas: bigint
}

export interface Adapter {
  get(
    key: string,
    options?: { ttl?: number },
  ): Promise<GetResult | void>

  touch(
    key: string,
    options?: { ttl?: number },
  ): Promise<boolean>

  set(
    key: string,
    value: Buffer,
    options?: { flags?: number, cas?: bigint, ttl?: number },
  ): Promise<bigint | void>

  add(
    key: string,
    value: Buffer,
    options?: { flags?: number, cas?: bigint, ttl?: number },
  ): Promise<bigint | void>

  replace(
    key: string,
    value: Buffer,
    options?: { flags?: number, cas?: bigint, ttl?: number },
  ): Promise<bigint | void>

  append(
    key: string,
    value: Buffer,
    options?: { cas?: bigint },
  ): Promise<boolean>

  prepend(
    key: string,
    value: Buffer,
    options?: { cas?: bigint },
  ): Promise<boolean>

  increment(
    key: string,
    delta?: bigint | number,
    options?: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean },
  ): Promise<Counter | void>

  decrement(
    key: string,
    delta?: bigint | number,
    options?: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean },
  ): Promise<Counter | void>

  delete(
    key: string,
    options?: { cas?: bigint },
  ): Promise<boolean>

  flush(ttl?: number): Promise<void>

  noop(): Promise<void>

  quit(): Promise<void>

  version(): Promise<string>

  stats(): Promise<Record<string, string>>
}
