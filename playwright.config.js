import { defineConfig } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: pathToFileURL(path.resolve('index.html')).href,
    viewport: { width: 1280, height: 800 },
    browserName: 'chromium'
  }
});
