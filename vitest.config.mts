import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['lib/push/**/*.test.ts', 'app/api/push/**/*.test.ts', 'app/api/cron/push/**/*.test.ts', 'components/PushNotifications.test.tsx'] },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
});
