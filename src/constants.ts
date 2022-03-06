export const EMPTY_BUFFER = Buffer.alloc(0)

export enum BUFFERS {
  POOL_SIZE = 64,
  BUFFER_SIZE = 8192,
}

export enum OFFSETS {
  MAGIC_$8 = 0,
  OPCODE_$8 = 1,
  KEY_LENGTH_$16 = 2,
  EXTRAS_LENGTH_$8 = 4,
  DATA_TYPE_$8 = 5,
  STATUS_$16 = 6,
  BODY_LENGTH_$32 = 8,
  SEQUENCE_$32 = 12,
  CAS_$64 = 16,
  BODY = 24,
}

export enum MAGIC {
  REQUEST = 0x80, // Request packet for this protocol version
  RESPONSE = 0x81, // Response packet for this protocol version
}

export enum STATUS {
  OK = 0x0000, // No error
  KEY_NOT_FOUND = 0x0001, // Key not found
  KEY_EXISTS = 0x0002, // Key exists
  TOO_LARGE = 0x0003, // Value too large
  INVALID_ARGS = 0x0004, // Invalid arguments
  ITEM_NOT_STORED = 0x0005, // Item not stored
  NON_NUMERIC_VALUE = 0x0006, // Incr/Decr on non-numeric value
  WRONG_VBUCKET = 0x0007, // The vbucket belongs to another server
  AUTH_ERROR = 0x0008, // Authentication error
  AUTH_CONTINUE = 0x0009, // Authentication continue
  UNKNOWN_COMMAND = 0x0081, // Unknown command
  OUT_OF_MEMORY = 0x0082, // Out of memory
  NOT_SUPPORTED = 0x0083, // Not supported
  INTERNAL_ERROR = 0x0084, // Internal error
  BUSY = 0x0085, // Busy
  TEMPORARY_FAILURE = 0x0086, // Temporary failure
}

export enum OPCODE {
  GET = 0x00,
  SET = 0x01,
  ADD = 0x02,
  REPLACE = 0x03,
  DELETE = 0x04,
  INCREMENT = 0x05,
  DECREMENT = 0x06,
  QUIT = 0x07,
  FLUSH = 0x08,
  NOOP = 0x0a,
  VERSION = 0x0b,
  APPEND = 0x0e,
  PREPEND = 0x0f,
  STAT = 0x10,
  TOUCH = 0x1c,
  GAT = 0x1d,
}

export enum DATA_TYPE {
  RAW = 0x00,
}

export enum VBUCKET {
  NIL = 0x00,
}
