import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downloadModel, validModel } from '../electron/model-download.ts';

test('model download resumes after interruption, verifies bytes, and preserves a valid destination on failure', async () => {
  const bytes = Buffer.from('verified model fixture '.repeat(2000)); const requests: string[] = [];
  let ignoreRange = false;
  const server = createServer((request, response) => {
    const range = request.headers.range ?? ''; requests.push(range);
    if (requests.length === 1) {
      response.writeHead(200, { 'Content-Length': bytes.length }); response.write(bytes.subarray(0, 4096));
      setTimeout(() => response.destroy(), 50); return;
    }
    const start = range && !ignoreRange ? Number(range.slice(6, -1)) : 0;
    response.writeHead(start ? 206 : 200, { 'Content-Length': bytes.length - start, ...(start ? { 'Content-Range': `bytes ${start}-${bytes.length - 1}/${bytes.length}` } : {}) });
    response.end(bytes.subarray(start));
  });
  const folder = await mkdtemp(path.join(tmpdir(), 'lemix-download-'));
  const file = path.join(folder, 'fixture.onnx');
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const info = { file: 'fixture.onnx', url: `http://127.0.0.1:${address.port}`, hash: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    const progress: number[] = [];
    await downloadModel(info, file, new AbortController().signal, value => progress.push(value));
    assert.deepEqual(await readFile(file), bytes); assert.equal(requests[1], 'bytes=4096-');
    assert.equal(progress.at(-1), 100); assert.equal(await validModel(file, info.hash), true);
    requests.length = 0; ignoreRange = true;
    await downloadModel(info, file, new AbortController().signal, () => {});
    assert.deepEqual(await readFile(file), bytes); assert.equal(requests[1], 'bytes=4096-');
    await assert.rejects(downloadModel({ ...info, hash: '0'.repeat(64) }, file, new AbortController().signal, () => {}), /checksum/);
    assert.deepEqual(await readFile(file), bytes); assert.deepEqual(await readdir(folder), ['fixture.onnx']);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(downloadModel(info, file, controller.signal, () => {}));
    const active = new AbortController();
    await assert.rejects(downloadModel(info, file, active.signal, () => active.abort()));
    assert.deepEqual(await readFile(file), bytes); assert.deepEqual(await readdir(folder), ['fixture.onnx']);
    await writeFile(file, 'corrupt'); assert.equal(await validModel(file, info.hash), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(folder, { recursive: true }); }
});
