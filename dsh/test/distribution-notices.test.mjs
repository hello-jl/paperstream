import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyDistributionNotices, verifyDistributionNotices } from '../../web/scripts/distribution-notices.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'paperstream-notices-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = join(root, 'source');
  const destination = join(root, 'artifact');
  await mkdir(join(repository, 'licenses', 'third-party'), { recursive: true });
  await writeFile(join(repository, 'THIRD_PARTY_NOTICES.md'), '[License](licenses/third-party/example.txt)\n');
  await writeFile(join(repository, 'licenses', 'third-party', 'example.txt'), 'Original copyright\r\nLicense fixture.\r\n');
  return { repository, destination };
}

test('distribution keeps complete notices and optional repository license at their linked paths', async t => {
  const { repository, destination } = await fixture(t);
  await writeFile(join(repository, 'LICENSE'), 'Repository owner license fixture.\n');
  await copyDistributionNotices(repository, destination);
  await verifyDistributionNotices(repository, destination);
  const source = await readFile(join(repository, 'licenses', 'third-party', 'example.txt'));
  assert.deepEqual(await readFile(join(destination, 'licenses', 'third-party', 'example.txt')), source);
  assert.equal(await readFile(join(destination, 'LICENSE'), 'utf8'), 'Repository owner license fixture.\n');

  await rm(join(repository, 'LICENSE'));
  await assert.rejects(verifyDistributionNotices(repository, destination), /removed repository license/);
  await copyDistributionNotices(repository, destination);
  await verifyDistributionNotices(repository, destination);
  await assert.rejects(readFile(join(destination, 'LICENSE')), { code: 'ENOENT' });
});

test('prepack detects stale or incomplete license copies and rebuild removes obsolete files', async t => {
  const { repository, destination } = await fixture(t);
  await copyDistributionNotices(repository, destination);
  await writeFile(join(destination, 'licenses', 'third-party', 'example.txt'), 'Stale license');
  await assert.rejects(verifyDistributionNotices(repository, destination), /Stale distribution notice/);
  await copyDistributionNotices(repository, destination);
  await writeFile(join(destination, 'licenses', 'obsolete.txt'), 'Removed upstream dependency');
  await assert.rejects(verifyDistributionNotices(repository, destination), /license files differ/);
  await copyDistributionNotices(repository, destination);
  await verifyDistributionNotices(repository, destination);

  await rm(join(destination, 'licenses', 'third-party', 'example.txt'));
  await assert.rejects(verifyDistributionNotices(repository, destination), /license files differ/);
});

test('a missing required third-party notice fails the build instead of silently omitting it', async t => {
  const { repository, destination } = await fixture(t);
  await rm(join(repository, 'THIRD_PARTY_NOTICES.md'));
  await assert.rejects(copyDistributionNotices(repository, destination), { code: 'ENOENT' });
});
