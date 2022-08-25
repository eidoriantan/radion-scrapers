
const fs = require('fs')
const path = require('path')
const exec = require('child_process').exec
const express = require('express')
const asyncWrap = require('./utils/async-wrap')
const app = express()

const port = process.env.PORT || 3001
const sslCaPath = process.env.SSL_CA
const sslCertPath = process.env.SSL_CERT
const sslKeyPath = process.env.SSL_KEY
let credentials = {}
let httpClient

if (sslCertPath && sslKeyPath) {
  const sslCert = fs.readFileSync(sslCertPath, { encoding: 'utf-8' })
  const sslKey = fs.readFileSync(sslKeyPath, { encoding: 'utf-8' })
  credentials = { key: sslKey, cert: sslCert }
  httpClient = require('https')
} else {
  httpClient = require('http')
}

if (sslCaPath) {
  const sslCa = fs.readFileSync(sslCaPath, { encoding: 'utf-8' })
  credentials.ca = sslCa
}

app.use(express.json())

app.get('/status', asyncWrap(async (req, res) => {
  const root = path.resolve(__dirname, '../')
  exec('npx forever list', {
    cwd: root
  }, (err, stdout, stderr) => {
    if (err) console.error(err)
    console.log(stdout)
  })
}))

app.use((err, req, res, next) => {
  if (err) {
    const errorPath = path.resolve(__dirname, 'data/server-errors.log')
    fs.appendFileSync(errorPath, err)
    res.status(400).end()
  } else next()
})

const server = httpClient.createServer(credentials, app)
server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
