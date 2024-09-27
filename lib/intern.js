const _ = require('lodash')
const Uuid = require('node-uuid')


function ensureId(ent) {
  if (undefined !== ent.id$) {
    return ent.id$
  }

  return Uuid()
}


function isNew(ent) {
  return !('id' in ent)
}


function escapeStr(input) {
  const str = '' + input

  return str.replace(/[\0\b\t\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
    switch (char) {
      case '\0':
        return '\\0'
      case '\x08':
        return '\\b'
      case '\b':
        return '\\b'
      case '\x09':
        return '\\t'
      case '\t':
        return '\\t'
      case '\x1a':
        return '\\z'
      case '\n':
        return '\\n'
      case '\r':
        return '\\r'
      case '\"':
      case "'":
      case '\\':
      case '%':
        return '\\' + char
    }
  })
}


function maybeJsonField(field, row) {
  const mayTryParse = 'string' === typeof row[field]

  if (!mayTryParse) {
    return { isjson: false }
  }

  try {
    const parsed = JSON.parse(row[field])

    if (_.isObject(parsed)) {
      /* NOTE:
      Source: https://www.json.org/json-en.html

      > JSON is built on two structures:
      >
      > A collection of name/value pairs. In various languages, this is realized
      > as an object, record, struct, dictionary, hash table, keyed list, or
      > associative array.
      > 
      > An ordered list of values. In most languages, this is realized as an
      > array, vector, list, or sequence.
      */
      return { isjson: true, parsed }
    }

    return { isjson: false }
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { isjson: false }
    }

    throw err
  }
}


// NOTE: This function is invoked before saving an entity to the db.
//
function makeentp(ent) {
  const entp = {}
  const fields = ent.fields$()

  fields.forEach(function (field) {
    if (!_.isDate(ent[field]) && _.isObject(ent[field])) {
      entp[field] = JSON.stringify(ent[field])
    }
    else {
      entp[field] = ent[field]
    }
  })

  return entp
}


// NOTE: This function is invoked to "load" an entity from a row.
//
function makeent(ent, row, schema) {
  const entp = {}
  const fields = ent.fields$()

  fields.forEach(function (field) {
    const json = maybeJsonField(field, row)

    if (json.isjson) {
      entp[field] = json.parsed
    }
    else {
      entp[field] = row[field]
    }
  })

  return ent.make$(entp)
}


function shouldMerge(ent, options = null) {
  if ('merge$' in ent) {
    return Boolean(ent.merge$)
  }

  if (options && ('merge' in options)) {
    return Boolean(options.merge)
  }

  return true
}


function escapeIdentifier(s) {
  return '"' + s + '"'
}


module.exports = {
  intern: {
    ensureId,
    isNew,
    escapeStr,
    escapeIdentifier,
    maybeJsonField,
    makeent,
    makeentp,
    shouldMerge
  }
}
