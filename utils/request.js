
const https = require('https')

module.exports = (url, options = {}, data = null) => {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      if (res.statusCode !== 200) {
        const error = new Error('Returned code: ' + res.statusCode)
        return reject(error)
      }

      const response = { data: '', res }
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        response.data += chunk
      })

      res.on('error', (error) => {
        reject(error)
      })

      res.on('end', () => {
        if (options.headers && options.headers.Accept === 'application/json') {
          response.data = JSON.parse(response.data)
        }

        resolve(response)
      })
    })

    req.on('error', error => {
      reject(error)
    })

    if (data !== null) req.write(data)
    req.end()
  })
}
