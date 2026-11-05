import test from 'node:test'
import assert from 'node:assert/strict'
import { registerPaperstream, PANEL_ID, PLUGIN_ID } from '../src/register.mjs'

// This fixture exercises the public lifecycle contract; it deliberately does
// not imitate DSH's renderer, RPC, or complete plugin loader.
function makeHarness(initialSlots = ['main', 'sidebar.panellist']) {
  const effects = []
  const slots = new Set(initialSlots)
  const waiting = new Map()
  const entries = new Map()
  const events = []
  const styles = []
  let selected = null
  const document = {
    createElement(tag) {
      assert.equal(tag, 'style')
      const style = {
        dataset: {}, textContent: '',
        remove() {
          const index = styles.indexOf(style)
          if (index >= 0) styles.splice(index, 1)
        },
      }
      return style
    },
    head: { appendChild(style) { styles.push(style) } },
  }
  const ctx = {
    effect(callback) { effects.push(callback()) },
    slots: {
      inject(slot, callback) {
        let remove
        let disposed = false
        const activate = () => {
          if (!disposed && !remove) remove = callback()
        }
        const pending = waiting.get(slot) ?? new Set()
        pending.add(activate)
        waiting.set(slot, pending)
        if (slots.has(slot)) activate()
        return () => {
          disposed = true
          pending.delete(activate)
          remove?.()
        }
      },
      register(options, Component) {
        assert.ok(slots.has(options.name), 'register only after owner declares a slot')
        const key = `${options.name}:${options.key ?? options.id}`
        assert.ok(!entries.has(key), `duplicate registration ${key}`)
        entries.set(key, { options, Component })
        return () => {
          if (options.name === 'main') {
            assert.notEqual(selected, options.key, 'leave a selected panel before removing its renderer')
          }
          entries.delete(key)
          events.push(`removed:${key}`)
        }
      },
    },
    layout: {
      panelInfo: { getSnapshot: () => ({ activePanelId: selected }) },
      selectPanel(id) {
        if (id !== null) assert.ok(entries.has(`main:${id}`))
        selected = id
        events.push(`selected:${id}`)
      },
    },
  }
  return {
    ctx, document, styles, entries, events,
    selected: () => selected,
    declare(slot) {
      slots.add(slot)
      for (const activate of waiting.get(slot) ?? []) activate()
    },
    dispose() {
      for (const dispose of effects.splice(0).reverse()) dispose?.()
    },
  }
}

const Panel = () => null
const Icon = () => null
function mount(harness) {
  registerPaperstream(harness.ctx, {
    Panel, Icon, css: '.paperstream-editor { height: 100%; }',
    document: harness.document,
  })
}

test('the sidebar entry opens its matching main panel and unloading leaves a valid page', () => {
  const harness = makeHarness()
  mount(harness)
  const entry = harness.entries.get(`sidebar.panellist:${PANEL_ID}`)
  harness.ctx.layout.selectPanel(entry.options.id)
  assert.equal(harness.entries.get(`main:${PANEL_ID}`).Component, Panel)
  harness.dispose()
  assert.equal(harness.selected(), null)
  assert.equal(harness.entries.size, 0)
  assert.equal(harness.styles.length, 0)
})

test('unloading an inactive plugin preserves the existing page and unrelated styles', () => {
  const harness = makeHarness()
  const unrelatedStyle = harness.document.createElement('style')
  harness.document.head.appendChild(unrelatedStyle)
  harness.ctx.slots.register({ name: 'main', key: 'other' }, () => null)
  harness.ctx.layout.selectPanel('other')
  mount(harness)
  assert.equal(harness.styles[1].dataset.plugin, PLUGIN_ID)
  harness.dispose()
  assert.equal(harness.selected(), 'other')
  assert.deepEqual(harness.styles, [unrelatedStyle])
  assert.equal(harness.entries.size, 1)
})

test('registration tolerates slot owners arriving later during client boot', () => {
  const harness = makeHarness([])
  mount(harness)
  assert.equal(harness.entries.size, 0)
  harness.declare('main')
  harness.declare('sidebar.panellist')
  assert.equal(harness.entries.size, 2)
  harness.dispose()
  assert.equal(harness.entries.size, 0)
})

test('disabled plugins do not register when their slot owners arrive later', () => {
  const harness = makeHarness([])
  mount(harness)
  harness.dispose()
  harness.declare('main')
  harness.declare('sidebar.panellist')
  assert.equal(harness.entries.size, 0)
  assert.equal(harness.styles.length, 0)
})

test('an incompatible host fails before modifying its document', () => {
  const harness = makeHarness()
  delete harness.ctx.layout
  assert.throws(() => mount(harness), /requires the DSH main-panel/)
  assert.equal(harness.entries.size, 0)
  assert.equal(harness.styles.length, 0)
})
