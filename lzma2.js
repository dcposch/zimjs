const lzma = require('lzma')
const debug = require('debug')('lzma2')

module.exports = {
  decompress
}

function decompress (buf, cb) {
  const b = new Buf(buf)

  const streams = []
  try {
    while (b.i < b.len) {
      const stream = readStream(b)
      streams.add(stream)
      readPadding(b)
    }
  } catch (e) {
    cb(e, null)
  }
  const ret = Buffer.concat(streams)
  cb(null, ret)
}

/**
 * Reads padding to the next multiple of 4. Throws if the padding is invalid.
 */
function readPadding (buf) {
  const m4 = buf.i % 4
  if (m4 !== 0) {
    for (let i = m4; i < 4; i++) {
      if (buf.readByte() !== 0) {
        throw err('invalid padding')
      }
    }
  }
  return true
}

/**
 * Reads the next LZMA2 stream, not including trailing padding.
 * Returns a decompressed Buffer.
 */
function readStream (buf) {
  debug('reading stream header')
  const magicHex = buf.readHex(6)
  if (magicHex !== 'fd377a585a00') {
    throw err('invalid magic', magicHex)
  }
  const streamFlags = buf.readHex(2)
  if (streamFlags !== '0001') {
    throw err('unsupported stream flags', streamFlags)
  }
  const headerCrc = buf.readInt()
  debug('got header CRC', headerCrc)

  const blocks = []
  let index = null
  while (index === null) {
    const byte = buf.readByte()
    if (byte === 0) {
      index = readIndex(buf)
      if (!index) return
    } else {
      const block = readBlock(buf, byte)
      blocks.push(block)
    }
  }

  const footerCrc = buf.readInt()
  debug('got footer CRC', footerCrc)
  const backwardSize = (buf.readInt() + 1) * 4
  debug('got backwardSize', backwardSize)
  const streamFlags2 = buf.readHex(2)
  if (streamFlags2 !== '0001') {
    throw err('unsupported footer stream flags', streamFlags2)
  }
  const magicHex2 = buf.readHex(2)
  if (magicHex2 !== '595a') {
    throw err('invalid footer magic', magicHex2)
  }

  return Buffer.concat(blocks)
}

function readBlock (buf, byte) {
  const blockHeaderSize = (buf.readByte() + 1) * 4
  const blockHeaderEnd = (buf.i - 1) + blockHeaderSize

  const blockFlags = buf.readByte()
  const numFilters = blockFlags & 0x03
  const reserved = blockFlags & 0x3C
  const hasCompressedSize = blockFlags & 0x40
  const hasUncompressedSize = blockFlags & 0x80

  if (reserved !== 0) throw err('bad blockflags', blockFlags, reserved)

  const compressedSize = hasCompressedSize ? buf.readVarInt() : null
  const uncompressedSize = hasUncompressedSize ? buf.readVarInt() : null
  const headerPadding = buf.readHex(blockHeaderEnd - buf.i - 4)
  const crc32 = buf.readInt()

  const block = {
    blockHeaderSize,
    blockFlags,
    compressedSize,
    uncompressedSize,
    headerPadding,
    crc32
  }
  debug('read block header', block)

  throw new Error('TODO BLOCK UNIMP')

  // TODO: return buf
}

function readIndex (buf) {
  const numRecords = buf.readVarInt()
  debug('read index # records', numRecords)

  const records = []
  for (let i = 0; i < numRecords; i++) {
    records.push({
      unpaddedSize: buf.readVarInt(),
      uncompressedSize: buf.readVarInt()
    })
  }

  readPadding(buf)

  const crc = buf.readInt()
  debug('read index crc', crc)

  return records
}

function err (format) {
  const args = Array.prototype.slice.call(arguments, 1)
  let msg = format
  if (args.length > 0) {
    msg += ' ' + args.map(String).join(', ')
  }
  return new Error(msg)
}

/**
 * Wraps a Buffer, tracks position, implments the LZMA2 convention:
 * - single bytes via readByte()
 * - 4-byte little-endian ints via readInt()
 * - variable-length 1-9 byte unsigned ints via readVarInt()
 * - bytes as hex via readHex()
 * - bytes as a buffer via readBuf()
 */
function Buf (buf) {
  this.len = buf.length
  this.buf = buf
  this.i = 0
}

Buf.prototype.readByte = function () {
  if (this.i >= this.len) {
    throw new Error('end of buffer')
  }
  return this.buf[this.i++]
}

Buf.prototype.readInt = function () {
  const ret = this.buf.readUInt32LE(this.i)
  this.i += 4
  return ret
}

Buf.prototype.readVarInt = function () {
  const sizeMax = 9
  let byte = this.readByte()
  let num = byte & 0x7F
  for (let i = 1; byte & 0x80 > 0; ++i < sizeMax) {
    byte = this.readByte()
    num |= (byte & 0x7F) << (i * 7)
  }
  return num
}

Buf.prototype.readBuf = function (n) {
  if (this.i + n >= this.len) {
    throw new Error('read past end of buf: ' + [this.i, n, this.len].join(','))
  }
  const ret = this.buf.slice(this.i, this.i + n)
  this.i += n
  return ret
}

Buf.prototype.readHex = function (n) {
  return this.readBuf(n).toString('hex')
}
