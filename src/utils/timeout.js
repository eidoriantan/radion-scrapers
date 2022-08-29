
const noop = () => {}
module.exports = async (timeout, callback = noop) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      callback()
      const error = new Error('Timed out')
      reject(error)
    }, timeout)
  })
}
