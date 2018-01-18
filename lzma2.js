const debug = require('debug')('lzma2')
var crc32 = require('crc-32')

const lzma = require('./lzma-d.js')

module.exports = {
  decompress
}

function decompress (buf, cb) {
  const b = new Buf(buf)

  const streams = []
  try {
    while (b.i < b.len) {
      const stream = readStream(b)
      streams.push(stream)
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
  let streamCheck
  if (streamFlags === '0001') {
    streamCheck = 'CRC32'
  } else if (streamFlags === '0004') {
    streamCheck = 'CRC64'
  } else {
    throw err('unsupported stream flags', streamFlags)
  }
  verifyCrc32(buf.readInt(), streamFlags)

  const blocks = []
  let index = null
  while (index === null) {
    const byte = buf.readByte()
    if (byte === 0) {
      index = readIndex(buf)
      if (!index) return
    } else {
      const block = readBlock(buf, byte, streamCheck)
      blocks.push(block)
    }
  }

  const footerCrc = buf.readInt()
  debug('got footer CRC', footerCrc)
  const backwardSize = (buf.readInt() + 1) * 4
  debug('got backwardSize', backwardSize)
  const streamFlags2 = buf.readHex(2)
  if (streamFlags2 !== streamFlags) {
    throw err('wrong footer stream flags', streamFlags2)
  }
  const magicHex2 = buf.readHex(2)
  if (magicHex2 !== '595a') {
    throw err('invalid footer magic', magicHex2)
  }

  return Buffer.concat(blocks)
}

function verifyCrc32 (crc, crcData) {
  if (typeof crcData === 'string') crcData = Buffer.from(crcData, 'hex')
  debug('verifying crc32', crc)
  if (crc32.buf(crcData) !== crc) {
    throw err('invalid crc32')
  }
}

function verifyZero (b) {
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== 0) throw err('expected zeros')
  }
}

function readBlock (buf, byte, streamCheck) {
  const headerSize = byte * 4
  const headerContent = buf.peekSlice(-1, headerSize - 1)
  const headerCrc = buf.peekSlice(headerSize - 1, headerSize + 3).readInt32LE(0)
  verifyCrc32(headerCrc, headerContent)
  const headerEnd = buf.i - 1 + headerSize

  const blockFlags = buf.readByte()
  const numFilters = (blockFlags & 0x03) + 1
  const reserved = blockFlags & 0x3C
  const hasCompressedSize = blockFlags & 0x40
  const hasUncompressedSize = blockFlags & 0x80

  if (reserved !== 0) throw err('bad blockflags', blockFlags, reserved)

  const compressedSize = hasCompressedSize ? buf.readVarInt() : null
  const uncompressedSize = hasUncompressedSize ? buf.readVarInt() : null

  const filters = []
  for (let i = 0; i < numFilters; i++) {
    const filterID = buf.readVarInt()
    const propsSize = buf.readVarInt()
    const propsBuf = buf.readBuf(propsSize)
    const filter = {filterID, propsBuf}
    debug('adding filter', {filterID, props: propsBuf.toString('hex')})
    filters.push(filter)
  }

  const headerPadding = buf.readBuf(headerEnd - buf.i)
  verifyZero(headerPadding)
  buf.readInt() // crc already verified

  const block = {
    numFilters,
    compressedSize,
    uncompressedSize
  }
  debug('read block header', block)

  if (filters.length !== 1 || filters[0].filterID !== 0x21) {
    throw err('unsupported filters', filters)
  }

  const dictSize = decodeDictSize(filters[0].propsBuf)
  debug('lzma2 dict size', dictSize)

  const uncompressed = uncompressLzma2(buf, dictSize, compressedSize)
  debug('uncompressed', uncompressed.toString('utf8'))

  readPadding(buf)

  ignoreCheck(buf, streamCheck)

  return uncompressed
}

function ignoreCheck (buf, streamCheck) {
  let crc
  if (streamCheck === 'CRC32') {
    crc = buf.readHex(4)
    debug('ignoring CRC32', crc)
  } else if (streamCheck === 'CRC64') {
    crc = buf.readHex(8)
    debug('ignoring CRC64', crc)
  } else {
    throw err('unsupported stream check', streamCheck)
  }
}

/*
 * From p7zip Lzma2Dec.c:
 *
 * 00000000  -  EOS
 * 00000001 U U  -  Uncompressed Reset Dic
 * 00000010 U U  -  Uncompressed No Reset
 * 100uuuuu U U P P  -  LZMA no reset
 * 101uuuuu U U P P  -  LZMA reset state
 * 110uuuuu U U P P S  -  LZMA reset state + new prop
 * 111uuuuu U U P P S  -  LZMA reset state + new prop + reset dic
 *
 *   u, U - Unpack Size
 *   P - Pack Size
 *   S - Props
*/
function uncompressLzma2 (buf, dictSize, compressedSize) {
  const ret = []

  let isLzma, isResetState, isResetDic, hasNewProps

  let unpackSize = 0

  while (true) {
    const byte = buf.readByte()
    debug('uncompressLzma2 new chunk', byte)

    if (byte === 0) {
      break
    } else if (byte < 3) {
      isLzma = false
      isResetState = false
      isResetDic = byte === 1
      hasNewProps = false
    } else {
      unpackSize = byte & 0x1f
      const b23 = (byte & 0x60) >> 5
      isLzma = true
      isResetState = b23 > 0
      isResetDic = b23 === 3
      hasNewProps = b23 > 1
    }
    unpackSize = (unpackSize << 16) ^ (buf.readByte() << 8) ^ buf.readByte() + 1

    let props = {lc: 3, lp: 0, pb: 2}
    let uncompressed
    if (isLzma) {
      const packSize = (buf.readByte() << 8) ^ buf.readByte() + 1

      if (hasNewProps) {
        const newProps = buf.readByte()
        props = decodeLzmaProps(newProps)
        debug('got new props', props)
      }

      const lzmaBuf = buf.readBuf(packSize)
      debug('lzma compressed chunk', lzmaBuf, lzmaBuf.length, 'ix', buf.i)
      uncompressed = lzma.decompressRaw(lzmaBuf, dictSize, unpackSize, props)
      debug('lzma uncompressed chunk', uncompressed, uncompressed.length)
    } else {
      uncompressed = buf.readBuf(unpackSize)
    }

    if (!isResetState || !isResetDic) {
      debug('ignoring state/dic unimp', isResetState, isResetDic)
    }
    debug('lzma chunk finished')

    ret.push(uncompressed)
  }
  return Buffer.concat(ret)
}

// Decodes LZMA LC/LP/PB
function decodeLzmaProps (b) {
  let lc, lp
  if (b >= (9 * 5 * 5)) {
    // throw err('invalid lzma props', b)
    debug('using invalid lzma props', b)
  }
  lc = b % 9
  b = (b / 9) | 0
  let pb = (b / 5) | 0
  lp = b % 5
  return {lc, lp, pb}
}

// Decodes the props for filter ID 0x21, LZMA2
function decodeDictSize (propsBuf) {
  if (propsBuf.length !== 1) throw err('invalid props for LZMA2 filter')
  const byte = propsBuf[0]
  if ((byte & 0xC0) !== 0) throw err('reserved bits nonzero in LZMA2 props')

  const bits = byte & 0x3F
  if (bits > 40) throw err('LZMA2 dict too big')

  let ret
  if (bits === 40) {
    ret = 4294967295
  } else {
    ret = 2 | (bits & 1)
    ret <<= bits / 2 + 11
  }
  return ret
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
  let byte = 0x80
  let num = 0
  for (let i = 0; (byte & 0x80) > 0; i++) {
    if (i >= 4) {
      throw err('unsupported large varint')
    }
    byte = this.readByte()
    num |= (byte & 0x7F) << (i * 7)
    debug('varint', i, byte, num)
  }
  return num
}

Buf.prototype.readBuf = function (n) {
  if (this.i + n > this.len) {
    throw new Error('read past end of buf: ' + [this.i, n, this.len].join(','))
  }
  const ret = this.buf.slice(this.i, this.i + n)
  this.i += n
  return ret
}

Buf.prototype.readHex = function (n) {
  return this.readBuf(n).toString('hex')
}

Buf.prototype.peekByte = function () {
  return this.buf[this.i]
}

Buf.prototype.peekSlice = function (i, j) {
  return this.buf.slice(this.i + i, this.i + j)
}
