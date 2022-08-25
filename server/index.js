
const fs = require('fs')
const path = require('path')
const exec = require('child_process').exec
const express = require('express')
const removeANSI = require('./utils/remove-ansi')
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

app.get('/status', (req, res) => {
  const root = path.resolve(__dirname, '../')
  exec('npx forever list --plain', { cwd: root }, (err, stdout, stderr) => {
    if (err) {
      console.error(err)
      res.status(500).json({
        success: false,
        message: err
      })
      return
    }

    const lines = removeANSI(stdout).split('\n')
    const statuses = {
      objkt: {
        running: false,
        lastUpdate: null
      },
      melos: {
        running: false,
        lastUpdate: null
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].match(/(?:[^\s"]+|"[^"]*")+/g)
      if (line === null || line[0] !== 'data:' || line[1] === 'uid') continue
      if (line[4] === 'scripts/objkt.js') {
        const uptime = line[8].split(':')
        const date = new Date()
        date.setDate(date.getDate() - parseInt(uptime[0]))
        date.setHours(date.getHours() - parseInt(uptime[1]))
        date.setMinutes(date.getMinutes() - parseInt(uptime[2]))
        date.setSeconds(date.getSeconds() - parseInt(uptime[3]))

        const timestamp = Math.floor(date.getTime() / 1000)
        statuses.objkt.running = true
        statuses.objkt.lastUpdate = timestamp
      }
    }

    res.json({
      success: true,
      message: 'No errors',
      statuses
    })
  })
})

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
