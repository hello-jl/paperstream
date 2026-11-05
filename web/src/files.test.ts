import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from './files.ts';
import type { LocalFileHandle } from './files.ts';

function fakeFile(initial: string) {
  const state = { text: initial, opened: 0, aborted: 0, pending: '', failWrite: false, changeOnOpen: false, changeOnWrite: false };
  const handle: LocalFileHandle = {
    name: 'test.canvas',
    async getFile() { return { text: async () => state.text }; },
    async createWritable() {
      state.opened++;
      if (state.changeOnOpen) state.text = 'external';
      return {
        async write(text) { if (state.failWrite) throw new Error('disk full'); state.pending = text; if (state.changeOnWrite) state.text = 'external'; },
        async close() { state.text = state.pending; },
        async abort() { state.aborted++; },
      };
    },
  };
  return { state, handle };
}

test('save commits the requested text only on successful close', async () => {
  const { state, handle } = fakeFile('original');
  await writeFile(handle, 'original', 'updated');
  assert.equal(state.text, 'updated');
});
test('external change refuses to open a writer', async () => {
  const { state, handle } = fakeFile('external');
  await assert.rejects(writeFile(handle, 'original', 'updated'), /其他程序/);
  assert.equal(state.opened, 0);
  assert.equal(state.text, 'external');
});
test('change while acquiring the stream aborts without writing', async () => {
  const { state, handle } = fakeFile('original');
  state.changeOnOpen = true;
  await assert.rejects(writeFile(handle, 'original', 'updated'), /发生变化/);
  assert.equal(state.aborted, 1);
  assert.equal(state.text, 'external');
});
test('write failure aborts and keeps the original file', async () => {
  const { state, handle } = fakeFile('original');
  state.failWrite = true;
  await assert.rejects(writeFile(handle, 'original', 'updated'), /disk full/);
  assert.equal(state.aborted, 1);
  assert.equal(state.text, 'original');
});
test('external edit during the write is detected before committing', async () => {
  const { state, handle } = fakeFile('original');
  state.changeOnWrite = true;
  await assert.rejects(writeFile(handle, 'original', 'updated'), /写入期间/);
  assert.equal(state.text, 'external');
  assert.equal(state.aborted, 1);
});
