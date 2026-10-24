import { expect, test } from 'vitest';
import { bentSourceFraction, readBend } from './bend';
import { readAlphaMask } from './alpha';
test('cylindrical projection keeps endpoints/center fixed, is monotonic and supports its inverse', () => {
  for (const angle of [20, 90, 140, 170]) {
    expect(bentSourceFraction(0, angle)).toBe(0); expect(bentSourceFraction(.5, angle)).toBe(.5); expect(bentSourceFraction(1, angle)).toBe(1);
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const f = i / 100, warped = bentSourceFraction(f, angle);
      expect(warped).toBeGreaterThan(previous); previous = warped;
      expect(bentSourceFraction(warped, -angle)).toBeCloseTo(f, 8);
    }
  }
  expect(bentSourceFraction(.3, 0)).toBe(.3);
});
test('optional mask and bend metadata reject invalid data', () => {
  expect(readBend({ axis: 'horizontal', angleDeg: 500 })).toEqual({ axis: 'horizontal', angleDeg: 170 });
  expect(readBend({ axis: 'horizontal', angleDeg: NaN })).toBeUndefined();
  expect(readAlphaMask({ png: 'https://untrusted/mask.png' })).toBeUndefined();
  expect(readAlphaMask({ png: 'data:image/png;base64,YWJj', text: 'A' })).toEqual({ png: 'data:image/png;base64,YWJj', text: 'A' });
});
