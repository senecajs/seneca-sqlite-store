
'use strict'

var Seneca = require('seneca')
var lab = exports.lab = require('lab').script()
var Shared = require('seneca-store-test')
var SenecaSQLiteStore = require('..')
var describe = lab.describe
var si = Seneca(/* {log:'silent'}*/)
si.use(SenecaSQLiteStore, {database: './test/db/senecatest.db'})


describe('sqlite', function () {
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
