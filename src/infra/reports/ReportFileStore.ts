import { mkdir, open, readFile, readdir, stat, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ReportError } from '../../domain/reports/Report.js';
export class ReportFileStore {
  constructor(private directory: string) {}
  private path(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new ReportError('NOT_FOUND', 404);
    return join(this.directory, `${id}.pdf`);
  }
  async save(id: string, bytes: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(id);
    try {
      const handle = await open(`${path}.tmp`, 'wx', 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(`${path}.tmp`, path);
      const directory = await open(this.directory, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await unlink(`${path}.tmp`).catch(() => undefined);
    }
  }
  async read(id: string): Promise<Buffer> {
    return readFile(this.path(id));
  }
  async cleanupOrphans(isSaved: (id: string) => boolean, now = Date.now()): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.directory)) {
      const match = /^([0-9a-f-]{36})\.pdf(?:\.tmp)?$/.exec(name);
      if (!match || isSaved(match[1])) continue;
      const path = join(this.directory, name);
      if ((await stat(path)).mtimeMs < now - 86400000) await unlink(path);
    }
  }
  async remove(id: string): Promise<void> {
    await unlink(this.path(id)).catch(() => undefined);
  }
}
