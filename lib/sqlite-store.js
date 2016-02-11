
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
            var fent = makeent(qent, row, schema)
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
      var qent = args.qent
      var q = args.q
      var query = deletestm(qent, q)

      self.connection.run(query.text, query.values, function (err, result) {
        if (err) {
          return done(err)
        }
        else {
          return done(null, result)
        }
      })
    },

    save: function (args, done) {
      // entity to save
      var ent = args.ent

      var update = true
      if (!ent.id) {
        update = false
        if (ent.id$) {
          ent.id = ent.id$
        }
        else {
          ent.id = Uuid()
        }
      }

      var query
      var qlabel = 'update'

      if (update) {
        // id received - execute an update
        query = updatestm(ent)
      }
      else {
        // no id received - execute an insert
        query = savestm(ent)
        qlabel = 'insert'
      }

      self.connection.run(query.text, query.values, function (err, result) {
        if (err) {
          return done(err)
        }
        else {
          seneca.log.debug('save/' + qlabel, query, result, desc)
          return done(null, ent)
        }
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
      return done(null, self.connecation)
    }
  }

  var selectstm = function (qent, q) {
    var stm = {}
    var table = tablename(qent)
    var params = []
    var values = {}
    var w = whereargs(makeentp(qent), q)
    var wherestr = ''

    if (!_.isEmpty(w)) {
      for (var param in w) {
        var fieldPlaceholder = '$' + param
        params.push(param + ' = ' + fieldPlaceholder)
        values[fieldPlaceholder] = w[param]
      }

      wherestr = ' WHERE ' + params.join(' AND ')
    }

    var mq = metaquery(qent, q)
    var metastr = ' ' + mq.join(' ')

    stm.text = 'SELECT * FROM ' + escapeStr(table) + escapeStr(wherestr) + escapeStr(metastr)
    stm.values = values

    return stm
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

  var metaquery = function (qent, q) {
    var mq = []

    if (q.sort$) {
      for (var sf in q.sort$) break
      var sd = q.sort$[sf] < 0 ? 'ASC' : 'DESC'
      mq.push('ORDER BY ' + sf + ' ' + sd)
    }

    if (q.limit$) {
      mq.push('LIMIT ' + q.limit$)
    }

    return mq
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


  var updatestm = function (ent) {
    var stm = {}
    var table = tablename(ent)
    var fields = ent.fields$()
    var entp = makeentp(ent)

    var values = {}
    var params = []

    fields.forEach(function (field) {
      if (!(_.isUndefined(ent[field]) || _.isNull(ent[field]))) {
        var fieldPlaceholder = '$' + field
        values[fieldPlaceholder] = entp[field]
        params.push(field + ' = ' + fieldPlaceholder)
      }
    })

    values.$id = ent.id

    stm.text = 'UPDATE ' + escapeStr(table) + ' SET ' + escapeStr(params) + ' WHERE id = $id'
    stm.values = values

    return stm
  }

  var deletestm = function (qent, q) {
    var stm = {}
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

    var limistr = ''
    if (!q.all$) {
      // Sqlite does not have support for LIMIT in DELETE
      // (unless is explicitly compiled)
      limistr = ''
    }

    stm.text = 'DELETE FROM ' + escapeStr(table) + escapeStr(wherestr) + escapeStr(limistr)
    stm.values = values

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
