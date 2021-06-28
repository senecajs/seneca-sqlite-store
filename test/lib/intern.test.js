const Assert = require('assert')

const Lab = require('@hapi/lab')
const lab = exports.lab = Lab.script()
const { describe, before, it } = lab

const Code = require('@hapi/code')
const { expect } = Code

const { intern } = require('../../lib/intern')
const { maybeJsonField } = intern

describe('maybeJsonField', () => {
  it('does not treat null as valid JSON', () => {
    const field = 'data'
    const row = { [field]: null }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: false })
  })

  it('handles fields that do not exist in a row', () => {
    const row = { foo: JSON.stringify({}) }
    const field = 'data'

    Assert(!(field in row),
      `This test requires that the row does not contain the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: false })
  })

  it('does not mistakenly assume number literals as valid JSON', () => {
    const field = 'data'
    const row = { [field]: '1.95' }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: false })
  })

  it('does not mistakenly assume boolean literals as valid JSON', () => {
    const field = 'data'
    const row = { [field]: 'true' }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: false })
  })

  it('parses JSON arrays', () => {
    const ary = [1, 2, 3, 4]

    const field = 'data'
    const row = { [field]: JSON.stringify(ary) }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: true, parsed: ary })
  })

  it('parses JSON objects', () => {
    const obj = { foo: 'bar' }

    const field = 'data'
    const row = { [field]: JSON.stringify(obj) }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: true, parsed: obj })
  })

  it("handles a JSON of an object with deeply nested JSON's correctly", () => {
    const obj = { foo: JSON.stringify({ bar: 'baz' }) }

    const field = 'data'
    const row = { [field]: JSON.stringify(obj) }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: true, parsed: obj })
  })

  it("handles a JSON of an object with deeply nested objects correctly", () => {
    const obj = { ary: [1, 2, 3], nested: { foo: 'bar' } }

    const field = 'data'
    const row = { [field]: JSON.stringify(obj) }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: true, parsed: obj })
  })

  it("handles a JSON of an array with deeply nested arrays correctly", () => {
    const ary = [1, 2, 3, [4]]

    const field = 'data'
    const row = { [field]: JSON.stringify(ary) }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: true, parsed: ary })
  })

  it("handles a JSON of an array with deeply nested JSON's correctly", () => {
    const ary = [1, 2, 3, JSON.stringify([4])]

    const field = 'data'
    const row = { [field]: JSON.stringify(ary) }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: true, parsed: ary })
  })

  it('does not assume that all strings in an array are JSON', () => {
    const ary = ['1.23', '3.95', 'true', null]

    const field = 'data'
    const row = { [field]: JSON.stringify(ary) }

    Assert(field in row,
      `This test requires that the row contains the "${field}" field`)

    const result = maybeJsonField(field, row)

    expect(result).to.contain({ isjson: true, parsed: ary })
  })
})

