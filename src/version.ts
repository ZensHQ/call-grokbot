import { readFileSync } from 'node:fs';

export const VERSION: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
export const LOGIN_COMMAND = `npx --yes call-grokbot@${VERSION} login`;
