// run: node --test src/utils/dotenv.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotEnv } from './dotenv.js';

test('pasted .env files become name/value pairs', () => {
  assert.deepEqual(
    parseDotEnv(
      [
        '# database',
        'DATABASE_URL=postgres://u:p@host:5432/db',
        'export API_KEY = abc123   # inline comment',
        'GREETING="hello\\nworld"',
        "TOKEN='keep # this'",
        'EMPTY=',
        'not an assignment',
        '1BAD=x'
      ].join('\r\n')
    ),
    {
      DATABASE_URL: 'postgres://u:p@host:5432/db',
      API_KEY: 'abc123',
      GREETING: 'hello\nworld',
      TOKEN: 'keep # this',
      EMPTY: ''
    }
  );
});
