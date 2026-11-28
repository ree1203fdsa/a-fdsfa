import type { CapacitorConfig } from '@capacitor/cli'

// The Android app opens the deployed site, so the app is always as new as the site.
// app-shell/ only holds the page shown when the site can't be reached.
const config: CapacitorConfig = {
  appId: 'com.colorwars.game',
  appName: '컬러워즈',
  webDir: 'app-shell',
  server: {
    url: 'https://a-fdsfa.vercel.app',
    errorPath: 'index.html',
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#2f6bff',
  },
}

export default config
