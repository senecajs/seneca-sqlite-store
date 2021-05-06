
'use strict'

var Seneca = require('seneca')
var lab = exports.lab = require('@hapi/lab').script()
var { describe, before } = lab
var Shared = require('seneca-store-test')
var SenecaSQLiteStore = require('..')

function makeSenecaForTest(opts = {}) {
  const seneca = Seneca(/* {log:'silent'}*/)

  seneca.use('entity')


  const { sqlite_store_opts = {} } = opts

  console.log(sqlite_store_opts) // dbg

  seneca.use(SenecaSQLiteStore, {
    database: './test/db/senecatest.db',
    ...sqlite_store_opts
  })


  return seneca
}

describe('sqlite', function () {
  const seneca = makeSenecaForTest()

  before(() => new Promise((resolve, _reject) => {
    seneca.ready(resolve)
  }))

  describe('basic tests', () => {
    Shared.basictest({
      seneca,
      script: lab,
      senecaMerge: makeSenecaForTest({
        sqlite_store_opts: { merge: false }
      })
    })
  })

  describe('sort tests', () => {
    Shared.sorttest({
      seneca,
      script: lab
    })
  })

  describe('limits tests', () => {
    Shared.limitstest({
      seneca,
      script: lab
    })
  })
})

