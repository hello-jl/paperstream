// Public contracts checked against DSH 0.2.2-rc.1 source on 2026-11-05.
// See README.md for the exact upstream registration and lifecycle references.
export const PANEL_ID = 'paperstream'
export const PLUGIN_ID = 'dsh-paperstream'

/** Register the editor without importing a second DSH or React runtime. */
export function registerPaperstream(ctx, { Panel, Icon, css, document }) {
  if (
    typeof ctx?.effect !== 'function' ||
    typeof ctx?.slots?.inject !== 'function' ||
    typeof ctx?.slots?.register !== 'function' ||
    typeof ctx?.layout?.selectPanel !== 'function' ||
    typeof ctx?.layout?.panelInfo?.getSnapshot !== 'function'
  ) {
    throw new Error('Paperstream requires the DSH main-panel and sidebar slot APIs described in dsh/README.md.')
  }

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = PLUGIN_ID
    style.dataset.pluginCss = `${PLUGIN_ID}/editor.css`
    style.textContent = css
    document.head.appendChild(style)
    return () => style.remove()
  }, 'paperstream: editor styles')

  ctx.effect(() => {
    const dispose = ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main', key: PANEL_ID,
    }, Panel))
    return () => {
      // Leave the panel before removing its keyed renderer. This avoids a
      // selected-but-missing page when the plugin is disabled or replaced.
      if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) {
        ctx.layout.selectPanel(null)
      }
      return dispose()
    }
  }, 'paperstream: main panel')

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 50, label: 'Paperstream',
  }, Icon)), 'paperstream: sidebar entry')
}
