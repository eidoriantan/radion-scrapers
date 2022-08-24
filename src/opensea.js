
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios').default

const openseaEndpoint = 'https://api.opensea.io/api/v1'

async function timeoutAsync (timeout, callback) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      callback()
      const error = new Error('Timed out')
      reject(error)
    }, timeout)
  })
}

module.exports.start = async (config = {}) => {
  const limit = config.limit || 50
  const timeout = config.timeout || 60000
  const slug = config.slug || 'async-music'
  const apiKey = config.apiKey
  const skippedPath = path.resolve(__dirname, '../data/opensea-' + slug + '-skipped.txt')
  const errorsPath = path.resolve(__dirname, '../data/opensea-' + slug + '-errors.txt')
  const cursorPath = path.resolve(__dirname, '../data/opensea-' + slug + '-lastcursor.txt')
  let cursor = ''

  if (!slug) throw new Error('Slug is not defined in `config.json`')
  if (!apiKey) throw new Error('API Key is not defined in `config.json`')

  try {
    await fs.promises.access(cursorPath, fs.constants.F_OK)
    cursor = await fs.promises.readFile(cursorPath, { encoding: 'utf-8' })
  } catch (error) {
    console.log('OpenSea data file does not exist. Creating one...')
    cursor = ''
    await fs.promises.writeFile(cursorPath, cursor)
  }

  console.log('Fetching new tokens from OpenSea API...')
  const tokensQuery = new URLSearchParams()
  tokensQuery.set('format', 'json')
  tokensQuery.set('order_direction', 'asc')
  tokensQuery.set('collection_slug', slug)
  tokensQuery.set('limit', limit)
  if (cursor) tokensQuery.set('cursor', cursor)

  const tokensRes = await axios.get(`${openseaEndpoint}/assets?${tokensQuery.toString()}`, {
    headers: { 'X-API-KEY': apiKey }
  })

  const tokensData = tokensRes.data
  const tokens = tokensData.assets

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const title = token.name
    const artist = (token.creator.user && token.creator.user.username) || token.creator.address
    const artifact = token.animation_original_url
    const artwork = token.image_original_url
    const contractAddress = token.asset_contract.address
    const tokenId = token.token_id

    try {
      const form = new FormData()
      form.append('title', title)
      form.append('artist', artist)
      form.append('audio', artifact)
      form.append('platform', 'OpenSea')
      form.append('blockchain', 'Ethereum')
      form.append('additional', 'Contract Address: ' + contractAddress + '\r\nToken ID: ' + tokenId)
      if (artwork) form.append('artwork', artwork)

      const formBuffer = form.getBuffer()
      const formLength = form.getLengthSync()
      const timeoutPromise = timeoutAsync(timeout, async () => {
        let skipped = ''
        try {
          await fs.promises.access(skippedPath, fs.constants.F_OK)
          skipped = await fs.promises.readFile(skippedPath, { encoding: 'utf-8' })
          skipped = skipped.trim()
        } catch (error) {}

        await fs.promises.writeFile(skippedPath, skipped + '\r\n' + contractAddress + ' - ' + tokenId)
      })

      const submission = axios.post('https://www.radion.fm/api/fingerprint/', formBuffer, {
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + form.getBoundary(),
          'Content-Length': formLength
        }
      })

      const fingerprintRes = await Promise.race([submission, timeoutPromise])
      if (fingerprintRes.status === 200) {
        const result = fingerprintRes.data
        if (!result.success) {
          if (result.message === 'Detected similar song') {
            const title = result.similar.title
            const artist = result.similar.artist
            console.error('Token ID: ' + tokenId)
            console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
          } else {
            throw new Error(result.message)
          }
        }
        console.log('Processed ' + contractAddress + ' - ' + tokenId + '\r\n')
      } else {
        throw new Error('Response Code: ' + fingerprintRes.status.toString())
      }
    } catch (error) {
      console.error('Token Name: ' + title)
      console.error('Contract Address: ' + contractAddress)
      console.error('Token ID: ' + tokenId)
      console.error(error.message + '\r\n')

      let errors = ''
      try {
        await fs.promises.access(errorsPath, fs.constants.F_OK)
        errors = await fs.promises.readFile(errorsPath, { encoding: 'utf-8' })
        errors = errors.trim()
      } catch (error) {}

      await fs.promises.writeFile(errorsPath, errors + '\r\n' + contractAddress + ' - ' + tokenId)
    }

    cursor = tokensData.next
    await fs.promises.writeFile(cursorPath, cursor)
  }
}
