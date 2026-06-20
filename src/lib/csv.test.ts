import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('parses a simple grid with LF newlines', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('strips a leading BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted cells', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('keeps newlines inside quoted cells', () => {
    expect(parseCsv('a,"line1\nline2",c')).toEqual([['a', 'line1\nline2', 'c']]);
  });

  it('unescapes doubled quotes inside quoted cells', () => {
    expect(parseCsv('a,"she said ""hi""",c')).toEqual([['a', 'she said "hi"', 'c']]);
  });

  it('does not emit a spurious empty row for a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('preserves leading zeros (cells stay strings, never numbers)', () => {
    const grid = parseCsv('ean\n0049000028911\n007');
    expect(grid[1]).toEqual(['0049000028911']);
    expect(grid[2]).toEqual(['007']);
  });

  it('preserves empty fields (trailing comma -> empty cell)', () => {
    expect(parseCsv('a,b,\n1,,3')).toEqual([
      ['a', 'b', ''],
      ['1', '', '3'],
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
