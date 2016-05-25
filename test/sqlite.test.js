
'use strict'

var Seneca = require('seneca')
var lab = exports.lab = require('lab').script()
var Shared = require('seneca-store-test')
var SenecaSQLiteStore = require('..')
var describe = lab.describe
var si = Seneca(/* {log:'silent'}*/)
var before = lab.before
si.use(SenecaSQLiteStore, {database: './db/senecatest.db'})

if (si.version >= '2.0.0') {
  si.use('entity')
}

describe('sqlite', function () {
  before({}, function (done) {
    si.ready(done)
  })

  Shared.basictest({
    seneca: si,
    script: lab
  })

  Shared.sorttest({
    seneca: si,
    script: lab
  })

  Shared.limitstest({
    seneca: si,
    script: lab
  })
})
