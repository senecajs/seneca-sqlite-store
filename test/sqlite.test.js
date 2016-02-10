
'use strict'

var Seneca = require('seneca')
var lab = exports.lab = require('lab').script()
var Shared = require('seneca-store-test')
var SenecaSQLiteStore = require('..')
var describe = lab.describe
var it = lab.it
var si = Seneca(/* {log:'silent'}*/)
si.use(SenecaSQLiteStore, {database: './test/db/senecatest.db'})

si.__testcount = 0
var testcount = 0

describe('sqlite', function () {
  it('basic', function (done) {
    testcount++
    Shared.basictest(si, done)
  })

  it('extra', function (done) {
    testcount++
    extratest(si, done)
  })

  it('close', function (done) {
    Shared.closetest(si, testcount, done)
  })
})

function extratest (si, done) {
  console.log('EXTRA')
  si.__testcount++
  return done()
}
