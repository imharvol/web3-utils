require('dotenv').config()

const Web3 = require('web3') // https://web3js.readthedocs.io/
const chalk = require('chalk')
const https = require('https')
const path = require('path')
const fsPromises = require('fs/promises')
const assert = require('assert')

const Web3HttpProvider = require('web3-providers-http')
const Web3Contract = require('web3-eth-contract')

// Constants
const bscScanApiEndpoint = 'https://api.bscscan.com/api'
const defaultAbisPath = 'abis'

let contracts
let utilsReady = false
let web3

/**
 * Receives a Web3 instance or a web3 string endpoint. Returns the Web3 instance
 * @param {string|Web3} _web3 String or Web3 instance
 * @returns {Web3}
 */
const toWeb3 = (_web3) => {
  if (typeof _web3 === 'string') {
    return new Web3(_web3)
  } else if (_web3 instanceof Web3) {
    return _web3
  } else {
    throw new Error("Couldn't get web3")
  }
}

/**
 * Sets the utils module Web3 provider
 * @param {String|Web3} _web3 Web3 instance or string of an endpoint
 */
const setUtilsWeb3 = (_web3) => {
  try {
    web3 = toWeb3(_web3)
  } catch (err) {
    throw new Error("Couldn't set utils web3")
  }
}

/**
 * Sets the global Web3 provider
 * @param {String|Web3} _web3 Web3 instance or string of an endpoint
 */
const setGlobalWeb3 = (_web3) => {
  try {
    global.web3 = toWeb3(_web3)
  } catch (err) {
    throw new Error("Couldn't set global web3")
  }
}

/**
 * Turns an object mapping contract names to contract addresses (or null) to a object mapping contract names to web3 contracts.
 * If the abi is not cached it will try to cache it from BscScan and it will save it inside abisPath as _contractName-contractAddress.json_.
 * @param {Object} contracts Object mapping contract names to contract addresses. Contract address can be `null`, and the web3 will be created without contract address
 * @param {String} abisPath Path where the abis are located. `./abis` by default
 * @returns {Object} Mapping of contract names to `web3.eth.Contract` instances.
 */
const getWeb3Contracts = async (contracts = {}, abisPath) => {
  abisPath = abisPath ?? defaultAbisPath

  for (const entry of Object.entries(contracts)) {
    const contractName = entry[0]
    const contractAddress = entry[1]

    const abiPath = path.join(abisPath, `${contractName}-${contractAddress}.json`)
    let abi
    try {
      // Get the cached version
      abi = JSON.parse(await fsPromises.readFile(abiPath, { encoding: 'utf-8' }))
    } catch (err) {
      console.log(`Cached ABI version of ${contractName} (${contractAddress}) not found. Trying to get from BscScan`)
      try {
        abi = await getContractAbi(contractAddress)
        await fsPromises.writeFile(abiPath, JSON.stringify(abi, null, 2), { encoding: 'utf-8' })
      } catch (err) {
        throw new Error(`${contractName} (${contractAddress}) ABI is not cached and it wasn't possible to retrieve from BscScan`)
      }
    }

    if (abi != null) contracts[contractName] = new web3.eth.Contract(abi, contractAddress)
  }

  return contracts
}

/**
 * Gets a contract's ABI from a contract's address using BscScan
 * @param {String} contractAddress Hex contract's address
 * @throws {Error} Throws error if `contractAddress` is not hex or if the request failed due to any reason
 * @returns {Object} JSON parsed ABI of the contract
 */
const getContractAbi = (contractAddress) => {
  return new Promise((resolve, reject) => {
    if (!Web3.utils.isHexStrict(contractAddress)) return reject(new Error('Contract address should be hex'))

    if (process.env.BSCSCAN_API_KEY == null) return reject(new Error('Env variable BSCSCAN_API_KEY is null'))

    const requestUrl = new URL(bscScanApiEndpoint)
    requestUrl.searchParams.set('module', 'contract')
    requestUrl.searchParams.set('action', 'getabi')
    requestUrl.searchParams.set('address', contractAddress)
    requestUrl.searchParams.set('apikey', process.env.BSCSCAN_API_KEY)

    https.get(requestUrl, {}, (res) => {
      if (res.statusCode !== 200) return reject(new Error('Error when getting the contract ABI'))

      let data = ''

      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        const resp = JSON.parse(data)
        if (resp.status !== '1') return reject(new Error('Error when getting the contract ABI'))

        resolve(JSON.parse(resp.result))
      })
    })
  })
}

/**
 * Gets a contract's source code froma contract's address using BscScan
 * @param {String} contractAddress Hex contract's address
 * @throws {Error} Throws error if `contractAddress` is not hex or if the request failed due to any reason
 * @returns {String} JSON parsed ABI of the contract
 */
const getContractSource = (contractAddress) => {
  return new Promise((resolve, reject) => {
    if (!Web3.utils.isHexStrict(contractAddress)) return reject(new Error('Contract address should be hex'))

    if (process.env.BSCSCAN_API_KEY == null) return reject(new Error('Env variable BSCSCAN_API_KEY is null'))

    const requestUrl = new URL(bscScanApiEndpoint)
    requestUrl.searchParams.set('module', 'contract')
    requestUrl.searchParams.set('action', 'getsourcecode')
    requestUrl.searchParams.set('address', contractAddress)
    requestUrl.searchParams.set('apikey', process.env.BSCSCAN_API_KEY)

    https.get(requestUrl, {}, (res) => {
      if (res.statusCode !== 200) return reject(new Error('Error when getting the contract ABI'))

      let data = ''

      res.on('data', chunk => {
        data += chunk
      })
      res.on('end', () => {
        const resp = JSON.parse(data)
        if (resp.status !== '1') return reject(new Error('Error when getting the contract ABI'))

        resolve(resp.result[0].SourceCode)
      })
    })
  })
}

/**
 * Gets the liquidity pair contract for a pair of tokens
 * @param {String} token0 Token0 contract address
 * @param {String} token1 Token1 contract address
 * @returns {String} Returns the address of the liquidity pair contract or null if the pair doesn't have a liquidity pair contract
 */
const getLiquidityPairAddress = async (token0, token1) => {
  throw new Error('Missing implementation')

  if (token0 == null || token0 == null) throw new Error('Token addresses can\'t be undefined')

  token0 = token0.toLowerCase()
  token1 = token1.toLowerCase()

  if (token0 > token1) {
    const aux = token0
    token0 = token1
    token1 = aux
  }

  const liquidityPairAddress = await contracts.pcsFactoryV2.methods.getPair(token0, token1).call()

  if (web3.utils.toBN(liquidityPairAddress).isZero()) return null

  return liquidityPairAddress
}

/**
 * Calculates locally the liquidity pair contract address for a pair of tokens
 * @param {String} token0 Token0 contract address
 * @param {String} token1 Token1 contract address
 * @returns {String} Returns the address of the (possibly to be) liquidity pair contract
 */
const calculateLiquidityPairAddress = async (token0, token1) => {
  throw new Error('Missing implementation')

  if (token0 == null || token0 == null) throw new Error('Token addresses can\'t be undefined')

  const pcsConstant = '0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5'
  token0 = token0.toLowerCase()
  token1 = token1.toLowerCase()

  if (token0 > token1) {
    const aux = token0
    token0 = token1
    token1 = aux
  }

  const tokensHash = web3.utils.soliditySha3(token0, token1)
  const addressHash = web3.utils.soliditySha3('0xff', contracts.pcsFactoryV2.options.address, tokensHash, pcsConstant)
  const liquidityPairAddress = '0x' + addressHash.substr(26)

  return liquidityPairAddress
}

/**
 * Gets if there's liquidity at the liquidity pair contract
 * @param {String} liquidityPairAddress Address of the liquidity pair contract we want to check
 * @returns {Boolean}
 */
const liquidityPairHasLiquidity = async (liquidityPairAddress) => {
  throw new Error('Missing implementation')

  const liquidityPairContract = new web3.eth.Contract(contracts.pcsPair.options.jsonInterface, liquidityPairAddress)

  return (await liquidityPairContract.methods.totalSupply().call()) > 0
}

/**
 * Gets if there's liquidity at the liquidity pair contract of the tokens
 * @param {String} token0
 * @param {String} token1 Defaults to WBNB
 * @returns {Boolean}
 */
const tokenHasLiquidity = async (token0, token1 = contracts.wbnb.options.address) => {
  throw new Error('Missing implementation')

  const liquidityPairAddress = await getLiquidityPairAddress(token0, token1)

  if (!liquidityPairAddress) return false

  return await liquidityPairHasLiquidity(liquidityPairAddress)
}

/**
 * Compares the latest block number of a mainRpc and a list of RPCs, logs into the console a summary.
 * Throws if the mainRpc is more than 1 block behind the highest block number obtained.
 * @param {String} mainRpc Main RPC we want to check
 * @param {Array<String>} rpcs List of RPCS to compare
 */
const checkRpcSync = async (mainRpc, rpcs = []) => {
  let blocks
  if (mainRpc == null) throw new Error("mainRpc can't be null")
  if (!rpcs.includes(mainRpc)) rpcs.push(mainRpc)

  console.log(`Checking RPC Sync: ${mainRpc}`)

  blocks = rpcs.map(rpc => (new Web3(rpc)).eth.getBlockNumber())
  blocks = await Promise.allSettled(Object.values(blocks))
  blocks = blocks.map(r => r.status === 'fulfilled' ? r.value : null)

  const maxBlock = Math.max(...blocks)
  console.log(`Maximum block: ${maxBlock}`)

  assert(rpcs.length === blocks.length)
  for (let i = 0; i < rpcs.length; i++) {
    if (blocks[i] === null) {
      console.log(`${chalk.red('null')} - ${rpcs[i]}`)
      continue
    }

    // 0  blocks behind: green
    // 1  blocks behind: yellow
    // 2+ blocks behind: red
    let blockColor
    switch (blocks[i]) {
      case maxBlock:
        blockColor = chalk.green
        break
      case maxBlock - 1:
        blockColor = chalk.yellow
        break
      default:
        blockColor = chalk.red
    }

    // Print mainRpc in white, the rest in gray
    const rpcColor = rpcs[i] === mainRpc ? chalk.white : chalk.gray

    console.log(`${blockColor(blocks[i])} (${blocks[i] - maxBlock}) - ${rpcColor(rpcs[i])}`)
  }

  // Compare mainRpc with the rest of RPCs
  const mainRpcBlock = blocks[rpcs.indexOf(mainRpc)]
  if (mainRpcBlock === null) {
    throw new Error(`The main RPC ${mainRpc} is probably down`)
  } else if (mainRpcBlock === maxBlock) {
    console.log(chalk.green('The main RPC seems up to speed!'))
  } else if (mainRpcBlock === maxBlock - 1) {
    console.log(chalk.yellow(`The main RPC is one block behind! ${mainRpcBlock}/${maxBlock}`))
  } else {
    throw new Error(`The main RPC ${mainRpc} is at block ${mainRpcBlock}/${maxBlock}`)
  }
}

/**
 * Gets the ABI of a method from a contract abi by the methods keccak signature
 * @param {Object} abi ABI of the contract which should have a function that matches the signature
 * @param {String} keccakSignature 4 byte hex kecacck function selector
 * @returns ABI of the method to which the signature belongs. `undefined` if not found.
 */
const getMethodAbiBySignature = (abi, keccakSignature) => {
  if (abi instanceof Web3Contract) abi = abi.options.jsonInterface

  return abi.find(methodAbi =>
    web3.eth.abi.encodeFunctionSignature(methodAbi) === keccakSignature
  )
}

/**
 * Sends a raw JSON-RPC message to a Web3 endpoint
 * @param {Web3} _web3 Web3 to send the message to
 * @param {Object} message JSON message
 * @returns {Promise<Object>} Endpoint's response
 */
const sendRawJsonRpcMessage = (_web3, message) => {
  return new Promise((resolve, reject) => {
    _web3 = toWeb3(_web3 ?? web3)

    if (!(_web3.currentProvider instanceof Web3HttpProvider) || _web3.currentProvider.host == null) throw new Error('sendRawJsonRpcMessage only supports HTTP(s) web3 endpoints')

    message = typeof message === 'object' ? JSON.stringify(message) : message

    const rUrl = _web3.currentProvider.host
    const rOptions = {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      }
    }
    const req = https.request(rUrl, rOptions, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.once('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(message)
    req.end()
  })
}

/**
 * Waits for a matching tx to be received in the mempool. Using the GetPendingTransactions method in an interval
 * @param {function} matchF Receives a TX object as an argument and returns true if the TX matches the one we're looking for
 * @param {object} options The web3 endpoint to use in this function can be specified with `options.web3` (only HTTPS supported). It's also possible to specify a wait time between requests with `options.wait` in milliseconds, default value is 200ms
 * @returns {Promise<object>} Resolves with the TX object when a matching tx is detected in the mempool
 */
// const waitForTxUsingGetBlockPending = async (matchF, options = {}) => {
//   return new Promise(async (resolve, reject) => {
//     if (typeof options?.wait !== 'number') options.wait = 200
//     const _web3 = toWeb3(options.web3 ?? web3)

//     let resolved = false
//     const interval = setInterval(async () => {
//       const pendingBlock = await web3.eth.getBlock("pending", true)
//       // console.log(JSON.stringify(pendingBlock))
//       console.log(`${pendingBlock.hash} ${pendingBlock.number} ${pendingBlock.transactions.length} ${pendingBlock.timestamp}`)
//       // const txCallback = (err, tx) => {
//       //   if (err) return console.log(err)

//       //   if (!resolved && matchF(tx)) {
//       //     clearInterval(interval)
//       //     sendRawJsonRpcMessage(_web3, { jsonrpc: '2.0', method: 'eth_uninstallFilter', params: [subscriptionId], id: 0 })
//       //     resolved = true
//       //     resolve(tx)
//       //   }

//     }, options.wait)
//   })
// }

/**
 * Waits for a matching tx to be received in the mempool. Using a susbcription method
 * @param {function} matchF Receives a TX object as an argument and returns true if the TX matches the one we're looking for
 * @param {object} options The web3 endpoint to use in this function can be specified with `options.web3`
 * @returns {Promise<object>} Resolves with the TX object when a matching tx is detected in the mempool
 */
const waitForTxUsingSubscribePendingTransactions = (matchF, options = {}) => {
  return new Promise((resolve, reject) => {
    const _web3 = toWeb3(options.web3 ?? web3)

    const subscription = _web3.eth.subscribe('pendingTransactions')
      .on('data', async (txHash) => {
        const tx = await _web3.eth.getTransaction(txHash)

        if (tx != null && (await matchF(tx))) {
          subscription.unsubscribe()
          resolve(tx)
        }
      })
      .on('error', error => {
        throw error
      })
  })
}

/**
 * Waits for a matching tx to be received in the mempool
 * @param {function} matchF Receives a TX object as an argument and returns true if the TX matches the one we're looking for
 * @param {string} mode String that determines the mode to run: `cheap` (less requests, less eficient, more cheap) or `fast` (more requests, more eficient, more expensive)
 * @param {object} options Options for waitForTxUsingGetBlockPending and waitForTxUsingSubscribePendingTransactions
 * @returns {Promise}
 */
const waitForTx = async (matchF, mode, options = {}) => {
  mode = mode.toLowerCase()

  switch (mode) {
    // case 'cheap':
    //   return await waitForTxUsingGetBlockPending(matchF, options)
    case 'fast':
      return await waitForTxUsingSubscribePendingTransactions(matchF, options)
    default:
      throw new Error(`waitForTx mode <${mode}> is not supported`)
  }
}

const setupUtils = async (_web3) => {
  console.log('Setting up web3-utils')

  setUtilsWeb3(toWeb3(_web3 ?? global.web3))
  setGlobalWeb3(toWeb3(_web3 ?? global.web3))

  utilsReady = true
}

const beforeAll = async () => {
  if (!utilsReady) await setupUtils()
}

// Methods that need
let moduleExports = { getWeb3Contracts, getContractAbi, getContractSource, getLiquidityPairAddress, calculateLiquidityPairAddress, liquidityPairHasLiquidity, tokenHasLiquidity, checkRpcSync, getMethodAbiBySignature, waitForTx, sendRawJsonRpcMessage }
for (const moduleExport of Object.entries(moduleExports)) {
  const exportKey = moduleExport[0]
  const exportValue = moduleExport[1]

  moduleExports[exportKey] = async (...args) => {
    await beforeAll()
    return exportValue(...args)
  }
}

moduleExports = { toWeb3, setupUtils, setUtilsWeb3, setGlobalWeb3, ...moduleExports }

module.exports = moduleExports
