
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios').default
const timeoutAsync = require('./utils/timeout')

module.exports.start = async (config = {}) => {
  const maximum = config.maximum
  const network = config.network
  const timeout = config.timeout
  const contracts = []
  if (!config.addresses) return

  for (const name in config.addresses) {
    const address = config.addresses[name]
    contracts.push(processContract(name, address, network, maximum, timeout))
  }

  return await Promise.all(contracts)
}

async function processContract (name, address, network = 'mainnet', limit = 30, timeout = 60000) {
  const skippedPath = path.resolve(__dirname, '..', 'data/' + name + '-skipped.txt')
  const errorsPath = path.resolve(__dirname, '..', 'data/' + name + '-errors.txt')
  const lastTokenPath = path.resolve(__dirname, '..', 'data/' + name + '-lasttoken.txt')
  let lastToken = null

  try {
    await fs.promises.access(lastTokenPath, fs.constants.F_OK)
    lastToken = await fs.promises.readFile(lastTokenPath, { encoding: 'utf-8' })
    lastToken = lastToken.trim()
  } catch (error) {
    console.log('"' + name + '" data file does not exist. Creating one...')
    lastToken = '0'
    await fs.promises.writeFile(lastTokenPath, lastToken)
  }

  console.log('Fetching new tokens from TzKT API...')
  const search = new URLSearchParams()
  search.set('contract', address)
  search.set('tokenId.ge', lastToken)
  search.set('limit', limit)

  const tokensRes = await axios.get(`https://api.tzkt.io/v1/tokens?${search.toString()}`)
  if (tokensRes.status !== 200) {
    console.error(tokensRes.data)
    throw new Error('Response Code: ' + tokensRes.status.toString())
  }

  const tokens = tokensRes.data
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const metadata = token.metadata
    await fs.promises.writeFile(lastTokenPath, token.tokenId)

    try {
      const form = new FormData()
      form.append('title', metadata.name)
      form.append('artist', metadata.artist)
      form.append('audio', metadata.artifactUri)
      form.append('artwork', metadata.displayUri)
      form.append('platform', name)
      form.append('blockchain', 'Tezos')

      const formBuffer = form.getBuffer()
      const formLength = form.getLengthSync()
      const timeoutPromise = timeoutAsync(timeout, async () => {
        let skipped = ''
        try {
          await fs.promises.access(skippedPath, fs.constants.F_OK)
          skipped = await fs.promises.readFile(skippedPath, { encoding: 'utf-8' })
          skipped = skipped.trim()
        } catch (error) {}

        await fs.promises.writeFile(skippedPath, skipped + '\r\n' + token.tokenId)
      })

      const submission = axios.post('https://www.radion.fm/api/fingerprint', formBuffer, {
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + form.getBoundary(),
          'Content-Length': formLength
        }
      })

      const fingerprintRes = await Promise.race([submission, timeoutPromise])
      if (fingerprintRes.status === 200) {
        const result = JSON.parse(fingerprintRes.data)
        if (!result.success) {
          if (result.message === 'Detected similar song') {
            const title = result.similar.title
            const artist = result.similar.artist
            console.error('Token Name: ' + metadata.name)
            console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
          } else {
            throw new Error(result.message)
          }
        }
        console.log('Processed ' + metadata.name + '\r\n')
      } else {
        throw new Error('Response Code: ' + fingerprintRes.status.toString())
      }
    } catch (error) {
      console.error('Token Name: ' + metadata.name)
      console.error('Token ID: ' + token.tokenId)
      console.error(error.message + '\r\n')

      let errors = ''
      try {
        await fs.promises.access(errorsPath, fs.constants.F_OK)
        errors = await fs.promises.readFile(errorsPath, { encoding: 'utf-8' })
        errors = errors.trim()
      } catch (error) {}

      await fs.promises.writeFile(errorsPath, errors + '\r\n' + token.tokenId)
    }
  }
}
