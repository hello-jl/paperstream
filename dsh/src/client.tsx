import { createElement } from 'react'
import { PaperstreamEditor } from '../../web/src/Editor'
import { registerPaperstream } from './register.mjs'

// The build embeds the CSS emitted from Editor's imports inside the factory.
// It is installed through ctx.effect and removed when the plugin unloads.
declare const __PAPERSTREAM_CSS__: string

export const name = 'paperstream'
export const inject = ['slots', 'layout']

function PaperstreamPanel() {
  return createElement('section', {
    className: 'paperstream-dsh-panel',
    'aria-label': 'Paperstream',
    style: {
      height: '100%', minHeight: 0, minWidth: 0, boxSizing: 'border-box',
      paddingTop: 'var(--dsh-frame-top-clearance, 0px)',
    },
  }, createElement(PaperstreamEditor, { draftKey: 'dsh-paperstream-main' }))
}

function PaperstreamIcon() {
  return createElement('svg', {
    width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true,
  },
  createElement('path', { d: 'M12 8v4M6 16v-4h12v4' }),
  createElement('rect', { x: 8, y: 2, width: 8, height: 6, rx: 1 }),
  createElement('rect', { x: 2, y: 16, width: 8, height: 6, rx: 1 }),
  createElement('rect', { x: 14, y: 16, width: 8, height: 6, rx: 1 }))
}

// Runtime API surface is intentionally confined to register.mjs. Its contract
// is exercised without claiming that a mock is a running DSH installation.
export function apply(ctx: unknown) {
  registerPaperstream(ctx, {
    Panel: PaperstreamPanel, Icon: PaperstreamIcon,
    css: __PAPERSTREAM_CSS__, document,
  })
}
