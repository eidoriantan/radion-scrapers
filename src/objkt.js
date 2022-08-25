
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios').default

const objktEndpoint = 'https://132.148.77.82:3002/graphql'
const cdnEndpoint = 'https://132.148.77.82:3002/media'

async function getTokens (offset = 0, limit = 500) {
  const query = {
    query: `query GetTokens($offset: Int = 0, $limit: Int = 500) {
      token(where: {
        mime: {_regex: "^audio\\/"}
      },
      order_by: { timestamp: asc },
      offset: $offset, limit: $limit) {
        name
        fa_contract
        token_id
        artifact_uri
        display_uri
        thumbnail_uri
        creators {
          creator_address
          holder {
            address
            alias
          }
        }
      }
    }`,
    variables: { offset, limit }
  }

  const response = await axios.post(objktEndpoint, query)
  return response.data.data.token
}

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
  const limit = config.limit || 100
  const timeout = config.timeout || 60000
  const skippedPath = path.resolve(__dirname, '../data/objkt-new-skipped.txt')
  const errorsPath = path.resolve(__dirname, '../data/objkt-new-errors.txt')
  const lastTokenPath = path.resolve(__dirname, '../data/objkt-new-lasttoken.txt')
  let lastToken = null

  try {
    await fs.promises.access(lastTokenPath, fs.constants.F_OK)
    lastToken = await fs.promises.readFile(lastTokenPath, { encoding: 'utf-8' })
    lastToken = parseInt(lastToken)
  } catch (error) {
    console.log('OBJKT data file does not exist. Creating one...')
    lastToken = 0
    await fs.promises.writeFile(lastTokenPath, lastToken.toString())
  }

  console.log('Fetching new tokens from OBJKT Public API...')
  const tokens = await getTokens(lastToken, limit)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    lastToken++
    await fs.promises.writeFile(lastTokenPath, lastToken.toString())

    const title = token.name
    let artist = ''
    let exists = false

    if (token.creators.length > 0) {
      const creator = token.creators[0]
      artist = creator.holder && creator.holder.alias ? creator.holder.alias : creator.creator_address
    }

    try {
      const query = new URLSearchParams()
      query.set('title', title)
      query.set('artist', artist)

      const url = 'https://www.radion.fm/api/fingerprint/search.php?' + query.toString()
      const searchRes = await axios.get(url)
      if (searchRes.data.length > 0) {
        exists = true
        break
      }
    } catch (error) {
      console.error('"' + title + '" already exists...')
    }

    if (exists) break
    try {
      const form = new FormData()
      const artifactUri = token.artifact_uri.slice(7)
      let artwork = null
      if (token.display_uri) artwork = token.display_uri.slice(7)
      else if (token.thumbnail_uri) artwork = token.thumbnail_uri.slice(7)

      form.append('title', title)
      form.append('artist', artist)
      form.append('audio', `${cdnEndpoint}/${artifactUri}`)
      form.append('platform', 'OBJKT')
      form.append('blockchain', 'Tezos')
      form.append('additional', 'Contract Address: ' + token.fa_contract + '\r\nToken ID: ' + token.token_id)
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

        await fs.promises.writeFile(skippedPath, skipped + '\r\n' + token.fa_contract + ' - ' + token.token_id)
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
            console.error('Token ID: ' + token.token_id)
            console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
          } else {
            throw new Error(result.message)
          }
        }
        console.log('Processed ' + token.fa_contract + ' - ' + token.token_id + '\r\n')
      } else {
        throw new Error('Response Code: ' + fingerprintRes.status.toString())
      }
    } catch (error) {
      console.error('Token Name: ' + title)
      console.error('Contract Address: ' + token.fa_contract)
      console.error('Token ID: ' + token.token_id)
      console.error(error.message + '\r\n')

      let errors = ''
      try {
        await fs.promises.access(errorsPath, fs.constants.F_OK)
        errors = await fs.promises.readFile(errorsPath, { encoding: 'utf-8' })
        errors = errors.trim()
      } catch (error) {}

      await fs.promises.writeFile(errorsPath, errors + '\r\n' + token.fa_contract + ' - ' + token.token_id)
    }
  }
}
