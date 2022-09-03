
const cron = require('node-cron')

const config = require('../config.json')
const opensea = require('../src/opensea')

const interval = config.interval.minute + ' ' +
  config.interval.hour + ' ' +
  config.interval.dayOfMonth + ' ' +
  config.interval.month + ' ' +
  config.interval.dayOfWeek

const task = cron.schedule(interval, async () => {
  return await opensea.start(config.opensea)
})

process.on('SIGINT', () => {
  task.stop()
})

process.on('uncaughtException', error => {
  console.error(error.message)
})

process.on('unhandledRejection', error => {
  console.error(error)
})
