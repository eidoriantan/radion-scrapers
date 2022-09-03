
const cron = require('node-cron')

const config = require('../config.json')
const soundxyz = require('../src/soundxyz')

const interval = config.interval.minute + ' ' +
  config.interval.hour + ' ' +
  config.interval.dayOfMonth + ' ' +
  config.interval.month + ' ' +
  config.interval.dayOfWeek

const task = cron.schedule(interval, async () => {
  return await soundxyz.start(config.soundxyzsoundxyz)
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
