/**
 * Copyright (c) 2017-present, blockcollider.org developers, All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type BcBlock from '../protos/core_pb'

const { flatten } = require('ramda')

const BLOCK_POOL_REFERENCE = 'bc.blockpool.'
const BC_BLOCK_REFERENCE = 'bc.block.'

export class BlockPool {
  async getLatest () {
    const latestHash = await this._persistence.get(BLOCK_POOL_REFERENCE + 'latest')
    const latest = await this._persistence.get(latestHash)
    return latest
  }

  async putLatest (data) {
    return await this._persistence.put(BLOCK_POOL_REFERENCE + 'latest', data)
  }

  async disableSync (itr) {
    this._syncEnabled = false
    try {
      await this.del(BLOCK_POOL_REFERENCE + itr)
      if (itr > 0) {
        return this.disableSync(itr--)
      }
    } catch (err) {
      return new Error(err)
    }
  }

  addBlock (block: BcBlock): Promise<*> {
    const height = block.getHeight()
    const hash = block.getHash()
    const previousHash = block.getPreviousHash()
    if (this._syncEnabled) {
      return this._persistence.get(previousHash)
        .then((res) => {
          this._persistence.get(res)
            .then((possibleBlock) => {
              const latest = this.getLatest()
              if (latest.getHeight() < possibleBlock.getHeight()) {
                return this.putLatest(block)
              }
              return this._persistence.put('bc.block.' + height, possibleBlock)
            })
            .catch((err) => {
              return Promise.all([
                this._persistence.del(BLOCK_POOL_REFERENCE + height),
                this._persistence.del(hash)])
                .catch((err) => {
                  return throw Error(err)
                })
            })
        })
        .catch((err) => {
          const latest = this.getLatest()
          const tasks = [
            this._persistence.put(BLOCK_POOL_REFERENCE + height, block),
            this._persistence.put(hash, BLOCK_POOL_REFERENCE + height)
          ]
          if (latest.getHeight() < block.getHeight()) {
            tasks.push(this.putLatest(block))
          }
          return Promises.all(tasks)
            .then(() => {
              return this._persistence.get('bc.block.' + height)
                .then((has) => {
                  return has
                })
                .catch((err) => {
                  return new Error(err)
                })
            })
            .catch((err) => {
              return throw (err)
            })
        })
    } else {
      return Promise.resolve()
    }
  }

  purge () {
    const latest = this.getLatest()
    this._syncEnabled = true
    return this.disableSync(latest.height)
  }

  // print () {
  //   for (let i = 0; i < this.maxDepth; i++) {
  //     console.log(`DEPTH: ${i}, HEIGHT: ${this.minHeight + i}`)
  //     const blocks = this.blocks.get(i) || []
  //     for (let j = 0; j < blocks.length; j++) {
  //       console.log(j, blocks[j].toObject())
  //     }
  //   }
  // }
}

export default BlockPool