import { describe, it, expect } from 'vitest';
import { getEnumData } from '../../getters/enum';

describe('getEnumData', () => {
  it('should name members the way the generated enum does', () => {
    const data = getEnumData('Status', { type: 'string', enum: ['Active', 'active'] } as any);

    // Both sanitize to `active`, and two members cannot share a name
    expect(data!.values.map(v => v.name)).toEqual(['active', 'active2']);
  });

  it('should drop null and repeated values', () => {
    const data = getEnumData('Mixed', { type: 'number', enum: [1.0, 1, null] } as any);

    expect(data!.values).toHaveLength(1);
    expect(data!.values[0].name).toBe('value1');
  });

  it('should return null for a schema that is not an enum', () => {
    expect(getEnumData('Plain', { type: 'string' } as any)).toBeNull();
  });
});
