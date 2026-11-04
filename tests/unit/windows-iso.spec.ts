// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { readWindowsAudioIso, readWindowsGraphicsIso } from '../../src/game/resources/file/windows-iso';
import { clearLemmingsFiles, getWindowsVoiceFile, importLemmingsFiles, importWindowsVoiceFiles, REQUIRED_LEMMINGS_FILES } from '../../src/game/resources/file/game-file-store';
import { syntheticDosData } from '../helpers/synthetic-dos';

vi.stubGlobal('indexedDB', indexedDB);

const BLOCK = 2048;
function testIso(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(30 * BLOCK);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => bytes.set(new TextEncoder().encode(value), at);
  const both32 = (at: number, value: number) => { view.setUint32(at, value, true); view.setUint32(at + 4, value, false); };
  const record = (at: number, name: string, sector: number, length: number, directory: boolean) => {
    const nameBytes = new TextEncoder().encode(name);
    const size = 33 + nameBytes.length + (nameBytes.length % 2 === 0 ? 1 : 0);
    bytes[at] = size; both32(at + 2, sector); both32(at + 10, length);
    bytes[at + 25] = directory ? 2 : 0; bytes[at + 32] = nameBytes.length;
    bytes.set(nameBytes, at + 33);
    return at + size;
  };
  const primary = 16 * BLOCK;
  bytes[primary] = 1; text(primary + 1, 'CD001'); bytes[primary + 6] = 1;
  both32(primary + 80, 30); view.setUint16(primary + 128, BLOCK, true); view.setUint16(primary + 130, BLOCK, false);
  record(primary + 156, '\0', 20, BLOCK, true);
  record(20 * BLOCK, 'LEMMINGS', 21, BLOCK, true);
  let next = record(21 * BLOCK, 'SOUND', 22, BLOCK, true);
  record(next, 'MUSIC', 23, BLOCK, true);
  next = record(22 * BLOCK, 'LETSGO.WAV;1', 24, 48, false);
  next = record(next, 'OHNO.WAV;1', 25, 48, false);
  record(next, 'YIPPEE.WAV;1', 26, 48, false);
  record(23 * BLOCK, 'TIM1P.MID;1', 27, 34, false);
  for (let i = 24; i <= 26; i++) {
    const start = i * BLOCK;
    text(start, 'RIFF'); view.setUint32(start + 4, 40, true); text(start + 8, 'WAVE');
    text(start + 12, 'fmt '); view.setUint32(start + 16, 16, true); view.setUint16(start + 20, 1, true);
    view.setUint16(start + 22, 1, true); view.setUint32(start + 24, 7092, true); view.setUint32(start + 28, 7092, true);
    view.setUint16(start + 32, 1, true); view.setUint16(start + 34, 8, true); text(start + 36, 'data');
    view.setUint32(start + 40, 4, true); bytes.fill(i, start + 44, start + 48);
  }
  bytes.set([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
    77, 84, 114, 107, 0, 0, 0, 12, 0, 144, 60, 100, 48, 128, 60, 0, 0, 255, 47, 0], 27 * BLOCK);
  return bytes;
}

it('reads only recognized files from the canonical ISO folders using slices', async () => {
  const data = testIso();
  const file = new File([data], 'Windows.ISO');
  const files = await readWindowsAudioIso(file);
  expect(files.map(f => f.name)).toEqual(['LETSGO.WAV', 'OHNO.WAV', 'YIPPEE.WAV', 'TIM1P.MID']);
  expect(new Uint8Array(await files[0].arrayBuffer())[44]).toBe(24);
  expect(new Uint8Array(await files[3].arrayBuffer())[0]).toBe(77);
});

it('imports an ISO through the regular audio importer and preserves saved data on failure', async () => {
  await clearLemmingsFiles();
  await importLemmingsFiles(REQUIRED_LEMMINGS_FILES.map((name, i) => new File([Uint8Array.from(syntheticDosData(name, i + 1))], name)));
  await importWindowsVoiceFiles([new File([testIso()], 'Lemmings.iso')]);
  expect(new Uint8Array((await getWindowsVoiceFile('OHNO.WAV'))!)[44]).toBe(25);
  await expect(importWindowsVoiceFiles([new File([testIso().slice(0, 100)], 'broken.iso')])).rejects.toThrow('valid ISO 9660');
  expect(new Uint8Array((await getWindowsVoiceFile('OHNO.WAV'))!)[44]).toBe(25);
});

it('rejects corrupt descriptors and out-of-bounds or inconsistent directory extents', async () => {
  const badMagic = testIso(); badMagic[16 * BLOCK + 1] = 0;
  await expect(readWindowsAudioIso(new File([badMagic], 'bad.iso'))).rejects.toThrow('valid ISO 9660');
  const inconsistent = testIso(); inconsistent[20 * BLOCK + 2] = 29;
  await expect(readWindowsAudioIso(new File([inconsistent], 'bad.iso'))).rejects.toThrow('valid ISO 9660');
  const huge = testIso();
  const view = new DataView(huge.buffer);
  view.setUint32(20 * BLOCK + 10, 5 * 1024 * 1024, true);
  view.setUint32(20 * BLOCK + 14, 5 * 1024 * 1024, false);
  await expect(readWindowsAudioIso(new File([huge], 'bad.iso'))).rejects.toThrow('valid ISO 9660');
  await expect(readWindowsAudioIso(new File([testIso().slice(0, 21 * BLOCK)], 'short.iso'))).rejects.toThrow('valid ISO 9660');
});

it('rejects an image without the expected Windows Lemmings folder', async () => {
  const image = testIso(); image.set(new TextEncoder().encode('SOMETHNG'), 20 * BLOCK + 33);
  await expect(readWindowsAudioIso(new File([image], 'other.iso'))).rejects.toThrow('does not contain a LEMMINGS or WINLEMM folder');
});

it('skips an oversized optional title bitmap while keeping other ISO graphics available', async () => {
  const image = new Uint8Array(600 * BLOCK); image.set(testIso());
  const view = new DataView(image.buffer);
  const both32 = (at: number, value: number) => { view.setUint32(at, value, true); view.setUint32(at + 4, value, false); };
  both32(16 * BLOCK + 80, 600);
  const record = (at: number, name: string, sector: number, size: number, directory: boolean) => {
    const encoded = new TextEncoder().encode(name);
    const length = 33 + encoded.length + (encoded.length % 2 === 0 ? 1 : 0);
    image[at] = length; both32(at + 2, sector); both32(at + 10, size);
    image[at + 25] = directory ? 2 : 0; image[at + 32] = encoded.length;
    image.set(encoded, at + 33);
    return at + length;
  };
  const music = 21 * BLOCK + image[21 * BLOCK];
  record(music + image[music], 'GFX', 28, BLOCK, true);
  const next = record(28 * BLOCK, 'WLEMLOGO.BMP;1', 29, 1024 * 1024 + 1, false);
  record(next, 'FE.PAL;1', 27, 34, false);
  const files = await readWindowsGraphicsIso(new File([image], 'game.iso'));
  expect(files.map(file => file.name)).toEqual(['FE.PAL']);
});
