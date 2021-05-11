
'use strict'

// TODO: add some methods to create the test structure

var Sqlite = require('sqlite3')

var _ = require('lodash')
var Uuid = require('node-uuid')
var error = require('eraro')({package: 'seneca-sqlite-store'})

var name = 'sqlite-store'

var MIN_WAIT = 16
// var MAX_WAIT = 65336;

module.exports = function (options) {
  var desc
  var seneca = this
  var self = this

  options = this.util.deepextend({
    supefast: true
  }, options)

  var store = {
    name: name,

    configure: function (spec, done) {
      self.spec = spec

      var conf = 'string' === typeof (spec) ? null : spec

      if (!conf) {
        conf = {}
        // sqlite:///path/to/database;
        var urlM = /^sqlite:\/\/(.*?)$/.exec(spec)
        conf.database = urlM[1]
      }

      self.connection = new Sqlite.Database(conf.database, function (err) {
        if (err) return done(err)

        self.waitmillis = MIN_WAIT

        seneca.log.debug({tag$: 'init'}, 'db ' + conf.database + ' opened.')
        return done(null, self)
      })
    },

    /** load the first matching entity */
    load: function (args, done) {
      var q = _.clone(args.q)
      var qent = args.qent
      q.limit$ = 1
      var qs = schemastm(qent)

      self.connection.all(qs.text, function (err, results) {
        if (err) {
          return done(err)
        }
        var schema = {}
        results.forEach(function (row) {
          schema[row.name] = row.type.toLowerCase()
        })

        var query = selectstm(qent, q)

        self.connection.get(query.text, query.values, function (err, row) {
          if (err) {
            return done(err)
          }
          if (row) {
            var fent = makeent(qent.make$(row), row, schema)
            seneca.log.debug('load', q, fent, desc)
            return done(null, fent)
          }
          return done(null, null)
        })
      })
    },

    list: function (args, done) {
      var qent = args.qent
      var q = args.q
      var query = selectstm(qent, q)

      var qs = schemastm(qent)
      self.connection.all(qs.text, function (err, results) {
        if (err) {
          return done(err)
        }
        var schema = {}
        results.forEach(function (row) {
          schema[row.name] = row.type.toLowerCase()
        })

        self.connection.all(query.text, query.values, function (err, results) {
          if (err) {
            return done(err)
          }
          else {
            var list = []
            results.forEach(function (row) {
              var resolvedent = qent.make$(row)
              var ent = makeent(resolvedent, row, schema)
              list.push(ent)
            })
            return done(null, list)
          }
        })
      })
    },

    remove: function (args, done) {
      const q = args.q

      if (q.load$ && !q.all$) {
        return store.load(args, (err, out) => {
          if (err) {
            return done(err)
          }

          return completeRemoval(args, err => {
            if (err) {
              return done(err)
            }

            return done(null, out)
          })
        })
      }

      return completeRemoval(args, err => {
        if (err) {
          return done(err)
        }

        return done(null)
      })


      function completeRemoval(args, done) {
        var q = args.q
        var qent = args.qent
        var query = deletestm(qent, q)

        self.connection.run(query.text, query.values, done)

        return
      }
    },

    save: function (args, done) {
      // entity to save
      //
      const ent = args.ent

      function upsertIfRequested(args, done) {
        const ent = args.ent
        const table = tablename(ent)

        /*
        `
          insert into players (id, username, points)
          values ($id, $username, $points)
          on conflict (username)
          do update set
          username = $username,
          points = $points
        `
        */

        // TODO: Tidy up.
        //
        const is_new = !('id' in ent)
        const query_for_save = args.q

        if (is_new && Array.isArray(query_for_save.upsert$)) {
          const entp = makeentp(ent)
          const entp_with_new_id = Object.assign({}, entp, { id: Uuid() })

          const upsert_on = query_for_save.upsert$
            .filter(field => field in entp_with_new_id)

          if (upsert_on.length > 0) {
            // BEGIN - build query for upsert.
            //
            const cols = Object.keys(entp_with_new_id).map(col => escapeStr(col)).join(', ')

            const values = Object.keys(entp_with_new_id).reduce(function (h, field) {
              const placeholder = '$' + field
              h[escapeStr(placeholder)] = escapeStr(entp_with_new_id[field])
              return h
            }, {})

            const values_placeholders = Object.keys(values).join(', ')

            const upsert_on_str = upsert_on
              .map(x => escapeStr(x))
              .join(', ')

            const update_kvs = Object.keys(entp).map(field => {
              const placeholder = '$' + field
              return [escapeStr(field), escapeStr(placeholder)].join(' = ')
            }).join(', ')

            const stm = {
              text:
                `insert into ${escapeStr(table)} (${cols})\n` +
                `values (${values_placeholders})\n` +
                `on conflict (${upsert_on_str})\n` +
                `do update set ${update_kvs}`,

              values
            }
            //
            // END - build query for upsert.

            console.log(entp) // dbg
            console.log(stm.text) // dbg
            console.log(stm.values) // dbg

            const upsert_query = stm

            return self.connection.run(upsert_query.text, upsert_query.values, function (err) {
              if (err) {
                return done(err)
              }

              // TODO: Pass the result entity to the callback.
              //
              // TODO: did_update should not be hardcoded. Make sure the update
              // really did happen successfully.
              //

              return done(null, { did_update: true })
            })
          }
        }

        return done(null, { did_update: false })
      }

      return upsertIfRequested(args, function (err, upsert) {
        if (err) {
          return done(err)
        }

        if (upsert.did_update) {
          // TODO: Pass the result entity to the callback.
          //
          return done()
        }

        const ent_id = ent.id || ent.id$ || Uuid()
        ent.id = ent_id

        return buildschema(ent, function (err, schema) {
          if (err) {
            return done(err)
          }

          // NOTE: We are trying to update the entity first.
          //
          const update_query = updatebyidstm(ent, schema)

          return self.connection.run(update_query.text, update_query.values, function (err) {
            if (err) {
              return done(err)
            }

            const was_updated = this.changes > 0

            if (was_updated) {
              seneca.log.debug('save/update', update_query, desc)

              return loadbyid(ent_id, ent, function (err, out) {
                if (err) {
                  return done(err)
                }

                return done(null, out)
              })
            }

            // NOTE: At this point we know that no entity existed,
            // hence we create a new one.
            //
            const save_query = savestm(ent)

            return self.connection.run(save_query.text, save_query.values, function (err) {
              if (err) {
                return done(err)
              }

              seneca.log.debug('save/insert', save_query, desc)

              return loadbyid(ent_id, ent, function (err, out) {
                if (err) {
                  return done(err)
                }

                return done(null, out)
              })
            })
          })
        })
      })
    },

    close: function (args, done) {
      if (self.connection) {
        self.connection.close(function (err) {
          if (err) {
            return done(err)
          }
          else {
            return done(null, null)
          }
        })
      }

      return done(null, null)
    },

    native: function (args, done) {
      return done(null, self.connection)
    }
  }

  var selectstm = function (qent, q) {
    if (Array.isArray(q) || typeof q === 'string') {
      const idsq = typeof q === 'string' ? [q] : q
      return selectbyids(qent, idsq)
    }

    return selectwhere(qent, q)


    function selectbyids(qent, q) {
      const table = tablename(qent)

      const stm = {
        text: 'SELECT * FROM ' + escapeStr(table) + ' WHERE id IN (' +
          escapeStr(idsstm(q)) + ')',

        values: q
      }

      return stm


      function idsstm(q) {
        return q.map(_ => '?').join(', ')
      }
    }

    function selectwhere(qent, q) {
      const table = tablename(qent)
      const params = []
      const values = {}
      const w = whereargs(makeentp(qent), q)

      let wherestr = ''

      if (!_.isEmpty(w)) {
        for (const param in w) {
          const fieldPlaceholder = '$' + param
          params.push(param + ' = ' + fieldPlaceholder)
          values[fieldPlaceholder] = w[param]
        }

        wherestr = ' WHERE ' + params.join(' AND ')
      }

      const metastr = ' ' + metaquery(qent, q)

      const stm = {
        text: 'SELECT * FROM ' + escapeStr(table) + escapeStr(wherestr) + escapeStr(metastr),
        values: values
      }

      return stm
    }
  }

  var whereargs = function (qent, q) {
    var w = {}

    var qok = fixquery(qent, q)

    for (var p in qok) {
      w[p] = qok[p]
    }

    return w
  }

  var fixquery = function (qent, q) {
    var qq = {}
    for (var qp in q) {
      if (!qp.match(/\$$/)) {
        qq[qp] = q[qp]
      }
    }
    return qq
  }

  var metaquery = function (qent, q, opts = {}) {
    function tryFetchOverrideOrQualifier(qual) {
      const { overrides = {} } = opts

      if (qual in overrides) {
        return overrides[qual]
      }

      if (qual in q) {
        return q[qual]
      }

      return null
    }


    const mq = []


    const sort_by = tryFetchOverrideOrQualifier('sort$')

    if (sort_by !== null) {
      // TODO: Consider sorting by all columns that are specified
      // by the client.
      //

      let sf
      for (sf in sort_by) break

      if (sf) {
        const sd = q.sort$[sf] > 0 ? 'ASC' : 'DESC'
        mq.push('ORDER BY ' + sf + ' ' + sd)
      }
    }


    const limit = tryFetchOverrideOrQualifier('limit$')

    // QUESTION: TODO: Ignore negative limits?
    //
    if (typeof limit === 'number') {
      mq.push(' LIMIT ' + limit)
    }


    const skip = tryFetchOverrideOrQualifier('skip$')

    if (typeof skip === 'number' && skip >= 0) {
      mq.push(' OFFSET ' + skip)
    }


    return mq.join(' ')
  }

  var savestm = function (ent) {
    var stm = {}

    var table = tablename(ent)
    var fields = ent.fields$()
    var entp = makeentp(ent)

    var values = {}
    var params = []

    fields.forEach(function (field) {
      var fieldPlaceholder = '$' + field
      values[fieldPlaceholder] = entp[field]
      params.push(fieldPlaceholder)
    })

    stm.text = 'INSERT INTO ' + escapeStr(table) + ' (' + escapeStr(fields) + ') values (' + escapeStr(params) + ')'
    stm.values = values

    return stm
  }


  var updatebyidstm = function (ent, schema) {
    const stm = {}
    const table = tablename(ent)
    const entp = makeentp(ent)

    const values = {}
    const params = []

    const should_merge = (function () {
      if ('merge$' in ent) {
        return Boolean(ent.merge$)
      }

      if (options && ('merge' in options)) {
        return Boolean(options.merge)
      }

      return true
    })()


    for (const col in schema) {
      if (should_merge && typeof entp[col] === 'undefined') {
        continue
      }

      const fieldPlaceholder = '$' + col

      values[fieldPlaceholder] = col in entp
        ? entp[col]
        : null

      params.push(col + ' = ' + fieldPlaceholder)
    }

    values.$id = ent.id

    stm.text = 'UPDATE ' + escapeStr(table) + ' SET ' + escapeStr(params) + ' WHERE id = $id'
    stm.values = values

    return stm
  }

  var deletestm = function (qent, q) {
    var table = tablename(qent)
    var params = []
    var values = {}
    var w = whereargs(makeentp(qent), q)
    var wherestr = ''

    if (!_.isEmpty(w)) {
      for (var param in w) {
        // params.push(param + ' = ' + self.connection.escape(w[param]));
        var fieldPlaceholder = '$' + param
        params.push(param + ' = ' + fieldPlaceholder)
        values[fieldPlaceholder] = w[param]
      }

      wherestr = ' WHERE ' + params.join(' AND ')
    }


    var stm = {}

    stm.values = values

    stm.text = (() => {
      // TODO: More elaborate testing throughout this closure.
      //

      const metastr = (() => {
        const meta_opts = q.all$
          ? {}
          : { overrides: { limit$: 1 } }

        return metaquery(qent, q, meta_opts)
      })()

      if (metastr) {
        return `
          DELETE FROM ${escapeStr(table)}
          WHERE id IN (
            SELECT id FROM ${escapeStr(table)}
            ${escapeStr(wherestr)}
            ${escapeStr(metastr)}
          )
        `
      }

      return `DELETE FROM ${escapeStr(table)} ${escapeStr(wherestr)}`
    })()

    return stm
  }


  var tablename = function (entity) {
    var canon = entity.canon$({object: true})
    return (canon.base ? canon.base + '_' : '') + canon.name
  }

  var schemastm = function (entity) {
    var table = tablename(entity)
    var query = 'PRAGMA table_info(' + table + ')'
    var stm = {}
    stm.text = query
    stm.values = ''

    return stm
  }

  var buildschema = function (entity, done) {
    const qs = schemastm(entity)

    self.connection.all(qs.text, function (err, rows) {
      if (err) {
        return done(err)
      }

      const schema = {}

      for (const row of rows) {
        schema[row.name] = row.type.toLowerCase()
      }

      return done(null, schema)
    })
  }

  var makeentp = function (ent) {
    var entp = {}
    var fields = ent.fields$()

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

  var makeent = function (ent, row, schema) {
    var entp
    var fields = ent.fields$()

    if (!_.isUndefined(ent) && !_.isUndefined(row)) {
      entp = {}
      fields.forEach(function (field) {
        var isParsable = false
        try {
          JSON.parse(row[field])
          isParsable = true
        }
        catch (e) {
          isParsable = false
        }

        if (!_.isUndefined(row[field])) {
          if (schema[field] === 'timestamp') {
            entp[field] = new Date(JSON.parse(row[field]))
          }
          else if (isParsable) {
            entp[field] = JSON.parse(row[field])
          }
          else {
            entp[field] = row[field]
          }
        }
      })
    }

    return ent.make$(entp)
  }

  var loadbyid = function (ent_id, ent, done) {
    // TODO: The #load method is part of the public interface of the store.
    // As such, it's a bad practice to invoke a public function from a private
    // one. This will do for now, but you may want to reconsider this approach
    // in the future.
    //
    return store.load({ qent: ent, q: { id: ent_id } }, done)
  }

  var storedesc = seneca.store.init(seneca, options, store)
  var tag = storedesc.tag
  desc = storedesc.desc

  seneca.add({init: store.name, tag: tag}, function (args, done) {
    store.configure(options, function (err) {
      if (err) {
        return done(error('cannot-init-db', {database: options.folder, store: desc, error: err}))
      }
      return done()
    })
  })

  return {name: store.name, tag: tag}
}


var escapeStr = function (input) {
  var str = '' + input
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
