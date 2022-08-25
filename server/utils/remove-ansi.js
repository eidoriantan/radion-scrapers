
const removeANSI = (string) => {
  if (typeof string !== 'string') throw new Error('Parameter is not a string')

  const regex = /[^ -~][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
  return string.replace(regex, '')
}

module.exports = removeANSI
