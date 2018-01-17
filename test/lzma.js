const lzma = require('lzma')

const fs = require('fs')

const data = fs.readFileSync('./test/data/hw2.txt.lzma')

console.log(lzma.decompress(data))
