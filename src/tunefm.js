
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios').default
const jsdom = require('jsdom')
const timeoutAsync = require('./utils/timeout')

const { JSDOM } = jsdom
const tunefmEndpoint = 'https://tune.fm'

function parseTokenId (html) {
  const dom = new JSDOM(html)
  const element = dom.window.document.querySelector('[play-id]')
  const id = element.getAttribute('play-id')
  return parseInt(id)
}

module.exports.start = async (config = {}) => {
  const limit = config.limit || 50
  const timeout = config.timeout || 60000
  const sessionid = config.sessionid
  const skippedPath = path.resolve(__dirname, '../data/tunefm-skipped.txt')
  const errorsPath = path.resolve(__dirname, '../data/tunefm-errors.txt')
  const offsetPath = path.resolve(__dirname, '../data/tunefm-lastoffset.txt')
  const latestPath = path.resolve(__dirname, '../data/tunefm-latest.txt')
  let offset = 0
  let latest = 0

  if (!sessionid) throw new Error('Session ID is not defined in `config.json`')

  try {
    await fs.promises.access(offsetPath, fs.constants.F_OK)
    offset = parseInt(await fs.promises.readFile(offsetPath, { encoding: 'utf-8' }))
  } catch (error) {
    console.log('tune.fm data file does not exist. Creating one...')
    offset = 0
    await fs.promises.writeFile(offsetPath, offset.toString())
  }

  try {
    await fs.promises.access(latestPath, fs.constants.F_OK)
    latest = parseInt(await fs.promises.readFile(latestPath, { encoding: 'utf-8' }))
  } catch (error) {
    latest = 0
    await fs.promises.writeFile(latestPath, latest.toString())
  }

  console.log('Fetching new tokens from tune.fm Private API...')
  const assetsQuery = new URLSearchParams()
  assetsQuery.set('ranking', 'newest')
  assetsQuery.set('time', 'month')
  assetsQuery.set('price', 'all')
  assetsQuery.set('offset', offset)
  assetsQuery.set('count', limit)

  const assetsRes = await axios.get(`${tunefmEndpoint}/songs/.json?${assetsQuery.toString()}`, {
    headers: { Cookie: `sessionid=${sessionid}` }
  })

  const assetsData = assetsRes.data
  const assets = assetsData.listings

  for (let i = 0; i < assets.length; i++) {
    const tokenId = parseTokenId(assets[i])
    if (tokenId > latest) {
      latest = tokenId
      await fs.promises.writeFile(latestPath, latest.toString())
    } else if (tokenId === latest) return

    const tokenRes = await axios.get(`${tunefmEndpoint}/api/v0/song~${tokenId}`, {
      headers: { Cookie: `sessionid=${sessionid}` }
    })

    const token = tokenRes.data
    const title = token.title
    const artist = token.artistName
    const artifact = token.path
    let artworkPath = token.artwork
    while (artworkPath[0] === '/') artworkPath = artworkPath.slice(1)
    const artwork = `${tunefmEndpoint}/${artworkPath}`

    try {
      const form = new FormData()
      form.append('title', title)
      form.append('artist', artist)
      form.append('audio', artifact)
      form.append('platform', 'tune.fm')
      form.append('blockchain', 'Hedera Hashgraph')
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

        await fs.promises.writeFile(skippedPath, skipped + '\r\n' + tokenId)
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
        console.log('Processed ' + tokenId + '\r\n')
      } else {
        throw new Error('Response Code: ' + fingerprintRes.status.toString())
      }
    } catch (error) {
      console.error('Token Name: ' + title)
      console.error('Token ID: ' + tokenId)
      console.error(error.message + '\r\n')

      let errors = ''
      try {
        await fs.promises.access(errorsPath, fs.constants.F_OK)
        errors = await fs.promises.readFile(errorsPath, { encoding: 'utf-8' })
        errors = errors.trim()
      } catch (error) {}

      await fs.promises.writeFile(errorsPath, errors + '\r\n' + tokenId)
    }
  }

  offset += assets.length
  await fs.promises.writeFile(offsetPath, offset.toString())
}
