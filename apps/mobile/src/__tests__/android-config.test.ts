import appConfig from '../../app.json';

const restrictedPermissions = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  'android.permission.READ_CALL_LOG',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_CALL_LOG',
  'android.permission.WRITE_CONTACTS',
  'android.permission.WRITE_EXTERNAL_STORAGE',
] as const;

describe('Android application configuration', () => {
  it('allows only foreground job-bound location and keeps background/restricted access blocked', () => {
    const android = appConfig.expo.android;

    expect(android.permissions).toEqual([
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
    ]);
    expect(android.blockedPermissions).toEqual(expect.arrayContaining(restrictedPermissions));
    for (const permission of restrictedPermissions) {
      expect(android.permissions).not.toContain(permission);
    }
  });

  it('configures a visible foreground location service without background permission', () => {
    const location = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location',
    );

    expect(location).toEqual([
      'expo-location',
      expect.objectContaining({
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: true,
      }),
    ]);
  });

  it('targets Android API 36 through prebuild', () => {
    const buildProperties = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(buildProperties).toEqual([
      'expo-build-properties',
      {
        android: expect.objectContaining({ compileSdkVersion: 36, targetSdkVersion: 36 }),
      },
    ]);
  });

  it('keeps authentication storage out of Android backups', () => {
    const android = appConfig.expo.android;
    const secureStore = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store',
    );

    expect(android.allowBackup).toBe(false);
    expect(secureStore).toEqual([
      'expo-secure-store',
      {
        configureAndroidBackup: true,
      },
    ]);
  });
});
