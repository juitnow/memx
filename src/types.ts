export interface AdapterResult {
  value: Buffer
  flags: number,
  cas: bigint
  recycle: () => void
}

export interface Counter {
  value: bigint,
  cas: bigint
}

export interface Stats {
  /** Process id of this server process (32u) */
  pid: number
  /** Number of secs since the server started (32u) */
  uptime: number
  /** current UNIX time according to the server (32u) */
  time: number
  /** Version string of this server (string) */
  version: string
  /** Default size of pointers on the host OS (generally 32 or 64) (32) */
  pointer_size: number
  /** Accumulated user time for this process (microseconds) (32u.32u) */
  rusage_user: bigint
  /** Accumulated system time for this process (microseconds) (32u.32u) */
  rusage_system: bigint
  /** Current number of items stored (64u) */
  curr_items: bigint
  /** Total number of items stored since the server started (64u) */
  total_items: bigint
  /** Current number of bytes used to store items (64u) */
  bytes: bigint
  /** Max number of simultaneous connections (32u) */
  max_connections: number
  /** Number of open connections (32u) */
  curr_connections: number
  /** Total number of connections opened since the server started running (32u) */
  total_connections: number
  /** Conns rejected in maxconns_fast mode (64u) */
  rejected_connections: bigint
  /** Number of connection structures allocated by the server (32u) */
  connection_structures: number
  /** Connections closed by lack of memory (64u) */
  response_obj_oom: bigint
  /** Total response objects in use (64u) */
  response_obj_count: bigint
  /** Total bytes used for resp. objects. is a subset of bytes from read_buf_bytes (64u) */
  response_obj_bytes: bigint
  /** Total read/resp buffers allocated (64u) */
  read_buf_count: bigint
  /** Total read/resp buffer bytes allocated (64u) */
  read_buf_bytes: bigint
  /** Total read/resp buffer bytes cached (64u) */
  read_buf_bytes_free: bigint
  /** Connections closed by lack of memory (64u) */
  read_buf_oom: bigint
  /** Number of misc fds used internally (32u) */
  reserved_fds: number
  /** Cumulative number of retrieval reqs (64u) */
  cmd_get: bigint
  /** Cumulative number of storage reqs (64u) */
  cmd_set: bigint
  /** Cumulative number of flush reqs (64u) */
  cmd_flush: bigint
  /** Cumulative number of touch reqs (64u) */
  cmd_touch: bigint
  /** Number of keys that have been requested and found present (64u) */
  get_hits: bigint
  /** Number of items that have been requested and not found (64u) */
  get_misses: bigint
  /** Number of items that have been requested but had already expired (64u) */
  get_expired: bigint
  /** Number of items that have been requested but have been flushed via flush_all (64u) */
  get_flushed: bigint
  /** Number of deletions reqs for missing keys (64u) */
  delete_misses: bigint
  /** Number of deletion reqs resulting in an item being removed (64u) */
  delete_hits: bigint
  /** Number of incr reqs against missing keys (64u) */
  incr_misses: bigint
  /** Number of successful incr reqs (64u) */
  incr_hits: bigint
  /** Number of decr reqs against missing keys (64u) */
  decr_misses: bigint
  /** Number of successful decr reqs (64u) */
  decr_hits: bigint
  /** Number of CAS reqs against missing keys (64u) */
  cas_misses: bigint
  /** Number of successful CAS reqs (64u) */
  cas_hits: bigint
  /** Number of CAS reqs for which a key was found, but the CAS value did not match (64u) */
  cas_badval: bigint
  /** Number of keys that have been touched with a new expiration time (64u) */
  touch_hits: bigint
  /** Number of items that have been touched and not found (64u) */
  touch_misses: bigint
  /** Number of rejected storage requests caused by attempting to write a value larger than the -I limit (64u) */
  store_too_large: bigint
  /** Number of rejected storage requests caused by exhaustion of the -m memory limit (relevant when -M is used) (64u) */
  store_no_memory: bigint
  /** Number of authentication commands handled, success or failure (64u) */
  auth_cmds: bigint
  /** Number of failed authentications (64u) */
  auth_errors: bigint
  /** Number of connections closed due to reaching their idle timeout (64u) */
  idle_kicks: bigint
  /** Number of valid items removed from cache to free memory for new items (64u) */
  evictions: bigint
  /** Number of times an entry was stored using memory from an expired entry (64u) */
  reclaimed: bigint
  /** Total number of bytes read by this server from network (64u) */
  bytes_read: bigint
  /** Total number of bytes sent by this server to network (64u) */
  bytes_written: bigint
  /** Number of bytes this server is allowed to use for storage (size_t) */
  limit_maxbytes: bigint
  /** Whether or not server is accepting conns (bool) */
  accepting_conns: boolean
  /** Number of times server has stopped accepting new connections (maxconns) (64u) */
  listen_disabled_num: bigint
  /** Number of microseconds in maxconns (64u) */
  time_in_listen_disabled_us: bigint
  /** Number of worker threads requested (see doc/threads.txt) (32u) */
  threads: number
  /** Number of times any connection yielded to another due to hitting the -R limit (64u) */
  conn_yields: bigint
  /** Current size multiplier for hash table (32u) */
  hash_power_level: number
  /** Bytes currently used by hash tables (64u) */
  hash_bytes: bigint
  /** Indicates if the hash table is being grown to a new size (bool) */
  hash_is_expanding: boolean
  /** Items pulled from LRU that were never touched by get/incr/append/etc before expiring (64u) */
  expired_unfetched: bigint
  /** Items evicted from LRU that were never touched by get/incr/append/etc (64u) */
  evicted_unfetched: bigint
  /** Items evicted from LRU that had been hit recently but did not jump to top of LRU (64u) */
  evicted_active: bigint
  /** If a slab page is being moved (bool) */
  slab_reassign_running: boolean
  /** Total slab pages moved (64u) */
  slabs_moved: bigint
  /** Total items freed by LRU Crawler (64u) */
  crawler_reclaimed: bigint
  /** Total items examined by LRU Crawler (64u) */
  crawler_items_checked: bigint
  /** Times LRU tail was found with active ref. Items can be evicted to avoid OOM errors (64u) */
  lrutail_reflocked: bigint
  /** Items moved from HOT/WARM to COLD LRU's (64u) */
  moves_to_cold: bigint
  /** Items moved from COLD to WARM LRU (64u) */
  moves_to_warm: bigint
  /** Items reshuffled within HOT or WARM LRU's (64u) */
  moves_within_lru: bigint
  /** Times worker threads had to directly reclaim or evict items (64u) */
  direct_reclaims: bigint
  /** Number of LRU crawlers running (64u) */
  lru_crawler_running: bigint
  /** Times an LRU crawler was started (64u) */
  lru_crawler_starts: bigint
  /** Number of times the LRU bg thread woke up (64u) */
  lru_maintainer_juggles: bigint
  /** Slab pages returned to global pool for reassignment to other slab classes (32u) */
  slab_global_page_pool: number
  /** Items rescued from eviction in page move (64u) */
  slab_reassign_rescues: bigint
  /** Valid items evicted during a page move (due to no free memory in slab) (64u) */
  slab_reassign_evictions_nomem: bigint
  /** Individual sections of an item rescued during a page move (64u) */
  slab_reassign_chunk_rescues: bigint
  /** Internal stat counter for when the page mover clears memory from the chunk freelist when it wasn't expecting to (64u) */
  slab_reassign_inline_reclaim: bigint
  /** Items busy during page move, requiring a retry before page can be moved (64u) */
  slab_reassign_busy_items: bigint
  /** Items busy during page move, requiring deletion before page can be moved (64u) */
  slab_reassign_busy_deletes: bigint
  /** Logs a worker never wrote due to full buf (64u) */
  log_worker_dropped: bigint
  /** Logs written by a worker, to be picked up (64u) */
  log_worker_written: bigint
  /** Logs not sent to slow watchers (64u) */
  log_watcher_skipped: bigint
  /** Logs written to watchers (64u) */
  log_watcher_sent: bigint
  /** Number of currently active watchers (64u) */
  log_watchers: bigint
  /** Number of times an unexpected napi id is is received. See doc/napi_ids.txt (64u) */
  unexpected_napi_ids: bigint
  /** Number of times napi id of 0 is received resulting in fallback to round robin thread selection. See doc/napi_ids.txt (64u) */
  round_robin_fallback: bigint
  /** Nuumber of times `malloc` failed (64u) */
  malloc_fails: bigint
}

export interface Adapter {
  get(
    key: string,
  ): Promise<AdapterResult | undefined>

  gat(
    key: string,
    ttl: number,
  ): Promise<AdapterResult | undefined>

  touch(
    key: string,
    ttl?: number,
  ): Promise<boolean>

  set(
    key: string,
    value: Buffer,
    options?: { flags?: number, cas?: bigint, ttl?: number },
  ): Promise<bigint | undefined>

  add(
    key: string,
    value: Buffer,
    options?: { flags?: number, ttl?: number },
  ): Promise<bigint | undefined>

  replace(
    key: string,
    value: Buffer,
    options?: { flags?: number, cas?: bigint, ttl?: number },
  ): Promise<bigint | undefined>

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
  ): Promise<Counter | undefined>

  decrement(
    key: string,
    delta?: bigint | number,
    options?: { initial?: bigint | number, cas?: bigint, ttl?: number, create?: boolean },
  ): Promise<Counter | undefined>

  delete(
    key: string,
    options?: { cas?: bigint },
  ): Promise<boolean>

  flush(ttl?: number): Promise<void>

  noop(): Promise<void>

  quit(): Promise<void>

  version(): Promise<Record<string, string>>

  stats(): Promise<Record<string, Stats>>
}
