
const cron = require('node-cron')

const config = require('./config.json')
const contract = require('./src/contract')
const objkt = require('./src/objkt')
const melos = require('./src/melos')
const opensea = require('./src/opensea')
const tunefm = require('./src/tunefm')
const soundxyz = require('./src/soundxyz')

const interval = config.rewardInterval.minute + ' ' +
  config.rewardInterval.hour + ' ' +
  config.rewardInterval.dayOfMonth + ' ' +
  config.rewardInterval.month + ' ' +
  config.rewardInterval.dayOfWeek

let contractTask = null
let objktTask = null
let melosTask = null
let openseaTask = null
let tunefmTask = null
let soundxyzTask = null

if (!process.env.NO_CONTRACT) {
  contractTask = cron.schedule(interval, async () => {
    return await contract.start(config.contract)
  })
}

if (!process.env.NO_OBJKT) {
  objktTask = cron.schedule(interval, async () => {
    return await objkt.start(config.objkt)
  })
}

if (!process.env.NO_MELOS) {
  melosTask = cron.schedule(interval, async () => {
    return await melos.start(config.melos)
  })
}

if (!process.env.NO_OPENSEA) {
  openseaTask = cron.schedule(interval, async () => {
    return await opensea.start(config.opensea)
  })
}

if (!process.env.NO_TUNEFM) {
  tunefmTask = cron.schedule(interval, async () => {
    return await tunefm.start(config.tunefm)
  })
}

if (!process.env.NO_SOUNDXYZ) {
  soundxyzTask = cron.schedule(interval, async () => {
    return await soundxyz.start(config.soundxyz)
  })
}

process.on('SIGINT', () => {
  if (contractTask) contractTask.stop()
  if (objktTask) objktTask.stop()
  if (melosTask) melosTask.stop()
  if (openseaTask) openseaTask.stop()
  if (tunefmTask) tunefmTask.stop()
  if (soundxyzTask) soundxyzTask.stop()
})

process.on('uncaughtException', error => {
  console.error(error.message)
})

process.on('unhandledRejection', error => {
  console.error(error)
})
