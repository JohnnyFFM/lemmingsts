import { WINDOWS_MUSIC_FILES, WINDOWS_SOUND_FILES } from './windows-voice-files';
import { WINDOWS_LEVEL_FILES, WINDOWS_GROUND_FILES } from './windows-game-names';
import { WINDOWS_GRAPHICS_GFX_FILES, WINDOWS_GRAPHICS_STYLE_FILES } from './windows-graphics-names';

const BLOCK_SIZE = 2048;
const MAX_DIRECTORY_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_SELECTED_BYTES = 8 * 1024 * 1024;

interface Entry { name: string; offset: number; size: number; directory: boolean; multiExtent: boolean }

/** Read recognized Windows audio from the canonical LEMMINGS folder of an ISO 9660 image.
 * Uses bounded slices so a disc image is never loaded into memory as a whole. */
export async function readWindowsAudioIso(image: File): Promise<File[]> {
  return readWindowsIsoFiles(image, [['SOUND', WINDOWS_SOUND_FILES], ['MUSIC', WINDOWS_MUSIC_FILES]]);
}

/** Extract only the Windows high-resolution game art, independently of audio. */
export async function readWindowsGraphicsIso(image: File): Promise<File[]> {
  return readWindowsIsoFiles(image, [['GFX', WINDOWS_GRAPHICS_GFX_FILES], ['STYLES', WINDOWS_GRAPHICS_STYLE_FILES]]);
}

/** Read standalone level records and metadata from the Windows disc. */
export async function readWindowsGameIso(image: File): Promise<File[]> {
  return readWindowsIsoFiles(image, [['LEVEL/ORIG', WINDOWS_LEVEL_FILES], ['STYLES', WINDOWS_GROUND_FILES], ['USERS', ['LEMMINGS.DB']]]);
}

/** Extract the supported Windows edition together for an atomic user import. */
export async function readWindowsFilesIso(image: File): Promise<File[]> {
  return readWindowsIsoFiles(image, [
    ['SOUND', WINDOWS_SOUND_FILES], ['MUSIC', WINDOWS_MUSIC_FILES],
    ['GFX', WINDOWS_GRAPHICS_GFX_FILES], ['STYLES', [...WINDOWS_GRAPHICS_STYLE_FILES, ...WINDOWS_GROUND_FILES]],
    ['LEVEL/ORIG', WINDOWS_LEVEL_FILES], ['USERS', ['LEMMINGS.DB']],
  ]);
}

async function readWindowsIsoFiles(image: File, selections: ReadonlyArray<readonly [string, readonly string[]]>): Promise<File[]> {
  const invalid = (): never => { throw new Error('Could not read this Windows Lemmings ISO. Check that it is a valid ISO 9660 disc image.'); };
  const read = async (offset: number, size: number): Promise<Uint8Array<ArrayBuffer>> => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > image.size) return invalid();
    const bytes = new Uint8Array(await image.slice(offset, offset + size).arrayBuffer());
    if (bytes.length !== size) return invalid();
    return bytes;
  };
  const uint32 = (view: DataView, offset: number): number => {
    const value = view.getUint32(offset, true);
    if (value !== view.getUint32(offset + 4, false)) return invalid();
    return value;
  };
  const record = (bytes: Uint8Array<ArrayBuffer>, offset: number, limit: number): Entry => {
    const length = bytes[offset];
    if (length < 34 || offset + length > limit || offset + 33 + bytes[offset + 32] > offset + length) return invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const extent = uint32(view, offset + 2);
    const size = uint32(view, offset + 10);
    const name = String.fromCharCode(...bytes.subarray(offset + 33, offset + 33 + bytes[offset + 32]))
      .replace(/;\d+$/, '').toUpperCase();
    const byteOffset = extent * BLOCK_SIZE;
    if (byteOffset + size > image.size || bytes[offset + 1] !== 0 || bytes[offset + 26] !== 0 || bytes[offset + 27] !== 0) return invalid();
    return { name, offset: byteOffset, size, directory: (bytes[offset + 25] & 2) !== 0, multiExtent: (bytes[offset + 25] & 0x80) !== 0 };
  };

  let root: Entry | undefined;
  for (let sector = 16; sector < 48; sector++) {
    const descriptor = await read(sector * BLOCK_SIZE, BLOCK_SIZE);
    if (String.fromCharCode(...descriptor.subarray(1, 6)) !== 'CD001' || descriptor[6] !== 1) return invalid();
    if (descriptor[0] === 1) {
      const view = new DataView(descriptor.buffer);
      if (view.getUint16(128, true) !== BLOCK_SIZE || view.getUint16(130, false) !== BLOCK_SIZE) return invalid();
      const blocks = uint32(view, 80);
      if (blocks * BLOCK_SIZE > image.size) return invalid();
      root = record(descriptor, 156, descriptor.length);
      if (!root.directory || root.multiExtent) return invalid();
      break;
    }
    if (descriptor[0] === 255) break;
  }
  if (!root) return invalid();

  const entries = async (directory: Entry): Promise<Entry[]> => {
    if (!directory.directory || directory.multiExtent || !directory.size || directory.size > MAX_DIRECTORY_BYTES) return invalid();
    const bytes = await read(directory.offset, directory.size);
    const list: Entry[] = [];
    for (let offset = 0; offset < bytes.length;) {
      if (bytes[offset] === 0) { offset = (Math.floor(offset / BLOCK_SIZE) + 1) * BLOCK_SIZE; continue; }
      const length = bytes[offset];
      if (offset % BLOCK_SIZE + length > BLOCK_SIZE) return invalid();
      list.push(record(bytes, offset, bytes.length));
      offset += length;
    }
    return list;
  };
  const namedDirectory = (list: Entry[], name: string): Entry | undefined => {
    const matching = list.filter(entry => entry.name === name && entry.directory);
    if (matching.length > 1) return invalid();
    return matching[0];
  };
  // The 1995 disc keeps the game in LEMMINGS; the 2001 re-release in WINLEMM.
  const rootEntries = await entries(root);
  const game = namedDirectory(rootEntries, 'LEMMINGS') ?? namedDirectory(rootEntries, 'WINLEMM');
  if (!game) throw new Error('This ISO does not contain a LEMMINGS or WINLEMM folder.');
  const folders = await entries(game);
  const recognized = new Map<string, Entry>();
  for (const [folderName, allowed] of selections) {
    let folder: Entry | undefined = game;
    let children = folders;
    for (const segment of folderName.split('/')) {
      folder = namedDirectory(children, segment);
      if (!folder) break;
      children = await entries(folder);
    }
    if (!folder) continue;
    const allowedNames = new Set(allowed);
    for (const entry of children) {
      if (!allowedNames.has(entry.name)) continue;
      if (entry.name === 'WLEMLOGO.BMP' && (entry.directory || entry.multiExtent || entry.size > MAX_FILE_BYTES)) continue;
      if (entry.directory || entry.multiExtent || entry.size > MAX_FILE_BYTES || recognized.has(entry.name)) return invalid();
      recognized.set(entry.name, entry);
    }
  }
  if ([...recognized.values()].reduce((sum, entry) => sum + entry.size, 0) > MAX_SELECTED_BYTES) return invalid();
  return Promise.all([...recognized].map(async ([name, entry]) => new File([await read(entry.offset, entry.size)], name)));
}
