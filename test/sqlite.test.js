
'use strict'

const Seneca = require('seneca')
const lab = exports.lab = require('@hapi/lab').script()
const { describe, before } = lab
const Shared = require('seneca-store-test')
const SenecaSQLiteStore = require('..')

function makeSenecaForTest(opts = {}) {
  const seneca = Seneca({ log: 'test' })

  if (seneca.version >= '2.0.0') {
    seneca.use('entity')
  }


  const { sqlite_store_opts = {} } = opts

  seneca.use(SenecaSQLiteStore, {
    database: './test/support/db/senecatest.db',
    ...sqlite_store_opts
  })


  return seneca
}

describe('shared tests', function () {
  const seneca = makeSenecaForTest()

  before(() => new Promise((resolve, _reject) => {
    seneca.ready(resolve)
  }))

  Shared.basictest({
    seneca,
    script: lab,
    senecaMerge: makeSenecaForTest({
      sqlite_store_opts: { merge: false }
    })
  })

  Shared.sorttest({
    seneca,
    script: lab
  })

  Shared.limitstest({
    seneca,
    script: lab
  })

  Shared.upserttest({
    seneca,
    script: lab
  })
})

