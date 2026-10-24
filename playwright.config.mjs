import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e', timeout:45000, workers:1, fullyParallel:false,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4275/PocketFile/',headless:true,acceptDownloads:true,launchOptions:{downloadsPath:path.resolve('test-results/downloads')},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4275',url:'http://127.0.0.1:4275/PocketFile/',reuseExistingServer:!process.env.CI},
});
