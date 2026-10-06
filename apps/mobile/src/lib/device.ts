import type { DeviceInfo } from '@afrisime/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Informations d'appareil envoyées à la connexion (liste des sessions, sécurité). */
export function getDeviceInfo(): DeviceInfo {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'android',
    model: Device.modelName ?? null,
    osVersion: Device.osVersion ?? null,
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
  };
}
