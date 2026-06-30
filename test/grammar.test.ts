import { describe, it, expect } from 'vitest'
import { classifyLine } from '../src/core/markers/grammar'

describe('classifyLine — comment markers across languages', () => {
  it('parses a system marker (// comment)', () => {
    expect(classifyLine('//@topo system Api')).toEqual({ type: 'system', kind: 'system', name: 'Api', parent: null })
  })
  it('parses an activity with a parent (// trailing on code)', () => {
    expect(classifyLine('export function route() {} //@topo activity Router parent=Api')).toEqual({
      type: 'system',
      kind: 'activity',
      name: 'Router',
      parent: 'Api',
    })
  })
  it('parses a # comment (python/shell)', () => {
    expect(classifyLine('#@topo storage Db parent=Data')).toEqual({ type: 'system', kind: 'storage', name: 'Db', parent: 'Data' })
  })
  it('parses a -- comment (sql) boundary', () => {
    expect(classifyLine('--@topo holds Record')).toEqual({ type: 'boundary', dir: 'holds', thing: 'Record' })
  })
  it('strips a block-comment closer', () => {
    expect(classifyLine('/*@topo out Listing */')).toEqual({ type: 'boundary', dir: 'out', thing: 'Listing' })
    expect(classifyLine('<!--@topo in Request -->')).toEqual({ type: 'boundary', dir: 'in', thing: 'Request' })
  })
  it('accepts kind= and open aliases', () => {
    expect(classifyLine('//@topo system Store kind=storage')).toMatchObject({ kind: 'storage' })
    expect(classifyLine('//@topo activity Box open')).toMatchObject({ kind: 'system' })
  })
  it('ignores non-markers and @topology false-friends', () => {
    expect(classifyLine('const x = 1')).toBeNull()
    expect(classifyLine('// @topology is a different word')).toBeNull()
    expect(classifyLine('//@topo wat unknown')).toBeNull()
  })
})
