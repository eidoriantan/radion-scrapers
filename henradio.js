
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const request = require('./utils/request')

module.exports.start = async (config = {}) => {
  const maximum = config.maximum
  const lastIDPath = path.resolve(__dirname, 'data/last-id.txt')
  let lastID = 0

  try {
    await fs.promises.access(lastIDPath, fs.constants.F_OK)
    lastID = await fs.promises.readFile(lastIDPath, { encoding: 'utf-8' }) || 0
  } catch (error) {
    console.error(error)
    throw new Error(`"${lastIDPath}" is not accessible`)
  }

  console.log('Fetching new tokens from hicdex API...')
  const data = JSON.stringify({
    query: `query GetAllTracks($offset: Int!, $limit: Int!) {
      hic_et_nunc_token(where: {
        id: {_gt: "${lastID}"},
        mime: {_in: ["audio/ogg", "audio/wav", "audio/mpeg"]},
        token_holders: {quantity: {_gt: "0"},
        holder_id: {_neq: "tz1burnburnburnburnburnburnburjAYjjX"}}
      }, order_by: {id: asc}, limit: $limit, offset: $offset) {
        id
        display_uri
        title
        description
        thumbnail_uri
        mime
        creator_id
        creator {
          name
        }
        artifact_uri
        token_tags {
          tag {
            tag
          }
        }
        creator {
          name
          metadata
        }
        supply
        token_holders {
          quantity
          holder_id
        }
        swaps(where: {status: {_eq: "0"}, contract_version: {_neq: "1"}}, order_by: {price: asc}) {
          price
        }
      }
    }`,
    variables: {
      offset: 0,
      limit: maximum
    }
  })

  const tokensRes = await request('https://api.hicdex.com/v1/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  }, data)

  const response = tokensRes.data
  const tokens = response.data.hic_et_nunc_token

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    try {
      const form = new FormData()
      form.append('title', token.title)
      form.append('artist', token.creator.name !== '' ? token.creator.name : token.creator_id)
      form.append('audio', token.artifact_uri.slice(7))
      form.append('artwork', token.display_uri !== '' ? token.display_uri.slice(7) : token.thumbnail_uri.slice(7))
      form.append('platform', 'Hen Radio')
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

      const result = JSON.parse(fingerprintRes.data)
      if (!result.success) {
        if (result.message === 'Detected similar song') {
          const title = result.similar.title
          const artist = result.similar.artist
          console.error('Token ID: ' + token.id)
          console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
        } else {
          throw new Error(result.message)
        }
      }
      console.log('Processed ' + token.id + '\r\n')
    } catch (error) {
      console.error('Token ID: ' + token.id)
      console.error(error.message + '\r\n')
    }

    await fs.promises.writeFile(lastIDPath, token.id)
  }
}
