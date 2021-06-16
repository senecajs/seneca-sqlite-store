
'use strict'

// TODO: add some methods to create the test structure

const Sqlite = require('sqlite3')
const _ = require('lodash')

const { intern } = require('./intern')

const {
  ensure_id,
  is_new,
  escape_str,
  maybejsonfield,
  makeent,
  makeentp
} = intern

const error = require('eraro')({package: 'seneca-sqlite-store'})

const name = 'sqlite-store'

const MIN_WAIT = 16
// const MAX_WAIT = 65336;

module.exports = function (options) {
  let desc
  const seneca = this
  const self = this

  options = this.util.deepextend({
    supefast: true
  }, options)

  const store = {
    name: name,

    configure: function (spec, done) {
      self.spec = spec

      const conf = 'string' === typeof (spec) ? null : spec

      if (!conf) {
        conf = {}
        // sqlite:///path/to/database;
        const urlM = /^sqlite:\/\/(.*?)$/.exec(spec)
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
      const q = _.clone(args.q)
      const qent = args.qent
      q.limit$ = 1
      const qs = schemastm(qent)

      self.connection.all(qs.text, function (err, results) {
        if (err) {
          return done(err)
        }
        const schema = {}
        results.forEach(function (row) {
          schema[row.name] = row.type.toLowerCase()
        })

        const query = selectstm(qent, q)

        self.connection.get(query.text, query.values, function (err, row) {
          if (err) {
            return done(err)
          }
          if (row) {
            const fent = makeent(qent.make$(row), row, schema)
            seneca.log.debug('load', q, fent, desc)
            return done(null, fent)
          }
          return done(null, null)
        })
      })
    },

    list: function (args, done) {
      const qent = args.qent
      const q = args.q
      const query = selectstm(qent, q)

      const qs = schemastm(qent)
      self.connection.all(qs.text, function (err, results) {
        if (err) {
          return done(err)
        }
        const schema = {}
        results.forEach(function (row) {
          schema[row.name] = row.type.toLowerCase()
        })

        self.connection.all(query.text, query.values, function (err, results) {
          if (err) {
            return done(err)
          }
          else {
            const list = []
            results.forEach(function (row) {
              const ent = qent.make$(row)
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
        const q = args.q
        const qent = args.qent
        const query = deletestm(qent, q)

        self.connection.run(query.text, query.values, done)

        return
      }
    },

    save: function (args, done) {
      const ent = args.ent
      const new_ent_id = ensure_id(ent)
      const upsert_fields = is_upsert(args)

      if (is_new(ent) && upsert_fields) {
        return do_upsert(upsert_fields, ent, new_ent_id, done)
      }

      const ent_id = ent.id || new_ent_id
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

      function is_upsert(args) {
        if (!Array.isArray(args.q.upsert$)) {
          return null
        }

        const upsert_fields = args.q.upsert$.filter((p) => !p.includes('$'))
        const public_entdata = args.ent.data$(false)

        const is_upsert =
          upsert_fields.length > 0 &&
          upsert_fields.every((p) => p in public_entdata)

        return is_upsert ? upsert_fields : null
      }

      function do_upsert(upsert_fields, ent, new_ent_id, done) {
        const upsert_query = upsertstm(ent, new_ent_id, upsert_fields)

        return self.connection.run(upsert_query.text, upsert_query.values, function (err) {
          if (err) {
            return done(err)
          }

          seneca.log.debug('save/upsert', upsert_query, desc)

          // NOTE: WARNING: Since we do not use auto_increment ids,
          // this.lastID does NOT point to the correct id.
          //
          // Source:
          // https://dba.stackexchange.com/questions/118286/last-insert-id-without-auto-increment
          //
          // - but neither does the new_ent_id argument, if an update
          // occurred instead of an insertion.
          //
          // Since valid columns in upsert$ are unique by definition, we
          // may use them to fetch the row.
          //
          const query_for_ent = upsert_fields.reduce(function (h, field) {
            h[field] = ent[field]

            return h
          }, {})

          // TODO: The #load method is part of the public interface of the store.
          // As such, it's a bad practice to invoke a public function from a private
          // one. This will do for now, but you may want to reconsider this approach
          // in the future.
          //
          return store.load({ qent: ent, q: query_for_ent }, done)
        })
      }

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

  function selectstm (qent, q) {
    if (Array.isArray(q) || typeof q === 'string') {
      const idsq = typeof q === 'string' ? [q] : q
      return selectbyids(qent, idsq)
    }

    return selectwhere(qent, q)


    function selectbyids(qent, q) {
      const table = tablename(qent)

      const stm = {
        text: 'SELECT * FROM ' + escape_str(table) + ' WHERE id IN (' +
          escape_str(idsstm(q)) + ')',

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
        text: 'SELECT * FROM ' + escape_str(table) + escape_str(wherestr) + escape_str(metastr),
        values: values
      }

      return stm
    }
  }

  function whereargs(qent, q) {
    const w = {}
    const qok = fixquery(qent, q)

    for (const p in qok) {
      w[p] = qok[p]
    }

    return w
  }

  function fixquery(qent, q) {
    const qq = {}

    for (const qp in q) {
      if (!qp.match(/\$$/)) {
        qq[qp] = q[qp]
      }
    }

    return qq
  }

  function metaquery(qent, q, opts = {}) {
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

  function savestm(ent) {
    const stm = {}

    const table = tablename(ent)
    const fields = ent.fields$()
    const entp = makeentp(ent)

    const values = {}
    const params = []

    fields.forEach(function (field) {
      const fieldPlaceholder = '$' + field

      values[fieldPlaceholder] = entp[field]
      params.push(fieldPlaceholder)
    })

    stm.text = 'INSERT INTO ' + escape_str(table) + ' (' + escape_str(fields) + ') values (' + escape_str(params) + ')'
    stm.values = values

    return stm
  }


  function updatebyidstm(ent, schema) {
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

    stm.text = 'UPDATE ' + escape_str(table) + ' SET ' + escape_str(params) + ' WHERE id = $id'
    stm.values = values

    return stm
  }

  function upsertstm(ent, new_id, upsert_fields) {
    const table = tablename(ent)
    const entp = makeentp(ent)
    const entp_with_new_id = Object.assign({}, entp, { id: new_id })


    // TODO: Tidy up.
    //
    const cols = Object.keys(entp_with_new_id).map(col => escape_str(col)).join(', ')

    const values = Object.keys(entp_with_new_id).reduce(function (h, field) {
      const placeholder = '$' + field

      const safe_value = (function () {
        const unsafe_value = entp_with_new_id[field]

        return typeof unsafe_value === 'string'
          ? escape_str(unsafe_value)
          : unsafe_value
      })()

      h[escape_str(placeholder)] = safe_value
      return h
    }, {})

    const values_placeholders = Object.keys(values).join(', ')

    const upsert_on_str = upsert_fields
      .map(x => escape_str(x))
      .join(', ')

    const update_kvs = (function () {
      const kvs = upsert_fields.includes('id')
        ? entp_with_new_id
        : entp

      return Object.keys(kvs).map(field => {
        const placeholder = '$' + field
        return [escape_str(field), escape_str(placeholder)].join(' = ')
      }).join(', ')
    })()

    const stm = {
      text:
        `insert into ${escape_str(table)} (${cols})\n` +
        `values (${values_placeholders})\n` +
        `on conflict (${upsert_on_str})\n` +
        `do update set ${update_kvs}`,

      values
    }

    return stm
  }


  function deletestm (qent, q) {
    const table = tablename(qent)
    const params = []
    const values = {}
    const w = whereargs(makeentp(qent), q)

    let wherestr = ''

    if (!_.isEmpty(w)) {
      for (var param in w) {
        // params.push(param + ' = ' + self.connection.escape(w[param]));
        const fieldPlaceholder = '$' + param
        params.push(param + ' = ' + fieldPlaceholder)
        values[fieldPlaceholder] = w[param]
      }

      wherestr = ' WHERE ' + params.join(' AND ')
    }


    const stm = {}

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
          DELETE FROM ${escape_str(table)}
          WHERE id IN (
            SELECT id FROM ${escape_str(table)}
            ${escape_str(wherestr)}
            ${escape_str(metastr)}
          )
        `
      }

      return `DELETE FROM ${escape_str(table)} ${escape_str(wherestr)}`
    })()

    return stm
  }


  function tablename(entity) {
    const canon = entity.canon$({object: true})
    return (canon.base ? canon.base + '_' : '') + canon.name
  }

  function schemastm(entity) {
    const table = tablename(entity)
    const query = 'PRAGMA table_info(' + table + ')'

    return { text: query, values: '' }
  }

  function buildschema(entity, done) {
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

  function loadbyid(ent_id, ent, done) {
    // TODO: The #load method is part of the public interface of the store.
    // As such, it's a bad practice to invoke a public function from a private
    // one. This will do for now, but you may want to reconsider this approach
    // in the future.
    //
    return store.load({ qent: ent, q: { id: ent_id } }, done)
  }

  const meta = seneca.store.init(seneca, options, store)
  desc = meta.desc

  seneca.add({init: store.name, tag: meta.tag}, function (args, done) {
    store.configure(options, function (err) {
      if (err) {
        return done(error('cannot-init-db', {database: options.folder, store: desc, error: err}))
      }
      return done()
    })
  })

  return {name: store.name, tag: meta.tag}
}

