
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const request = require('../utils/request')

async function getTokens (page, maximum = 24) {
  const query = new URLSearchParams()
  query.set('q', '')
  query.set('query_by', 'name,creators_aliases,mime,tags,attribute_names,creators_addresses,fa_contract,description')
  query.set('query_by_weights', '10,8,6,4,4,3,2,1')
  query.set('facet_by', 'mime,fa_contract')
  query.set('max_facet_values', 1000)
  query.set('num_typos', 2)
  query.set('per_page', maximum)
  query.set('page', page)
  query.set('include_fields', 'artifact_uri,collection_name,creators_addresses,creators_aliases,creators,display_uri,fa,fa_collection_type,fa_contract,id,lowest_ask,highest_offer,name,supply,thumbnail_uri,token_id')
  query.set('filter_by', 'mime:= [audio/wav,audio/ogg,audio/mpeg,audio/flac,audio/x-wav] && fa_live:=true && flag:=none')
  query.set('sort_by', 'timestamp:desc')

  const url = 'https://search2.objkt.com/collections/tokens/documents/search?' + query.toString()
  const tokensRes = await request(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-typesense-api-key': 'aBVqygD52AbM8eQbO2I1LjJpvpFZOLAlWrdl1vZizyp2Mzj9D6bAKNzKE6TP6uOP'
    }
  })

  if (tokensRes.res.statusCode !== 200) {
    console.error(tokensRes.data)
    throw new Error('Response Code: ' + tokensRes.res.statusCode.toString())
  }

  return tokensRes.data
}

module.exports.start = async (config = {}) => {
  const maximum = config.maximum || 24
  const lastTokenPath = path.resolve(__dirname, '..', 'data/objkt-lasttoken.txt')
  let lastToken = null

  try {
    await fs.promises.access(lastTokenPath, fs.constants.F_OK)
    lastToken = await fs.promises.readFile(lastTokenPath, { encoding: 'utf-8' })
  } catch (error) {
    console.log('OBJKT data file does not exist. Creating one...')
    lastToken = '1-0'
    await fs.promises.writeFile(lastTokenPath, lastToken)
  }

  console.log('Fetching new tokens from OBJKT Search API...')
  const parts = lastToken.split('-')
  let page = parts[0]
  let index = parts[1]

  let search = await getTokens(page, maximum)
  while (!search.search_cutoff) {
    for (let i = parseInt(index); i < search.hits.length; i++) {
      const token = search.hits[i].document
      index = i.toString()
      await fs.promises.writeFile(lastTokenPath, page + '-' + index)

      try {
        const address = token.creators_addresses.length > 0 ? token.creators_addresses[0] : ''
        const artist = token.creators_aliases.length > 0 ? token.creators_aliases[0] : address
        const form = new FormData()
        form.append('title', token.name)
        form.append('artist', artist)
        form.append('audio', token.artifact_uri.slice(7))
        form.append('artwork', token.display_uri !== '' ? token.display_uri.slice(7) : token.thumbnail_uri.slice(7))
        form.append('platform', 'OBJKT')
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
              console.error('Token ID: ' + token.token_id)
              console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
            } else {
              throw new Error(result.message)
            }
          }
          console.log('Processed ' + token.token_id + '\r\n')
        } else {
          console.error('Token ID: ' + token.token_id)
          console.error('Response Code: ' + fingerprintRes.res.statusCode)
        }
      } catch (error) {
        console.error('Token ID: ' + token.token_id)
        console.error(error.message + '\r\n')
      }
    }

    page = (parseInt(page) + 1).toString()
    index = '0'
    search = await getTokens(page)
    await fs.promises.writeFile(lastTokenPath, page + '-' + index)
  }
}
