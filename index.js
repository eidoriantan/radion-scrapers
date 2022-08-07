
const cron = require('node-cron')

const config = require('./config.json')
const objkt = require('./src/objkt')
const melos = require('./src/melos')
const contract = require('./src/contract')

const interval = config.rewardInterval.minute + ' ' +
  config.rewardInterval.hour + ' ' +
  config.rewardInterval.dayOfMonth + ' ' +
  config.rewardInterval.month + ' ' +
  config.rewardInterval.dayOfWeek

let objktTask = null
let melosTask = null
let contractTask = null

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

process.on('SIGINT', () => {
  if (objktTask) objktTask.stop()
  if (melosTask) melosTask.stop()
  if (contractTask) contractTask.stop()
})

process.on('uncaughtException', error => {
  console.error(error.message)
})

process.on('unhandledRejection', error => {
  console.error(error)
})
