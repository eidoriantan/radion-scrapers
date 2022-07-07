
const OpenseaScraper = require('opensea-scraper')

const url = 'https://opensea.io/collection/async-music?search[sortAscending]=true&search[sortBy]=LISTING_DATE'

async function start () {
  const result = await OpenseaScraper.offersByScrollingByUrl(url, 15, {
    logs: true
  })

  console.log(result)
}

start()
