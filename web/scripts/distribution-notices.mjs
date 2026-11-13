import { cp, mkdir, readFile, readdir, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const noticeName = 'THIRD_PARTY_NOTICES.md';

/** Release artifacts keep the same relative paths as the repository notices. */
export async function copyDistributionNotices(repository, destination) {
  await mkdir(destination, { recursive: true });
  await copyFile(join(repository, noticeName), join(destination, noticeName));
  await rm(join(destination, 'licenses'), { recursive: true, force: true });
  await cp(join(repository, 'licenses'), join(destination, 'licenses'), { recursive: true });
  try {
    await copyFile(join(repository, 'LICENSE'), join(destination, 'LICENSE'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // A previous local build must not keep a removed repository license.
    await rm(join(destination, 'LICENSE'), { force: true });
  }
}

async function filesBelow(directory, prefix = '') {
  const names = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...await filesBelow(join(directory, entry.name), name));
    else if (entry.isFile()) names.push(name);
    else throw new Error(`Distribution notices must contain regular files: ${name}`);
  }
  return names.sort();
}

/** Prepack checks actual bytes so a stale or incomplete notice copy cannot ship. */
export async function verifyDistributionNotices(repository, destination) {
  const originals = await filesBelow(join(repository, 'licenses'));
  const copies = await filesBelow(join(destination, 'licenses'));
  if (JSON.stringify(originals) !== JSON.stringify(copies)) {
    throw new Error('Distribution license files differ; rebuild the package.');
  }
  const names = [noticeName, ...originals.map(name => `licenses/${name}`)];
  let repositoryLicense;
  try {
    repositoryLicense = await readFile(join(repository, 'LICENSE'));
    names.push('LICENSE');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!repositoryLicense) {
    try {
      await readFile(join(destination, 'LICENSE'));
      throw new Error('Distribution contains a removed repository license; rebuild the package.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of names) {
    const [original, copy] = await Promise.all([
      readFile(join(repository, name)), readFile(join(destination, name)),
    ]);
    if (!original.equals(copy)) throw new Error(`Stale distribution notice: ${name}. Rebuild the package.`);
  }
}
