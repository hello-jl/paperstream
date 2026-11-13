interface CompositionKey {
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean; keyCode?: number };
}

/** IME confirmation/cancellation keys belong to the candidate window. Some
 * browsers clear isComposing before the final keydown but still report 229.
 * Accept native and React keyboard events so every input uses the same guard.
 */
export function isComposingKey(event: CompositionKey): boolean {
  return Boolean(event.isComposing || event.nativeEvent?.isComposing
    || event.keyCode === 229 || event.nativeEvent?.keyCode === 229);
}
