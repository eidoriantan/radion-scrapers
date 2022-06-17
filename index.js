
const cron = require('node-cron')

const config = require('./config.json')
const henradio = require('./src/henradio')

const interval = config.rewardInterval.minute + ' ' +
  config.rewardInterval.hour + ' ' +
  config.rewardInterval.dayOfMonth + ' ' +
  config.rewardInterval.month + ' ' +
  config.rewardInterval.dayOfWeek

const task = cron.schedule(interval, async () => {
  await henradio.start(config.henradio)
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
