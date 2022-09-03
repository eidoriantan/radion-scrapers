
const fs = require('fs')
const path = require('path')
const FormData = require('form-data')
const axios = require('axios').default
const timeoutAsync = require('./utils/timeout')

const soundxyzEndpoint = 'https://api.sound.xyz/graphql'

async function getArtifact (trackId) {
  const data = {
    query: `query audioFromTrack($trackId: UUID!) {
      audioFromTrack(trackId: $trackId) {
        id
        audio {
          id
          url
          __typename
        }
        __typename
      }
    }`,
    variables: {
      trackId
    }
  }

  const audioRes = await axios.post(soundxyzEndpoint, data)
  if (audioRes.status !== 200) {
    console.error(audioRes.data)
    throw new Error('Response Code: ' + audioRes.status.toString())
  }

  const response = audioRes.data.data
  return response.audioFromTrack.audio.url
}

module.exports.start = async (config = {}) => {
  const limit = config.limit || 18
  const timeout = config.timeout || 60000
  const skippedPath = path.resolve(__dirname, '../data/soundxyz-skipped.txt')
  const errorsPath = path.resolve(__dirname, '../data/soundxyz-errors.txt')
  const cursorPath = path.resolve(__dirname, '../data/soundxyz-lastcursor.txt')
  let cursor = null

  try {
    await fs.promises.access(cursorPath, fs.constants.F_OK)
    cursor = await fs.promises.readFile(cursorPath, { encoding: 'utf-8' })
  } catch (error) {
    console.log('sound.xyz data file does not exist. Creating one...')
    cursor = null
  }

  console.log('Fetching new tokens from sound.xyz Private API...')
  const data = {
    query: `query DiscoverAllMintedReleases($pagination: CursorConnectionArgs!, $filter: MintedReleasesCursorFilterArgs) {
      pastMintedReleases(pagination: $pagination, filter: $filter) {
        edges {
          node {
            id
            mintStartTime
            ...FlexibleSongCard
            __typename
          }
          cursor
          __typename
        }
        pageInfo {
          hasNextPage
          endCursor
          __typename
        }
        __typename
      }
    }

    fragment FlexibleSongCard on Release {
      id
      title
      titleSlug
      publicListeningParty
      coverImage {
        id
        url
        __typename
      }
      track {
        id
        __typename
      }
      artist {
        id
        name
        soundHandle
        __typename
      }
      __typename
    }`,
    variables: {
      filter: {
        genre: null,
        releaseStatus: null,
        season: null
      },
      pagination: {
        after: cursor,
        first: limit,
        sort: 'ASC'
      }
    }
  }

  const tokensRes = await axios.post(soundxyzEndpoint, data)
  if (tokensRes.status !== 200) {
    console.error(tokensRes.data)
    throw new Error('Response Code: ' + tokensRes.status.toString())
  }

  const response = tokensRes.data.data
  const tokens = response.pastMintedReleases.edges

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const tokenNode = token.node
    cursor = token.cursor
    await fs.promises.writeFile(cursorPath, cursor)

    const title = tokenNode.title
    const artist = tokenNode.artist.name
    const trackId = tokenNode.track.id
    const artifact = await getArtifact(trackId)
    const artwork = tokenNode.coverImage.url

    try {
      const form = new FormData()
      form.append('title', title)
      form.append('artist', artist)
      form.append('audio', artifact)
      form.append('platform', 'sound.xyz')
      form.append('blockchain', 'Ethereum')
      form.append('additional', 'Track ID: ' + trackId)
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

        await fs.promises.writeFile(skippedPath, skipped + '\r\n' + trackId)
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
          console.error('Track ID: ' + trackId)
          console.error('Detected similar song: ' + artist + ' - ' + title + '\r\n')
        } else {
          throw new Error(result.message)
        }
      }
      console.log('Processed ' + trackId + '\r\n')
    } catch (error) {
      console.error('Token Name: ' + title)
      console.error('Track ID: ' + trackId)
      console.error(error.message + '\r\n')

      let errors = ''
      try {
        await fs.promises.access(errorsPath, fs.constants.F_OK)
        errors = await fs.promises.readFile(errorsPath, { encoding: 'utf-8' })
        errors = errors.trim()
      } catch (error) {}

      await fs.promises.writeFile(errorsPath, errors + '\r\n' + trackId)
    }
  }
}
