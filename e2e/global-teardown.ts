/**
 * Playwright Global Teardown — cleans up test user cache after the suite.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as typeof import('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as typeof import('path');

const CACHE_FILE = path.join(__dirname, '.test-users.json');

export default async function globalTeardown(): Promise<void> {
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE);
    console.log('[global-teardown] Cleaned up test user cache.');
  }
}
