import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';

export interface ModelFile { file: string; url: string; hash: string; bytes: number }

export async function validModel(file: string, expectedHash: string, signal?: AbortSignal) {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) { signal?.throwIfAborted(); hash.update(chunk); }
    return hash.digest('hex') === expectedHash;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function downloadModel(info: ModelFile, destination: string, signal: AbortSignal, progress: (percent: number) => void) {
  signal.throwIfAborted();
  const temporary = `${destination}.${randomUUID()}.download`;
  const file = await open(temporary, 'wx');
  let received = 0; let hash = createHash('sha256');
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await fetch(info.url, {
          signal: AbortSignal.any([signal, AbortSignal.timeout(5 * 60 * 1000)]),
          headers: received ? { Range: `bytes=${received}-` } : {},
        });
        if (!response.ok || !response.body) throw new Error(`Cannot download AI model (HTTP ${response.status}).`);
        if (response.status === 206) {
          const range = response.headers.get('content-range');
          if (!range?.startsWith(`bytes ${received}-`) || !range.endsWith(`/${info.bytes}`)) {
            await response.body.cancel(); throw new Error('The model server returned an invalid download range.');
          }
        } else if (received) {
          await file.truncate(0); received = 0; hash = createHash('sha256');
        }
        for await (const chunk of Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])) {
          signal.throwIfAborted();
          if (received + chunk.length > info.bytes) throw new Error('AI model exceeds its verified size.');
          let written = 0;
          while (written < chunk.length) {
            const part = await file.write(chunk, written, chunk.length - written, received + written);
            if (!part.bytesWritten) throw new Error('Could not write the AI model download.');
            written += part.bytesWritten;
          }
          hash.update(chunk); received += chunk.length;
          progress(Math.min(99, Math.floor(received / info.bytes * 100)));
        }
        if (received !== info.bytes) throw new Error('AI model download was interrupted.');
        break;
      } catch (error) {
        signal.throwIfAborted();
        if (attempt === 4) throw error;
      }
    }
    if (hash.digest('hex') !== info.hash) throw new Error('AI model checksum failed. Please try downloading again.');
    signal.throwIfAborted(); await file.close(); await rename(temporary, destination); progress(100);
  } finally { await file.close(); await unlink(temporary).catch(() => undefined); }
}
