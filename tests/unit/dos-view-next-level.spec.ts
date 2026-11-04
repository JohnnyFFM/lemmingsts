import { describe, expect, it } from 'vitest';
import { nextLevelLocation } from '../../src/views/dos-view';

describe('next DOS level', () => {
  const lengths = [30, 30, 0, 30];
  it('advances within a rating, skips empty ratings and stops at the end', () => {
    expect(nextLevelLocation({ gameType: 1, groupIndex: 0, levelIndex: 3 }, lengths)).toEqual({ gameType: 1, groupIndex: 0, levelIndex: 4 });
    expect(nextLevelLocation({ gameType: 1, groupIndex: 1, levelIndex: 29 }, lengths)).toEqual({ gameType: 1, groupIndex: 3, levelIndex: 0 });
    const last = { gameType: 1, groupIndex: 3, levelIndex: 29 };
    expect(nextLevelLocation(last, lengths)).toBe(last);
  });
});
