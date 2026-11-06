/** Browser file access. The editor never silently overwrites an external edit. */
export interface LocalFileHandle {
  name: string;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(options?: { mode?: 'exclusive' }): Promise<{
    write(text: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

interface PickerWindow {
  showOpenFilePicker?: (options: unknown) => Promise<LocalFileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<LocalFileHandle>;
}

const fileTypes = [{ description: '论文关系图', accept: { 'application/json': ['.canvas'] } }];

export function hasFilePicker(): boolean {
  return typeof (window as unknown as PickerWindow).showOpenFilePicker === 'function';
}

export async function pickFile(): Promise<LocalFileHandle> {
  const picker = window as unknown as PickerWindow;
  if (!picker.showOpenFilePicker) throw new Error('此浏览器不支持直接读写文件，请使用打开和下载副本。');
  const [handle] = await picker.showOpenFilePicker({ types: fileTypes, multiple: false });
  if (!handle) throw new DOMException('未选择文件', 'AbortError');
  return handle;
}

export async function pickSaveFile(name: string): Promise<LocalFileHandle | null> {
  const picker = window as unknown as PickerWindow;
  if (!picker.showSaveFilePicker) return null;
  return picker.showSaveFilePicker({ suggestedName: name, types: fileTypes });
}

export async function writeFile(handle: LocalFileHandle, expected: string, text: string): Promise<void> {
  if (await (await handle.getFile()).text() !== expected) {
    throw new Error('文件已被其他程序修改。请下载当前副本，再重新打开磁盘文件核对；本次没有覆盖。');
  }
  // Supported browsers use an exclusive writer; older implementations may ignore mode.
  const writer = await handle.createWritable({ mode: 'exclusive' });
  try {
    // Recheck after acquiring the stream, before writing to its temporary backing file.
    if (await (await handle.getFile()).text() !== expected) {
      throw new Error('保存期间文件发生变化，本次没有覆盖。请重新打开后核对。');
    }
    await writer.write(text);
    if (await (await handle.getFile()).text() !== expected) {
      throw new Error('写入期间文件发生变化，本次没有覆盖。请重新打开后核对。');
    }
    await writer.close();
  } catch (error) {
    try { await writer.abort(); } catch { /* A failed close may already release it. */ }
    throw error;
  }
}

export function downloadFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name.endsWith('.canvas') ? name : `${name}.canvas`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
