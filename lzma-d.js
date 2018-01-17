// / Adapted from LZMA-JS: https://github.com/LZMA-JS/LZMA-JS
// / Original copyright:
// / © 2015 Nathan Rugg <nmrugg@gmail.com> | MIT
// / See LICENSE for more details.

/* eslint-disable */

const debug = require('debug')('lzma2')

var LZMA = (function () {
  /* ds */
  const action_decompress = 2
  /* de */
  const action_progress = 3
  const wait = typeof setImmediate === 'function' ? setImmediate : setTimeout
  const __4294967296 = 4294967296
  const N1_longLit = [4294967295, -__4294967296]

  const P0_longLit = [0, 0]
  const P1_longLit = [1, 0]

  function update_progress (percent, cbn) {
    postMessage({
      action: action_progress,
      cbn: cbn,
      result: percent
    })
  }

  function initDim (len) {
        // /NOTE: This is MUCH faster than "new Array(len)" in newer versions of v8 (starting with Node.js 0.11.15, which uses v8 3.28.73).
    var a = []
    a[len - 1] = undefined
    return a
  }

  function add (a, b) {
    return create(a[0] + b[0], a[1] + b[1])
  }

  function compare (a, b) {
    var nega, negb
    if (a[0] == b[0] && a[1] == b[1]) {
      return 0
    }
    nega = a[1] < 0
    negb = b[1] < 0
    if (nega && !negb) {
      return -1
    }
    if (!nega && negb) {
      return 1
    }
    if (sub(a, b)[1] < 0) {
      return -1
    }
    return 1
  }

  function create (valueLow, valueHigh) {
    var diffHigh, diffLow
    valueHigh %= 1.8446744073709552E19
    valueLow %= 1.8446744073709552E19
    diffHigh = valueHigh % __4294967296
    diffLow = Math.floor(valueLow / __4294967296) * __4294967296
    valueHigh = valueHigh - diffHigh + diffLow
    valueLow = valueLow - diffLow + diffHigh
    while (valueLow < 0) {
      valueLow += __4294967296
      valueHigh -= __4294967296
    }
    while (valueLow > 4294967295) {
      valueLow -= __4294967296
      valueHigh += __4294967296
    }
    valueHigh = valueHigh % 1.8446744073709552E19
    while (valueHigh > 9223372032559808512) {
      valueHigh -= 1.8446744073709552E19
    }
    while (valueHigh < -9223372036854775808) {
      valueHigh += 1.8446744073709552E19
    }
    return [valueLow, valueHigh]
  }

  function fromInt (value) {
    if (value >= 0) {
      return [value, 0]
    } else {
      return [value + __4294967296, -__4294967296]
    }
  }

  function lowBits_0 (a) {
    if (a[0] >= 2147483648) {
      return ~~Math.max(Math.min(a[0] - __4294967296, 2147483647), -2147483648)
    } else {
      return ~~Math.max(Math.min(a[0], 2147483647), -2147483648)
    }
  }

  function sub (a, b) {
    return create(a[0] - b[0], a[1] - b[1])
  }

  function $ByteArrayInputStream (this$static, buf) {
    this$static.buf = buf
    this$static.pos = 0
    this$static.count = buf.length
    return this$static
  }

    /** ds */
  function $read (this$static) {
    if (this$static.pos >= this$static.count) {
      return -1
    }
    const byte = this$static.buf[this$static.pos++] & 255
    debug('read byte ' + byte.toString(16))
    return byte
  }
    /** de */

  function $ByteArrayOutputStream (this$static) {
    this$static.buf = initDim(32)
    this$static.count = 0
    return this$static
  }

  function $toByteArray (this$static) {
    var data = this$static.buf
    data.length = this$static.count
    return data
  }

  function $write_0 (this$static, buf, off, len) {
    arraycopy(buf, off, this$static.buf, this$static.count, len)
    this$static.count += len
  }

  function arraycopy (src, srcOfs, dest, destOfs, len) {
    for (var i = 0; i < len; ++i) {
      dest[destOfs + i] = src[srcOfs + i]
    }
  }


  function $LZMAByteArrayDecompressor (this$static, data, dictSize, packSize, unpackSize) {
    const input = $ByteArrayInputStream({}, data)
    const output = this$static.output = $ByteArrayOutputStream({})
    const decoder = $Decoder({})

    const lc = 3
    const lp = 0
    const pb = 2
    $SetLcLpPb(decoder, lc, lp, pb)
    $SetDictionarySize(decoder, dictSize)

    this$static.length_0 = unpackSize || N1_longLit
    debug('LZMAByteArrayDecompressor length_0', this$static.length_0)
    this$static.chunker = $CodeInChunks(decoder, input, output, this$static.length_0)

    return this$static
  }

    /** ds */
  function $CopyBlock (this$static, distance, len) {
    var pos = this$static._pos - distance - 1
    if (pos < 0) {
      pos += this$static._windowSize
    }
    for (; len != 0; --len) {
      if (pos >= this$static._windowSize) {
        pos = 0
      }
      this$static._buffer[this$static._pos++] = this$static._buffer[pos++]
      if (this$static._pos >= this$static._windowSize) {
        $Flush_0(this$static)
      }
    }
  }

  function $Create_5 (this$static, windowSize) {
    if (this$static._buffer == null || this$static._windowSize != windowSize) {
      this$static._buffer = initDim(windowSize)
    }
    this$static._windowSize = windowSize
    this$static._pos = 0
    this$static._streamPos = 0
  }

  function $Flush_0 (this$static) {
    var size = this$static._pos - this$static._streamPos
    if (!size) {
      return
    }
    $write_0(this$static._stream, this$static._buffer, this$static._streamPos, size)
    if (this$static._pos >= this$static._windowSize) {
      this$static._pos = 0
    }
    this$static._streamPos = this$static._pos
  }

  function $GetByte (this$static, distance) {
    var pos = this$static._pos - distance - 1
    if (pos < 0) {
      pos += this$static._windowSize
    }
    return this$static._buffer[pos]
  }

  function $PutByte (this$static, b) {
    debug('putting byte', b, b < 32 ? '.' : String.fromCharCode(b))
    this$static._buffer[this$static._pos++] = b
    if (this$static._pos >= this$static._windowSize) {
      $Flush_0(this$static)
    }
  }

  function $ReleaseStream (this$static) {
    $Flush_0(this$static)
    this$static._stream = null
  }
    /** de */

  function GetLenToPosState (len) {
    len -= 2
    if (len < 4) {
      return len
    }
    return 3
  }

  function StateUpdateChar (index) {
    if (index < 4) {
      return 0
    }
    if (index < 10) {
      return index - 3
    }
    return index - 6
  }

    /** ds */
  function $Chunker (this$static, decoder) {
    this$static.decoder = decoder
    this$static.encoder = null
    this$static.alive = 1
    return this$static
  }
    /** de */

  function $processChunk (this$static, unpackSize) {
    if (!this$static.alive) {
      throw new Error('bad state')
    }

    if (this$static.encoder) {
      throw new Error('No encoding')
    } else {
            // / co:throw new Error("No decoding");
            /** ds */
      $processDecoderChunk(this$static, unpackSize)
            /** de */
    }
    return this$static.alive
  }

    /** ds */
  function $processDecoderChunk (this$static, unpackSize) {
    var result = $CodeOneChunk(this$static.decoder)
    if (result == -1) {
      throw new Error('corrupted input')
    }
    this$static.inBytesProcessed = N1_longLit
    this$static.outBytesProcessed = this$static.decoder.nowPos64
    //if (result || compare(this$static.decoder.outSize, P0_longLit) >= 0 &&
    //  compare(this$static.decoder.nowPos64, this$static.decoder.outSize) >= 0) {
    if (result || this$static.decoder.nowPos64[0] >= unpackSize) {
      debug('flushing output window', this$static.decoder.m_OutWindow)
      $Flush_0(this$static.decoder.m_OutWindow)
      $ReleaseStream(this$static.decoder.m_OutWindow)
      this$static.decoder.m_RangeDecoder.Stream = null
      this$static.alive = 0
    }
  }
    /** de */

    /** ds */
  function $CodeInChunks (this$static, inStream, outStream, outSize) {
    this$static.m_RangeDecoder.Stream = inStream
    $ReleaseStream(this$static.m_OutWindow)
    this$static.m_OutWindow._stream = outStream
    $Init_1(this$static)
    this$static.state = 0
    this$static.rep0 = 0
    this$static.rep1 = 0
    this$static.rep2 = 0
    this$static.rep3 = 0
    this$static.outSize = outSize
    this$static.nowPos64 = P0_longLit
    this$static.prevByte = 0
    return $Chunker({}, this$static)
  }

  function $CodeOneChunk (this$static) {
    var decoder2, distance, len, numDirectBits, posSlot, posState
    posState = lowBits_0(this$static.nowPos64) & this$static.m_PosStateMask
    if (!$DecodeBit(this$static.m_RangeDecoder, this$static.m_IsMatchDecoders, (this$static.state << 4) + posState)) {
      decoder2 = $GetDecoder(this$static.m_LiteralDecoder, lowBits_0(this$static.nowPos64), this$static.prevByte)
      if (this$static.state < 7) {
        this$static.prevByte = $DecodeNormal(decoder2, this$static.m_RangeDecoder)
      } else {
        this$static.prevByte = $DecodeWithMatchByte(decoder2, this$static.m_RangeDecoder, $GetByte(this$static.m_OutWindow, this$static.rep0))
      }
      $PutByte(this$static.m_OutWindow, this$static.prevByte)
      this$static.state = StateUpdateChar(this$static.state)
      this$static.nowPos64 = add(this$static.nowPos64, P1_longLit)
    } else {
      if ($DecodeBit(this$static.m_RangeDecoder, this$static.m_IsRepDecoders, this$static.state)) {
        len = 0
        if (!$DecodeBit(this$static.m_RangeDecoder, this$static.m_IsRepG0Decoders, this$static.state)) {
          if (!$DecodeBit(this$static.m_RangeDecoder, this$static.m_IsRep0LongDecoders, (this$static.state << 4) + posState)) {
            this$static.state = this$static.state < 7 ? 9 : 11
            len = 1
          }
        } else {
          if (!$DecodeBit(this$static.m_RangeDecoder, this$static.m_IsRepG1Decoders, this$static.state)) {
            distance = this$static.rep1
          } else {
            if (!$DecodeBit(this$static.m_RangeDecoder, this$static.m_IsRepG2Decoders, this$static.state)) {
              distance = this$static.rep2
            } else {
              distance = this$static.rep3
              this$static.rep3 = this$static.rep2
            }
            this$static.rep2 = this$static.rep1
          }
          this$static.rep1 = this$static.rep0
          this$static.rep0 = distance
        }
        if (!len) {
          len = $Decode(this$static.m_RepLenDecoder, this$static.m_RangeDecoder, posState) + 2
          this$static.state = this$static.state < 7 ? 8 : 11
        }
      } else {
        this$static.rep3 = this$static.rep2
        this$static.rep2 = this$static.rep1
        this$static.rep1 = this$static.rep0
        len = 2 + $Decode(this$static.m_LenDecoder, this$static.m_RangeDecoder, posState)
        this$static.state = this$static.state < 7 ? 7 : 10
        posSlot = $Decode_0(this$static.m_PosSlotDecoder[GetLenToPosState(len)], this$static.m_RangeDecoder)
        if (posSlot >= 4) {
          numDirectBits = (posSlot >> 1) - 1
          this$static.rep0 = (2 | posSlot & 1) << numDirectBits
          if (posSlot < 14) {
            this$static.rep0 += ReverseDecode(this$static.m_PosDecoders, this$static.rep0 - posSlot - 1, this$static.m_RangeDecoder, numDirectBits)
          } else {
            this$static.rep0 += $DecodeDirectBits(this$static.m_RangeDecoder, numDirectBits - 4) << 4
            this$static.rep0 += $ReverseDecode(this$static.m_PosAlignDecoder, this$static.m_RangeDecoder)
            if (this$static.rep0 < 0) {
              if (this$static.rep0 == -1) {
                return 1
              }
              return -1
            }
          }
        } else {
          this$static.rep0 = posSlot
        }
      }
      if (compare(fromInt(this$static.rep0), this$static.nowPos64) >= 0 || this$static.rep0 >= this$static.m_DictionarySizeCheck) {
        return -1
      }
      $CopyBlock(this$static.m_OutWindow, this$static.rep0, len)
      this$static.nowPos64 = add(this$static.nowPos64, fromInt(len))
      this$static.prevByte = $GetByte(this$static.m_OutWindow, 0)
    }
    return 0
  }

  function $Decoder (this$static) {
    this$static.m_OutWindow = {}
    this$static.m_RangeDecoder = {}
    this$static.m_IsMatchDecoders = initDim(192)
    this$static.m_IsRepDecoders = initDim(12)
    this$static.m_IsRepG0Decoders = initDim(12)
    this$static.m_IsRepG1Decoders = initDim(12)
    this$static.m_IsRepG2Decoders = initDim(12)
    this$static.m_IsRep0LongDecoders = initDim(192)
    this$static.m_PosSlotDecoder = initDim(4)
    this$static.m_PosDecoders = initDim(114)
    this$static.m_PosAlignDecoder = $BitTreeDecoder({}, 4)
    this$static.m_LenDecoder = $Decoder$LenDecoder({})
    this$static.m_RepLenDecoder = $Decoder$LenDecoder({})
    this$static.m_LiteralDecoder = {}
    for (var i = 0; i < 4; ++i) {
      this$static.m_PosSlotDecoder[i] = $BitTreeDecoder({}, 6)
    }
    return this$static
  }

  function $Init_1 (this$static) {
    this$static.m_OutWindow._streamPos = 0
    this$static.m_OutWindow._pos = 0
    InitBitModels(this$static.m_IsMatchDecoders)
    InitBitModels(this$static.m_IsRep0LongDecoders)
    InitBitModels(this$static.m_IsRepDecoders)
    InitBitModels(this$static.m_IsRepG0Decoders)
    InitBitModels(this$static.m_IsRepG1Decoders)
    InitBitModels(this$static.m_IsRepG2Decoders)
    InitBitModels(this$static.m_PosDecoders)
    $Init_0(this$static.m_LiteralDecoder)
    for (var i = 0; i < 4; ++i) {
      InitBitModels(this$static.m_PosSlotDecoder[i].Models)
    }
    $Init(this$static.m_LenDecoder)
    $Init(this$static.m_RepLenDecoder)
    InitBitModels(this$static.m_PosAlignDecoder.Models)
    $Init_8(this$static.m_RangeDecoder)
  }

  function $SetDecoderProperties (this$static, properties) {
    var dictionarySize, i, lc, lp, pb, remainder, val
    if (properties.length < 5) {
      return 0
    }
    val = properties[0] & 255
    lc = val % 9
    remainder = ~~(val / 9)
    lp = remainder % 5
    pb = ~~(remainder / 5)
    dictionarySize = 0
    for (i = 0; i < 4; ++i) {
      dictionarySize += (properties[1 + i] & 255) << i * 8
    }
        // /NOTE: If the input is bad, it might call for an insanely large dictionary size, which would crash the script.
    if (dictionarySize > 99999999 || !$SetLcLpPb(this$static, lc, lp, pb)) {
      return 0
    }
    return $SetDictionarySize(this$static, dictionarySize)
  }

  function $SetDictionarySize (this$static, dictionarySize) {
    if (dictionarySize < 0) {
      return 0
    }
    if (this$static.m_DictionarySize != dictionarySize) {
      this$static.m_DictionarySize = dictionarySize
      this$static.m_DictionarySizeCheck = Math.max(this$static.m_DictionarySize, 1)
      $Create_5(this$static.m_OutWindow, Math.max(this$static.m_DictionarySizeCheck, 4096))
    }
    return 1
  }

  function $SetLcLpPb (this$static, lc, lp, pb) {
    if (lc > 8 || lp > 4 || pb > 4) {
      return 0
    }
    $Create_0(this$static.m_LiteralDecoder, lp, lc)
    var numPosStates = 1 << pb
    $Create(this$static.m_LenDecoder, numPosStates)
    $Create(this$static.m_RepLenDecoder, numPosStates)
    this$static.m_PosStateMask = numPosStates - 1
    return 1
  }

  function $Create (this$static, numPosStates) {
    for (; this$static.m_NumPosStates < numPosStates; ++this$static.m_NumPosStates) {
      this$static.m_LowCoder[this$static.m_NumPosStates] = $BitTreeDecoder({}, 3)
      this$static.m_MidCoder[this$static.m_NumPosStates] = $BitTreeDecoder({}, 3)
    }
  }

  function $Decode (this$static, rangeDecoder, posState) {
    if (!$DecodeBit(rangeDecoder, this$static.m_Choice, 0)) {
      return $Decode_0(this$static.m_LowCoder[posState], rangeDecoder)
    }
    var symbol = 8
    if (!$DecodeBit(rangeDecoder, this$static.m_Choice, 1)) {
      symbol += $Decode_0(this$static.m_MidCoder[posState], rangeDecoder)
    } else {
      symbol += 8 + $Decode_0(this$static.m_HighCoder, rangeDecoder)
    }
    return symbol
  }

  function $Decoder$LenDecoder (this$static) {
    this$static.m_Choice = initDim(2)
    this$static.m_LowCoder = initDim(16)
    this$static.m_MidCoder = initDim(16)
    this$static.m_HighCoder = $BitTreeDecoder({}, 8)
    this$static.m_NumPosStates = 0
    return this$static
  }

  function $Init (this$static) {
    InitBitModels(this$static.m_Choice)
    for (var posState = 0; posState < this$static.m_NumPosStates; ++posState) {
      InitBitModels(this$static.m_LowCoder[posState].Models)
      InitBitModels(this$static.m_MidCoder[posState].Models)
    }
    InitBitModels(this$static.m_HighCoder.Models)
  }

  function $Create_0 (this$static, numPosBits, numPrevBits) {
    var i, numStates
    if (this$static.m_Coders != null && this$static.m_NumPrevBits == numPrevBits && this$static.m_NumPosBits == numPosBits) { return }
    this$static.m_NumPosBits = numPosBits
    this$static.m_PosMask = (1 << numPosBits) - 1
    this$static.m_NumPrevBits = numPrevBits
    numStates = 1 << this$static.m_NumPrevBits + this$static.m_NumPosBits
    this$static.m_Coders = initDim(numStates)
    for (i = 0; i < numStates; ++i) {
      this$static.m_Coders[i] = $Decoder$LiteralDecoder$Decoder2({})
    }
  }

  function $GetDecoder (this$static, pos, prevByte) {
    return this$static.m_Coders[((pos & this$static.m_PosMask) << this$static.m_NumPrevBits) + ((prevByte & 255) >>> 8 - this$static.m_NumPrevBits)]
  }

  function $Init_0 (this$static) {
    var i, numStates
    numStates = 1 << this$static.m_NumPrevBits + this$static.m_NumPosBits
    for (i = 0; i < numStates; ++i) {
      InitBitModels(this$static.m_Coders[i].m_Decoders)
    }
  }

  function $DecodeNormal (this$static, rangeDecoder) {
    var symbol = 1
    do {
      symbol = symbol << 1 | $DecodeBit(rangeDecoder, this$static.m_Decoders, symbol)
    } while (symbol < 256)
    return symbol << 24 >> 24
  }

  function $DecodeWithMatchByte (this$static, rangeDecoder, matchByte) {
    var bit, matchBit, symbol = 1
    do {
      matchBit = matchByte >> 7 & 1
      matchByte <<= 1
      bit = $DecodeBit(rangeDecoder, this$static.m_Decoders, (1 + matchBit << 8) + symbol)
      symbol = symbol << 1 | bit
      if (matchBit != bit) {
        while (symbol < 256) {
          symbol = symbol << 1 | $DecodeBit(rangeDecoder, this$static.m_Decoders, symbol)
        }
        break
      }
    } while (symbol < 256)
    return symbol << 24 >> 24
  }

  function $Decoder$LiteralDecoder$Decoder2 (this$static) {
    this$static.m_Decoders = initDim(768)
    return this$static
  }

    /** de */

    /** ds */
  function $BitTreeDecoder (this$static, numBitLevels) {
    this$static.NumBitLevels = numBitLevels
    this$static.Models = initDim(1 << numBitLevels)
    return this$static
  }

  function $Decode_0 (this$static, rangeDecoder) {
    var bitIndex, m = 1
    for (bitIndex = this$static.NumBitLevels; bitIndex != 0; --bitIndex) {
      m = (m << 1) + $DecodeBit(rangeDecoder, this$static.Models, m)
    }
    return m - (1 << this$static.NumBitLevels)
  }

  function $ReverseDecode (this$static, rangeDecoder) {
    var bit, bitIndex, m = 1, symbol = 0
    for (bitIndex = 0; bitIndex < this$static.NumBitLevels; ++bitIndex) {
      bit = $DecodeBit(rangeDecoder, this$static.Models, m)
      m <<= 1
      m += bit
      symbol |= bit << bitIndex
    }
    return symbol
  }

  function ReverseDecode (Models, startIndex, rangeDecoder, NumBitLevels) {
    var bit, bitIndex, m = 1, symbol = 0
    for (bitIndex = 0; bitIndex < NumBitLevels; ++bitIndex) {
      bit = $DecodeBit(rangeDecoder, Models, startIndex + m)
      m <<= 1
      m += bit
      symbol |= bit << bitIndex
    }
    return symbol
  }
    /** de */

    /** ds */
  function $DecodeBit (this$static, probs, index) {
    var newBound, prob = probs[index]
    newBound = (this$static.Range >>> 11) * prob
    if ((this$static.Code ^ -2147483648) < (newBound ^ -2147483648)) {
      this$static.Range = newBound
      probs[index] = prob + (2048 - prob >>> 5) << 16 >> 16
      if (!(this$static.Range & -16777216)) {
        this$static.Code = this$static.Code << 8 | $read(this$static.Stream)
        this$static.Range <<= 8
      }
      return 0
    } else {
      this$static.Range -= newBound
      this$static.Code -= newBound
      probs[index] = prob - (prob >>> 5) << 16 >> 16
      if (!(this$static.Range & -16777216)) {
        this$static.Code = this$static.Code << 8 | $read(this$static.Stream)
        this$static.Range <<= 8
      }
      return 1
    }
  }

  function $DecodeDirectBits (this$static, numTotalBits) {
    var i, t, result = 0
    for (i = numTotalBits; i != 0; --i) {
      this$static.Range >>>= 1
      t = this$static.Code - this$static.Range >>> 31
      this$static.Code -= this$static.Range & t - 1
      result = result << 1 | 1 - t
      if (!(this$static.Range & -16777216)) {
        this$static.Code = this$static.Code << 8 | $read(this$static.Stream)
        this$static.Range <<= 8
      }
    }
    return result
  }

  function $Init_8 (this$static) {
    this$static.Code = 0
    this$static.Range = -1
    for (var i = 0; i < 5; ++i) {
      this$static.Code = this$static.Code << 8 | $read(this$static.Stream)
    }
  }
    /** de */

  function InitBitModels (probs) {
    for (var i = probs.length - 1; i >= 0; --i) {
      probs[i] = 1024
    }
  }

    /** ds */
  function decode (utf) {
    var i = 0, j = 0, x, y, z, l = utf.length, buf = [], charCodes = []
    for (; i < l; ++i, ++j) {
      x = utf[i] & 255
      if (!(x & 128)) {
        if (!x) {
                    // / It appears that this is binary data, so it cannot be converted to a string, so just send it back.
          return utf
        }
        charCodes[j] = x
      } else if ((x & 224) == 192) {
        if (i + 1 >= l) {
                    // / It appears that this is binary data, so it cannot be converted to a string, so just send it back.
          return utf
        }
        y = utf[++i] & 255
        if ((y & 192) != 128) {
                    // / It appears that this is binary data, so it cannot be converted to a string, so just send it back.
          return utf
        }
        charCodes[j] = ((x & 31) << 6) | (y & 63)
      } else if ((x & 240) == 224) {
        if (i + 2 >= l) {
                    // / It appears that this is binary data, so it cannot be converted to a string, so just send it back.
          return utf
        }
        y = utf[++i] & 255
        if ((y & 192) != 128) {
                    // / It appears that this is binary data, so it cannot be converted to a string, so just send it back.
          return utf
        }
        z = utf[++i] & 255
        if ((z & 192) != 128) {
                    // / It appears that this is binary data, so it cannot be converted to a string, so just send it back.
          return utf
        }
        charCodes[j] = ((x & 15) << 12) | ((y & 63) << 6) | (z & 63)
      } else {
                // / It appears that this is binary data, so it cannot be converted to a string, so just send it back.
        return utf
      }
      if (j == 16383) {
        buf.push(String.fromCharCode.apply(String, charCodes))
        j = -1
      }
    }
    if (j > 0) {
      charCodes.length = j
      buf.push(String.fromCharCode.apply(String, charCodes))
    }
    return buf.join('')
  }
    /** de */

  function toDouble (a) {
    return a[1] + a[0]
  }

  function decompressRaw (byteArr, dictSize, packSize, unpackSize) {
    const d = $LZMAByteArrayDecompressor({}, byteArr, dictSize) // , packSize, unpackSize)
    while ($processChunk(d.chunker, unpackSize)) {
      // process chunks
    }
    debug('decompressRaw output', d.output)
    // return $toByteArray(d.output)
    return Buffer.from($toByteArray(d.output))
  }

    /** ds */
  function decompress (byte_arr, on_finish, on_progress) {
    var this$static = {},
      percent,
      cbn, // / A callback number should be supplied instead of on_finish() if we are using Web Workers.
      has_progress,
      len,
      sync = typeof on_finish === 'undefined' && typeof on_progress === 'undefined'

    if (typeof on_finish !== 'function') {
      cbn = on_finish
      on_finish = on_progress = 0
    }

    on_progress = on_progress || function (percent) {
      if (typeof cbn === 'undefined') {
        return
      }

      return update_progress(has_progress ? percent : -1, cbn)
    }

    on_finish = on_finish || function (res, err) {
      if (typeof cbn === 'undefined') {
        return
      }

      return postMessage({
        action: action_decompress,
        cbn: cbn,
        result: res,
        error: err
      })
    }

    if (sync) {
      this$static.d = $LZMAByteArrayDecompressor({}, byte_arr)
      while ($processChunk(this$static.d.chunker));
      return decode($toByteArray(this$static.d.output))
    }

    try {
      this$static.d = $LZMAByteArrayDecompressor({}, byte_arr)

      len = toDouble(this$static.d.length_0)

            // /NOTE: If the data was created via a stream, it will not have a length value, and therefore we can't calculate the progress.
      has_progress = len > -1

      on_progress(0)
    } catch (err) {
      return on_finish(null, err)
    }

    function do_action () {
      try {
        var res, i = 0, start = (new Date()).getTime()
        while ($processChunk(this$static.d.chunker)) {
          if (++i % 1000 == 0 && (new Date()).getTime() - start > 200) {
            if (has_progress) {
              percent = toDouble(this$static.d.chunker.decoder.nowPos64) / len
                            // / If about 200 miliseconds have passed, update the progress.
              on_progress(percent)
            }

                        // /NOTE: This allows other code to run, like the browser to update.
            wait(do_action, 0)
            return 0
          }
        }

        on_progress(1)

        res = decode($toByteArray(this$static.d.output))

                // / delay so we don’t catch errors from the on_finish handler
        wait(on_finish.bind(null, res), 0)
      } catch (err) {
        on_finish(null, err)
      }
    }

        // /NOTE: We need to wait to make sure it is always async.
    wait(do_action, 0)
  }
    /** de */

    // / If we're in a Web Worker, create the onmessage() communication channel.
    // /NOTE: This seems to be the most reliable way to detect this.
  if (typeof onmessage !== 'undefined' && (typeof window === 'undefined' || typeof window.document === 'undefined')) {
    (function () {
            /* jshint -W020 */
            // / Create the global onmessage function.
      onmessage = function (e) {
        if (e && e.data) {
                    // / co:if (e.data.action == action_compress) {
                    // / co:    LZMA.compress(e.data.data, e.data.mode, e.data.cbn);
                    // / co:}
          if (e.data.action == action_decompress) {
            LZMA.decompress(e.data.data, e.data.cbn)
          }
        }
      }
    }())
  }

  return {
    decompressRaw
  }
}())

module.exports = LZMA
