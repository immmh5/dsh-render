// Unit tests for lib/patchops.mjs — same surface dsh-addons-manager covers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setEnabled, createRow, topLevelRows, isDisabled } from '../lib/patchops.mjs'

const BASE = `- id: mcp-filesystem
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: filesystem
    transport: stdio
    command: npx
    args:
      - '-y'
      - '@modelcontextprotocol/server-filesystem'
      - /tmp
`

test('topLevelRows reads the registered id', () => {
  const rows = topLevelRows(BASE)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'mcp-filesystem')
  // Note: topLevelRows deliberately does NOT return `name` — the row contract
  // is id/start/end/disabled/hasConfig. Names come from host.js's readRowName().
  assert.equal(rows[0].hasConfig, true)
})

test('isDisabled reports the toggle state', () => {
  assert.equal(isDisabled(BASE, 'mcp-filesystem'), false)
  const disabled = BASE.replace('  name:', '  disabled: true\n  name:')
  assert.equal(isDisabled(disabled, 'mcp-filesystem'), true)
})

test('setEnabled adds a disabled mark and flips back', () => {
  const off = setEnabled(BASE, ['mcp-filesystem'], false)
  assert.deepEqual(off.changed, ['mcp-filesystem'])
  assert.equal(isDisabled(off.text, 'mcp-filesystem'), true)
  const on = setEnabled(off.text, ['mcp-filesystem'], true)
  assert.deepEqual(on.changed, ['mcp-filesystem'])
  assert.equal(isDisabled(on.text, 'mcp-filesystem'), false)
})

test('setEnabled is a no-op when already in that state', () => {
  const res = setEnabled(BASE, ['mcp-filesystem'], true)
  assert.deepEqual(res.changed, [])
})

test('createRow adds a stdio server with nested config', () => {
  const next = createRow(BASE, 'mcp-fetch', {
    name: '@deepseek-ai/dsh-mcp-client',
    disabled: false,
    config: { serverName: 'fetch', transport: 'http', url: 'https://example.com/mcp' }
  })
  assert.equal(next.created, true)
  const rows = topLevelRows(next.text)
  const ids = rows.map((r) => r.id)
  assert.ok(ids.includes('mcp-filesystem'))
  assert.ok(ids.includes('mcp-fetch'))
})

test('createRow is idempotent for an existing id', () => {
  const next = createRow(BASE, 'mcp-filesystem', {
    name: '@deepseek-ai/dsh-mcp-client',
    config: { serverName: 'dup' }
  })
  assert.equal(next.created, false)
  const rows = topLevelRows(next.text)
  assert.equal(rows.filter((r) => r.id === 'mcp-filesystem').length, 1)
})
