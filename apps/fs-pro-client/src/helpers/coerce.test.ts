import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bool, counts, int, isRecord, list, nullableInt, nullableStr, num, record, str } from './coerce';

describe('coerce', () => {
  it('reads records and rejects arrays/null', () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord('x'), false);
  });

  it('reads scalars with fallbacks', () => {
    assert.equal(str('a'), 'a');
    assert.equal(str(7, 'fallback'), 'fallback');
    assert.equal(int(3.9), 3);
    assert.equal(int('3', 7), 7);
    assert.equal(num(2.5), 2.5);
    assert.equal(num(NaN, 1), 1);
    assert.equal(bool(true), true);
    assert.equal(bool('true'), false);
  });

  it('reads nullable and array fields', () => {
    assert.equal(nullableStr(''), null);
    assert.equal(nullableStr('x'), 'x');
    assert.equal(nullableInt(4.2), 4);
    assert.equal(nullableInt(undefined), null);
    assert.deepEqual(list([1, 2]), [1, 2]);
    assert.deepEqual(list('nope'), []);
    assert.deepEqual(record(null), {});
  });

  it('maps a perk map to sorted non-zero counts', () => {
    assert.deepEqual(counts({ b: 2, a: 1, c: 0, d: 'x' }), [
      { key: 'a', count: 1 },
      { key: 'b', count: 2 },
    ]);
    assert.deepEqual(counts(null), []);
  });
});
