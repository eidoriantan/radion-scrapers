
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios').default

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
  const maximum = config.maximum
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
    lastCursor = '0'
    await fs.promises.writeFile(lastCursorPath, lastCursor)
  }

  console.log('Fetching new tokens from melos.studio API...')
  const data = {
    query: `query searchMusicProducts($query: QueryMusicTokenInput!, $cursor: String, $limit: Int) {
      searchMusicProducts(query: $query, cursor: $cursor, limit: $limit) {
        nodes {
          tokenId
          name
          image
          source
          smallImage
          sample
          description
          largeImage
          collect {
            contract {
              chainId
              __typename
            }
            name
            id
            description
            imageUrl
            isBlindbox
            __typename
          }
          isMysterybox
          itemId
          contract {
            chainId
            __typename
          }
          prioritizeOrder {
            currentPrice
            usdPrice
            paymentToken {
              symbol
              decimals
              chainId
              usdPrice
              __typename
            }
            __typename
          }
          fixedPriceOrder {
            listingTime
            expirationTime
            saleKind
            currentPrice
            usdPrice
            paymentToken {
              symbol
              decimals
              chainId
              usdPrice
              __typename
            }
            __typename
          }
          englishOrder {
            listingTime
            expirationTime
            currentPrice
            usdPrice
            paymentToken {
              symbol
              decimals
              chainId
              usdPrice
              __typename
            }
            __typename
          }
          dutchOrder {
            listingTime
            expirationTime
            currentPrice
            usdPrice
            paymentToken {
              symbol
              decimals
              chainId
              usdPrice
              __typename
            }
            __typename
          }
          offerOrder {
            listingTime
            expirationTime
            currentPrice
            usdPrice
            paymentToken {
              symbol
              decimals
              chainId
              usdPrice
              __typename
            }
            __typename
          }
          creator {
            avator
            name
            id
            __typename
          }
          product {
            id
            name
            description
            image
            price
            chainId
            items {
              name
              description
              image
              rarity
              itemId
              __typename
            }
            secondaryMarketStartTime
            __typename
          }
          __typename
        }
        cursor
        __typename
      }
    }`,
    variables: {
      cursor: lastCursor,
      limit: maximum,
      query: {
        chainId: null,
        inDescendingOrder: false,
        isMysterybox: false,
        isNotMyProfile: true,
        keywords: '',
        kind: null,
        musicianTags: null,
        sortBy: 'listingTime',
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
  const tokens = response.searchMusicProducts.nodes

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const cursor = parseInt(lastCursor) + i
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

        await fs.promises.writeFile(skippedPath, skipped + '\r\n' + token.token_id)
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
            console.error('Token Name: ' + token.name)
            console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
          } else {
            throw new Error(result.message)
          }
        }
        console.log('Processed ' + token.name + '\r\n')
      } else {
        throw new Error('Response Code: ' + fingerprintRes.status.toString())
      }
    } catch (error) {
      console.error('Token Name: ' + token.name)
      console.error('Token ID: ' + token.token_id)
      console.error(error.message + '\r\n')

      let errors = ''
      try {
        await fs.promises.access(errorsPath, fs.constants.F_OK)
        errors = await fs.promises.readFile(errorsPath, { encoding: 'utf-8' })
        errors = errors.trim()
      } catch (error) {}

      await fs.promises.writeFile(errorsPath, errors + '\r\n' + token.token_id)
    }
  }
}
