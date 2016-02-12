
'use strict'

var Seneca = require('seneca')
var lab = exports.lab = require('lab').script()
var Shared = require('seneca-store-test')
var SenecaSQLiteStore = require('..')
var describe = lab.describe
var si = Seneca(/* {log:'silent'}*/)
si.use(SenecaSQLiteStore, {database: './test/db/senecatest.db'})

si.__testcount = 0

describe('sqlite', function () {
  Shared.basictest({
    seneca: si,
    script: lab
  })
})

