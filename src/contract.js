
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const request = require('../utils/request')

module.exports.start = async (config = {}) => {
  const maximum = config.maximum
  const network = config.network
  if (!config.addresses) return

  for (const name in config.addresses) {
    const address = config.addresses[name]
    processContract(name, address, network, maximum)
  }
}

async function processContract (name, address, network = 'mainnet', limit = 30) {
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

  const tokensRes = await request(`https://api.tzkt.io/v1/tokens?${search.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  })

  if (tokensRes.res.statusCode !== 200) {
    console.error(tokensRes.data)
    throw new Error('Response Code: ' + tokensRes.res.statusCode.toString())
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
      const fingerprintRes = await request('https://www.radion.fm/api/fingerprint/', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + form.getBoundary(),
          'Content-Length': formLength
        }
      }, formBuffer)

      if (fingerprintRes.res.statusCode === 200) {
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
        console.error('Token ID: ' + token.tokenId)
        console.error('Response Code: ' + fingerprintRes.res.statusCode)
      }
    } catch (error) {
      console.error('Token Name: ' + metadata.name)
      console.error(error.message + '\r\n')
    }
  }
}
