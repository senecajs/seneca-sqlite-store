const Uuid = require('node-uuid')


function ensure_id(ent) {
  if (undefined !== ent.id$) {
    return ent.id$
  }

  return Uuid()
}


function is_new(ent) {
  return !('id' in ent)
}


module.exports = {
  intern: { ensure_id, is_new }
}
