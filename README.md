# zimjs

read OpenZIM files in plain Javascript. no native dependencies.

this lets you read Wikipedia archives on the web.


## quickstart

```sh
npm install --save zimjs
```

```js
import Zim from 'zimjs'
import raf from 'random-access-file'

const file = raf('wikipedia-en.zim')

// The constructor accepts any object that provides read(offset, length, cb)
const zim = new Zim(file)
const dirs = await zim.list('/')

console.log('Wikipedia dump root entries:')
console.log(dirs)
```


## dev quickstart

```sh
cd zimjs
npm install
npm test
```

use Atom, or any editor that supports `flow` and `standard`.
