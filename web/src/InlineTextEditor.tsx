import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

export interface InlineTextEditorProps {
  label: string;
  value: string;
  multiline?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/** A single shared draft is owned by Editor, including while this input blurs. */
export function InlineTextEditor({ label, value, multiline = false, required = true, onChange, onCommit, onCancel }: InlineTextEditorProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);
  function submit() { if (input.current?.reportValidity()) onCommit(); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault(); submit();
    }
  }
  return <div className="ps-inline-editor nodrag nopan" onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <textarea ref={input} aria-label={label} required={required} rows={1} value={value}
      onChange={event => onChange(event.target.value)} onKeyDown={keyDown} />
    <div className="ps-inline-actions">
      <span>{multiline ? '⌘ / Ctrl + Enter 应用' : 'Enter 应用'} · Esc 取消</span>
      <button type="button" aria-label={`应用${label}`} title="应用" onClick={submit}>✓</button>
      <button type="button" aria-label={`取消${label}编辑`} title="取消" onClick={onCancel}>×</button>
    </div>
  </div>;
}
