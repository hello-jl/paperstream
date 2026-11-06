import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface InlineTextEditorProps {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  onFinish: () => void;
}

/** Values are written immediately; finishing only closes the input. */
export function InlineTextEditor({ label, value, multiline = false, onChange, onFinish }: InlineTextEditorProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);
  function submit() { onFinish(); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); onFinish(); }
    if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault(); submit();
    }
  }
  return <div className="ps-inline-editor nodrag nopan" onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <textarea ref={input} aria-label={label} rows={1} value={value}
      onChange={event => onChange(event.target.value)} onKeyDown={keyDown} onBlur={onFinish} />
  </div>;
}
