import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import { browserDeviceMetadata } from '../src/auth/request-metadata.js';

describe('browserDeviceMetadata', () => {
  it('identifies Brave on Windows from browser headers', () => {
    const request = {
      headers: {
        'sec-ch-ua': '"Chromium";v="140", "Brave";v="140"',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
      },
    } as unknown as Request;

    assert.deepEqual(browserDeviceMetadata(request), {
      deviceName: 'Brave on Windows',
      devicePlatform: 'web',
    });
  });

  it('identifies a mobile Android browser', () => {
    const request = {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      },
    } as unknown as Request;

    assert.deepEqual(browserDeviceMetadata(request), {
      deviceName: 'Chrome on Android',
      devicePlatform: 'android',
    });
  });
});
