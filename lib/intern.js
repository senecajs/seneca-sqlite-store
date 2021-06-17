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


function maybeJsonField(field, row, schema) {
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
  const mayTryParse = mayStoreJson(field, row, schema) &&
    'string' === typeof row[field] && (
      mayBeArrayJson(row[field]) ||
      mayBeObjectJson(row[field])
    )

  if (!mayTryParse) {
    return { isjson: false }
  }

  try {
    const parsed = JSON.parse(row[field])
    return { isjson: true, parsed }
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { isjson: false }
    }

    throw err
  }

  function mayBeArrayJson(s) {
    return /^\s*\[/.test(s)
  }

  function mayBeObjectJson(s) {
    return /^\s*\{/.test(s)
  }
}


function mayStoreJson(field, row, schema) {
  const coltype = schema[field]
  const rowvalue = row[field]

  // QUESTION: What about the BLOB type?
  //
  return /^text$|^varchar\(\d*\)$|^varchar$/.test(coltype) &&
    'string' === typeof rowvalue
}


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


function makeent(ent, row, schema) {
  const entp = {}
  const fields = ent.fields$()

  if (!_.isUndefined(ent) && !_.isUndefined(row)) {
    fields.forEach(function (field) {
      if (!_.isUndefined(row[field])) {
        if (schema[field] === 'timestamp') {
          entp[field] = new Date(JSON.parse(row[field]))
        }
        else {
          const json = maybeJsonField(field, row, schema)

          if (json.isjson) {
            entp[field] = json.parsed
          }
          else {
            entp[field] = row[field]
          }
        }
      }
    })
  }

  return ent.make$(entp)
}


module.exports = {
  intern: {
    ensureId,
    isNew,
    escapeStr,
    maybeJsonField,
    mayStoreJson,
    makeent,
    makeentp
  }
}
