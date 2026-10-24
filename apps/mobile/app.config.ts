/// <reference types="node" />
// Runs in Node on the build machine (Expo reads it at build time), not on the phone.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds the config; this only adds Firebase once its file is in the repo.
// google-services.json carries public identifiers (Expo's docs say it can be committed);
// the secret FCM sending key lives in Expo's credentials, never here.
const GOOGLE_SERVICES = './google-services.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const expo = config as ExpoConfig;
  if (!existsSync(join(__dirname, GOOGLE_SERVICES))) return expo;
  return { ...expo, android: { ...expo.android, googleServicesFile: GOOGLE_SERVICES } };
};
