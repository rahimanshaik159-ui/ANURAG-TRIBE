// LOCKED direct-transfer limits and message protocol (shared by sender, receiver, tests).
// Files NEVER touch Firestore/Storage. Only WebRTC DataChannel moves bytes.

export const MAX_FILE_BYTES = 500 * 1024 * 1024;   // 500 MB per file
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024;  // 500 MB per transfer
export const MAX_FILES = 3;
export const CHUNK_SIZE = 16 * 1024;               // 16 KiB: interoperable across browsers
export const READ_BLOCK = 256 * 1024;              // read from disk in blocks, split into chunks
export const BUFFER_HIGH = 8 * 1024 * 1024;        // pause sending above this (backpressure)
export const BUFFER_LOW = 1 * 1024 * 1024;         // resume below this
export const ACK_EVERY = 1024 * 1024;              // receiver confirms progress every 1 MiB
export const CONNECT_TIMEOUT_MS = 45000;
export const STALL_TIMEOUT_MS = 30000;
export const SESSION_TTL_MS = 24 * 3600 * 1000;
export const BLOCKED_EXTENSIONS = ['exe', 'msi', 'bat', 'cmd', 'scr', 'com', 'vbs', 'ps1', 'pif', 'jar', 'dll'];

export const MSG = {
  HELLO: 'hello', READY: 'ready', FILE_START: 'file-start', FILE_END: 'file-end', ACK: 'ack',
  FILE_OK: 'file-ok', FILE_BAD: 'file-bad', DONE: 'done', CANCEL: 'cancel', ERROR: 'error',
};

export const TERMINAL = ['completed', 'rejected', 'cancelled', 'failed', 'expired'];

const ext = (n) => (String(n).includes('.') ? String(n).split('.').pop().toLowerCase() : '');

/** Validate a selection of {name,size}. Works on File objects or plain objects. */
export function validateFileSelection(files) {
  const errors = [];
  const list = Array.from(files || []);
  if (list.length === 0) errors.push('Choose at least one file.');
  if (list.length > MAX_FILES) errors.push(`You can send at most ${MAX_FILES} files at once.`);
  let total = 0;
  for (const f of list) {
    if (!f.size) errors.push(`"${f.name}" is empty.`);
    if (f.size > MAX_FILE_BYTES) errors.push(`"${f.name}" is larger than 500 MB.`);
    if (BLOCKED_EXTENSIONS.includes(ext(f.name))) errors.push(`"${f.name}": executable file types (.${ext(f.name)}) can't be transferred.`);
    total += f.size || 0;
  }
  if (total > MAX_TOTAL_BYTES) errors.push('Total size is above 500 MB.');
  return { ok: errors.length === 0, errors, total };
}

/** Safe local filename (no path separators / control characters). */
export function safeFileName(name) {
  const n = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').trim().slice(0, 150);
  return n || 'file';
}
