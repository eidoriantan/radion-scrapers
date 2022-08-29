
const noop = () => {}
module.exports = async (timeout, callback = noop) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      callback()
      resolve(null)
    }, timeout)
  })
}
