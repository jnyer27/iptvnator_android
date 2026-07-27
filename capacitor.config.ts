import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jasonr.iptvnator',
  appName: 'IPTVnatorAndroid',
  webDir: 'dist/apps/web',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
