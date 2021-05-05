
'use strict'

var Seneca = require('seneca')
var lab = exports.lab = require('@hapi/lab').script()
var { describe, before } = lab
var Shared = require('seneca-store-test')
var SenecaSQLiteStore = require('..')

describe('sqlite', function () {
  var si = Seneca(/* {log:'silent'}*/)
  si.use('entity')
  si.use(SenecaSQLiteStore, {database: './test/db/senecatest.db'})

  before(() => new Promise((resolve, _reject) => {
    si.ready(resolve)
  }))

  describe('basic tests', () => {
    Shared.basictest({
      seneca: si,
      script: lab
    })
  })

  describe('sort tests', () => {
    Shared.sorttest({
      seneca: si,
      script: lab
    })
  })

  describe('limits tests', () => {
    Shared.limitstest({
      seneca: si,
      script: lab
    })
  })
})

