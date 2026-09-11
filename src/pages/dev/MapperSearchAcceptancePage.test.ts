import { describe, expect, it } from 'vitest';
import {
  isMapperSearchAcceptanceHost,
  MAPPER_SEARCH_ACCEPTANCE_PATH,
} from './mapperSearchAcceptanceBoundary';

describe('Mapper/Search served acceptance probe boundary', () => {
  it('is registered on the stable staging QA path', () => {
    expect(MAPPER_SEARCH_ACCEPTANCE_PATH).toBe('/qa/mapper-search-acceptance');
  });

  it('allows only canonical staging and local development hosts', () => {
    expect(isMapperSearchAcceptanceHost('staging.pinguinoai.com')).toBe(true);
    expect(isMapperSearchAcceptanceHost('localhost')).toBe(true);
    expect(isMapperSearchAcceptanceHost('127.0.0.1')).toBe(true);
  });

  it('denies every production hostname', () => {
    expect(isMapperSearchAcceptanceHost('pinguinoai.com')).toBe(false);
    expect(isMapperSearchAcceptanceHost('www.pinguinoai.com')).toBe(false);
    expect(isMapperSearchAcceptanceHost('gellatti.com')).toBe(false);
    expect(isMapperSearchAcceptanceHost('www.gellatti.com')).toBe(false);
  });
});
