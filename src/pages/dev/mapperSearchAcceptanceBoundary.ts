export const MAPPER_SEARCH_ACCEPTANCE_PATH = '/qa/mapper-search-acceptance';

export function isMapperSearchAcceptanceHost(hostname: string): boolean {
  return hostname === 'staging.pinguinoai.com' || hostname === 'localhost' || hostname === '127.0.0.1';
}
