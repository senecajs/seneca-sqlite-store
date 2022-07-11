
// TODO: add some methods to create the test structure

const Sqlite = require('sqlite3')
const _ = require('lodash')

import { intern } from './intern'

const {
  ensureId,
  isNew,
  escapeStr,
  maybeJsonField,
  makeent,
  makeentp,
  shouldMerge
} = intern

const name = 'sqlite-store'

const MIN_WAIT = 16
// const MAX_WAIT = 65336;

type SQLiteStoreOptions = {}

const sqlite_store = function sqlite_store(this: any, options: SQLiteStoreOptions) {
  const seneca = this
  const self = this

  let desc

  options = this.util.deepextend({
    supefast: true
  }, options)

  const store = {
    name: name,

    configure: function (this: any, spec: any, done: any) {
      self.spec = spec

      const conf = 'string' === typeof (spec) ? null : spec

      if (!conf) {
        conf = {}
        // sqlite:///path/to/database;
        const urlM = /^sqlite:\/\/(.*?)$/.exec(spec)
        conf.database = urlM[1]
      }

      self.connection = new Sqlite.Database(conf.database, function (err: any) {
        if (err) return done(err)

        self.waitmillis = MIN_WAIT

        seneca.log.debug({tag$: 'init'}, 'db ' + conf.database + ' opened.')
        return done(null, self)
      })
    },

    /** load the first matching entity */
    load: function (this: any, args: any, done: any) {
      const q = _.clone(args.q)
      const qent = args.qent
      q.limit$ = 1
      const qs = schemastm(qent)

      self.connection.all(qs.text, function (err: any, results: any) {
        if (err) {
          return done(err)
        }
        const schema = {}
        results.forEach(function (row: any) {
          schema[row.name] = row.type.toLowerCase()
        })

        const query = selectstm(qent, q)

        self.connection.get(query.text, query.values, function (err: any, row: any) {
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

    list: function (this: any, args: any, done: any) {
      const qent = args.qent
      const q = args.q
      const query = selectstm(qent, q)

      const qs = schemastm(qent)
      self.connection.all(qs.text, function (err: any, results: any) {
        if (err) {
          return done(err)
        }
        const schema = {}
        results.forEach(function (row: any) {
          schema[row.name] = row.type.toLowerCase()
        })

        self.connection.all(query.text, query.values, function (err: any, results: any) {
          if (err) {
            return done(err)
          }
          else {
            const list = []
            results.forEach(function (row: any) {
              const ent = qent.make$(row)
              list.push(ent)
            })
            return done(null, list)
          }
        })
      })
    },

    remove: function (this: any, args: any, done: any) {
      const q = args.q

      if (q.load$ && !q.all$) {
        return store.load(args, (err: any, out: any) => {
          if (err) {
            return done(err)
          }

          return completeRemoval(args, (err: any) => {
            if (err) {
              return done(err)
            }

            return done(null, out)
          })
        })
      }

      return completeRemoval(args, (err: any) => {
        if (err) {
          return done(err)
        }

        return done(null)
      })


      function completeRemoval(this: any, args: any, done: any) {
        const q = args.q
        const qent = args.qent
        const query = deletestm(qent, q)

        self.connection.run(query.text, query.values, done)

        return
      }
    },

    save: function (this: any, args: any, done: any) {
      const ent = seneca.util.deep(args.ent)
      const new_ent_id = ensureId(ent)
      const upsert_fields = isUpsert(args)

      if (isNew(ent) && upsert_fields) {
        return doUpsert(upsert_fields, ent, new_ent_id, done)
      }

      const ent_id = ent.id || new_ent_id
      ent.id = ent_id

      return buildschema(ent, function (err: any, schema: any) {
        if (err) {
          return done(err)
        }

        // NOTE: We are trying to update the entity first.
        //
        const update_query = updatebyidstm(ent, schema)

        return self.connection.run(update_query.text, update_query.values, function (err: any) {
          if (err) {
            return done(err)
          }

          const was_updated = this.changes > 0

          if (was_updated) {
            return finalizeSave(
              'save/update',
              { id: ent_id },
              ent,
              update_query,
              done
            )
          }

          // NOTE: At this point we know that no entity existed,
          // hence we create a new one.
          //
          const save_query = savestm(ent)

          return self.connection.run(save_query.text, save_query.values, function (err: any) {
            if (err) {
              return done(err)
            }

            return finalizeSave(
              'save/insert',
              { id: ent_id },
              ent,
              save_query,
              done
            )
          })
        })
      })

      function isUpsert(args: any) {
        if (!Array.isArray(args.q.upsert$)) {
          return null
        }

        const upsert_fields = args.q.upsert$.filter((p) => !p.includes('$'))
        const public_entdata = args.ent.data$(false)

        const isUpsert =
          upsert_fields.length > 0 &&
          upsert_fields.every((p) => p in public_entdata)

        return isUpsert ? upsert_fields : null
      }

      function doUpsert(upsert_fields: any, ent: any, new_ent_id: any, done: any) {
        const upsert_query = upsertstm(ent, new_ent_id, upsert_fields)

        return self.connection.run(upsert_query.text, upsert_query.values, function (err: any) {
          if (err) {
            return done(err)
          }

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
          const query_for_ent = upsert_fields.reduce(function (h: any, field: any) {
            h[field] = ent[field]

            return h
          }, {})


          return finalizeSave(
            'save/upsert',
            query_for_ent,
            ent,
            upsert_query,
            done
          )
        })
      }

      function finalizeSave(operation_name: any, q: any, ent: any, query: any, done: any) {
        seneca.log.debug(operation_name, query, desc)

        // TODO: The #load method is part of the public interface of the store.
        // As such, it's a bad practice to invoke a public function from a private
        // one. This will do for now, but you may want to reconsider this approach
        // in the future.
        //
        return store.load({ q, qent: ent}, done)
      }
    },

    close: function (this: any, args: any, done: any) {
      if (self.connection) {
        self.connection.close(function (err: any) {
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

    native: function (this: any, args: any, done: any) {
      return done(null, self.connection)
    }
  }

  function selectstm (qent: any, q: any) {
    if (Array.isArray(q) || typeof q === 'string') {
      const idsq = typeof q === 'string' ? [q] : q
      return selectbyids(qent, idsq)
    }

    return selectwhere(qent, q)


    function selectbyids(qent: any, q: any) {
      const table = tablename(qent)

      const stm = {
        text: 'SELECT * FROM ' + escapeStr(table) + ' WHERE id IN (' +
          escapeStr(idsstm(q)) + ')',

        values: q
      }

      return stm


      function idsstm(q: any) {
        return q.map(_ => '?').join(', ')
      }
    }

    function selectwhere(qent: any, q: any) {
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

  function whereargs(qent: any, q: any) {
    const w = {}
    const qok = fixquery(qent, q)

    for (const p in qok) {
      w[p] = qok[p]
    }

    return w
  }

  function fixquery(qent: any, q: any) {
    const qq = {}

    for (const qp in q) {
      if (!qp.match(/\$$/)) {
        qq[qp] = q[qp]
      }
    }

    return qq
  }

  function metaquery(qent: any, q: any, opts = {}) {
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

    if (typeof limit === 'number') {
      mq.push(' LIMIT ' + limit)
    }


    const skip = tryFetchOverrideOrQualifier('skip$')

    if (typeof skip === 'number' && skip >= 0) {
      mq.push(' OFFSET ' + skip)
    }


    return mq.join(' ')
  }

  function savestm(ent: any) {
    const stm = {}

    const table = tablename(ent)
    const fields = ent.fields$()
    const entp = makeentp(ent)

    const values = {}
    const params = []

    fields.forEach(function (field: any) {
      const fieldPlaceholder = '$' + field

      values[fieldPlaceholder] = entp[field]
      params.push(fieldPlaceholder)
    })

    stm.text = 'INSERT INTO ' + escapeStr(table) + ' (' + escapeStr(fields) +
      ') values (' + escapeStr(params) + ')'

    stm.values = values

    return stm
  }


  function updatebyidstm(ent: any, schema: any) {
    const stm = {}
    const table = tablename(ent)
    const entp = makeentp(ent)

    const values = {}
    const params = []


    for (const col in schema) {
      if (shouldMerge(ent, options) && typeof entp[col] === 'undefined') {
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

  function upsertstm(ent: any, new_id: any, upsert_fields: any) {
    const table = tablename(ent)
    const entp = makeentp(ent)
    const entp_with_new_id = Object.assign({}, entp, { id: new_id })


    const cols = Object.keys(entp_with_new_id)
      .map(col => escapeStr(col)).join(', ')

    const values = Object.keys(entp_with_new_id).reduce(function (h: any, field: any) {
      const placeholder = '$' + field


      const unsafe_value = entp_with_new_id[field]

      const safe_value = typeof unsafe_value === 'string'
        ? escapeStr(unsafe_value)
        : unsafe_value


      h[escapeStr(placeholder)] = safe_value
      return h
    }, {})

    const values_placeholders = Object.keys(values).join(', ')

    const upsert_on_str = upsert_fields
      .map(x => escapeStr(x))
      .join(', ')


    const kvs = upsert_fields.includes('id')
      ? entp_with_new_id
      : entp

    const update_kvs = Object.keys(kvs).map((field: any) => {
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

    return stm
  }

  function deletestm (this: any, qent: any, q: any) {
    const table = tablename(qent)
    const params = []
    const values = {}
    const w = whereargs(makeentp(qent), q)

    let wherestr = ''

    if (!_.isEmpty(w)) {
      for (var param in w) {
        const fieldPlaceholder = '$' + param
        params.push(param + ' = ' + fieldPlaceholder)
        values[fieldPlaceholder] = w[param]
      }

      wherestr = ' WHERE ' + params.join(' AND ')
    }


    const stm = {}

    stm.values = values

    // TODO: More elaborate testing.
    //

    const meta_opts = q.all$
      ? {}
      : { overrides: { limit$: 1 } }

    const metastr = metaquery(qent, q, meta_opts)

    if (metastr) {
      stm.text = `
        DELETE FROM ${escapeStr(table)}
        WHERE id IN (
          SELECT id FROM ${escapeStr(table)}
          ${escapeStr(wherestr)}
          ${escapeStr(metastr)}
        )
      `
    } else {
      stm.text = `DELETE FROM ${escapeStr(table)} ${escapeStr(wherestr)}`
    }

    return stm
  }

  function tablename(entity: any) {
    const canon = entity.canon$({object: true})
    return (canon.base ? canon.base + '_' : '') + canon.name
  }

  function schemastm(entity: any) {
    const table = tablename(entity)
    const query = 'PRAGMA table_info(' + table + ')'

    return { text: query, values: '' }
  }

  function buildschema(entity: any, done: any) {
    const qs = schemastm(entity)

    self.connection.all(qs.text, function (err: any, rows: any) {
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

  const meta = seneca.store.init(seneca, options, store)
  desc = meta.desc

  seneca.add({init: store.name, tag: meta.tag}, function (args: any, done: any) {
    store.configure(options, function (err: any) {
      if (err) {
        return done(seneca.error('cannot-init-db', {
          database: options.folder,
          store: desc,
          error: err
        }))
      }

      return done()
    })
  })

  return {name: store.name, tag: meta.tag}
}


Object.assign(sqlite_store, {errors: { 'cannot-init-db': 'Cannot connect to the database.' }})

export sqlite_store

if( typeof(module) !== 'undefined'){
  module.exports = sqlite_store
}
