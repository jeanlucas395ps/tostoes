import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tostoes.app',
  appName: 'Tostoes',
  webDir: 'dist/mobile-app/browser',
  // Origem da WebView Android = https://{hostname}. Precisa bater com CORS_ORIGIN da API.
  server: {
    androidScheme: 'https',
    hostname: 'app.tostoes.com.br',
  },
};

export default config;
