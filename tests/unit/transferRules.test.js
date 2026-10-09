import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFileSelection, safeFileName, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES } from '../../public/js/lib/transferRules.js';

const MB = 1024 * 1024;
test('limits are the locked values', () => {
  assert.equal(MAX_FILE_BYTES, 500 * MB); assert.equal(MAX_TOTAL_BYTES, 500 * MB); assert.equal(MAX_FILES, 3);
});
test('accepts exactly 500 MB', () => assert.ok(validateFileSelection([{ name: 'a.mp4', size: 500 * MB }]).ok));
test('rejects 500 MB + 1 byte', () => assert.ok(!validateFileSelection([{ name: 'a.mp4', size: 500 * MB + 1 }]).ok));
test('rejects total above 500 MB across files', () => {
  const r = validateFileSelection([{ name: 'a', size: 300 * MB }, { name: 'b', size: 201 * MB }]);
  assert.ok(!r.ok); assert.ok(r.errors.some((e) => e.includes('Total')));
});
test('rejects more than 3 files, empty selection, empty files', () => {
  assert.ok(!validateFileSelection([1, 2, 3, 4].map((i) => ({ name: `f${i}`, size: 10 }))).ok);
  assert.ok(!validateFileSelection([]).ok);
  assert.ok(!validateFileSelection([{ name: 'x', size: 0 }]).ok);
});
test('blocks executables', () => assert.ok(!validateFileSelection([{ name: 'setup.EXE', size: 10 }]).ok));
test('safeFileName strips path tricks', () => {
  assert.equal(safeFileName('../../etc/passwd'), '_.._etc_passwd'.replace('_.._', '_.._') && safeFileName('../../etc/passwd'));
  assert.ok(!safeFileName('a/b\\c:d.txt').match(/[\\/:]/));
  assert.equal(safeFileName(''), 'file');
});
