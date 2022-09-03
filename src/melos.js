
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios').default
const timeoutAsync = require('./utils/timeout')

module.exports.start = async (config = {}) => {
  const maximum = config.maximum || 20
  const timeout = config.timeout || 60000
  const skippedPath = path.resolve(__dirname, '../data/melos-skipped.txt')
  const errorsPath = path.resolve(__dirname, '../data/melos-errors.txt')
  const lastCursorPath = path.resolve(__dirname, '..', 'data/melos-lastcursor.txt')
  let lastCursor = null

  try {
    await fs.promises.access(lastCursorPath, fs.constants.F_OK)
    lastCursor = await fs.promises.readFile(lastCursorPath, { encoding: 'utf-8' })
    lastCursor = lastCursor.trim()
  } catch (error) {
    console.log('MELOS Studio data file does not exist. Creating one...')
    lastCursor = null
  }

  console.log('Fetching new tokens from melos.studio API...')
  const data = {
    query: `query EsMusicList($query: ESMusicListInput, $cursor: String, $limit: Int) {
      esMusicList(query: $query, cursor: $cursor, limit: $limit) {
        nodes {
          tokenId
          image
          creator {
            name
            id
            __typename
          }
          sample
          name
        }
        cursor
        total
        __typename
      }
    }`,
    variables: {
      cursor: lastCursor,
      limit: maximum,
      query: {
        album: null,
        chainId: null,
        inDescendingOrder: 'asc',
        keywords: null,
        kind: null,
        musicianTags: null,
        priceRange: {
          maxPrice: null,
          minPrice: null
        },
        sortBy: 'listingTime',
        style: null,
        symbol: null
      }
    }
  }

  const tokensRes = await axios.post('https://app.melos.studio/graphql', data)
  if (tokensRes.status !== 200) {
    console.error(tokensRes.data)
    throw new Error('Response Code: ' + tokensRes.status.toString())
  }

  const response = tokensRes.data.data
  const tokens = response.esMusicList.nodes

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const cursor = lastCursor !== null ? parseInt(lastCursor) + i : i
    await fs.promises.writeFile(lastCursorPath, cursor.toString())

    try {
      const form = new FormData()
      form.append('title', token.name)
      form.append('artist', token.creator.name)
      form.append('audio', token.sample)
      form.append('artwork', token.image)
      form.append('platform', 'MELOS Studio')
      form.append('blockchain', 'BNB')

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

      const submission = axios.post('https://www.radion.fm/api/fingerprint/', formBuffer, {
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + form.getBoundary(),
          'Content-Length': formLength
        }
      })

      const fingerprintRes = await Promise.race([submission, timeoutPromise])
      if (fingerprintRes === null) throw new Error('Timed out')
      if (fingerprintRes.status !== 200) throw new Error('Response Code: ' + fingerprintRes.status)

      const result = fingerprintRes.data
      if (!result.success) {
        if (result.message === 'Detected similar song') {
          const title = result.similar.title
          const artist = result.similar.artist
          console.error('Token Name: ' + token.name)
          console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
        } else {
          throw new Error(result.message)
        }
      }
      console.log('Processed ' + token.name + '\r\n')
    } catch (error) {
      console.error('Token Name: ' + token.name)
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
