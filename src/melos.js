
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const request = require('../utils/request')

module.exports.start = async (config = {}) => {
  const maximum = config.maximum
  const lastTokenPath = path.resolve(__dirname, '..', 'data/melos-lasttoken.txt')
  let lastToken = null

  try {
    await fs.promises.access(lastTokenPath, fs.constants.F_OK)
    lastToken = await fs.promises.readFile(lastTokenPath, { encoding: 'utf-8' })
  } catch (error) {
    console.log('MELOS Studio data file does not exist. Creating one...')
    lastToken = '0-0'
    await fs.promises.writeFile(lastTokenPath, lastToken)
  }

  console.log('Fetching new tokens from melos.studio API...')
  const parts = lastToken.trim().split('-')
  const cursor = parts[0]
  const index = parseInt(parts[1])
  const data = JSON.stringify({
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
      cursor,
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
  })

  const tokensRes = await request('https://app.melos.studio/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  }, data)

  const response = tokensRes.data.data
  const tokens = response.searchMusicProducts.nodes

  let i = index
  for (i; i < maximum; i++) {
    const token = tokens[i]
    await fs.promises.writeFile(lastTokenPath, `${cursor}-${i}`)

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
      const fingerprintRes = await request('https://www.radion.fm/api/fingerprint/', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=' + form.getBoundary(),
          'Content-Length': formLength
        }
      }, formBuffer)

      const result = JSON.parse(fingerprintRes.data)
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
      console.error(error.message + '\r\n')
    }
  }

  if (i === maximum) {
    await fs.promises.writeFile(lastTokenPath, `${parseInt(cursor) + 1}-0`)
  }
}
