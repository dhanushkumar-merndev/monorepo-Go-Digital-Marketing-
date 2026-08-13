/* eslint-disable @typescript-eslint/no-require-imports */

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// expo-sqlite web loads its database engine as WebAssembly. Metro only resolves
// explicitly registered asset extensions.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// SharedArrayBuffer is required by the expo-sqlite web worker. These headers
// apply to the local Expo development server; production hosting must provide
// the same isolation headers.
const enhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const enhanced = enhanceMiddleware ? enhanceMiddleware(middleware, server) : middleware;
  return (request, response, next) => {
    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return enhanced(request, response, next);
  };
};

module.exports = withNativeWind(config, {
  input: './global.css',
  configPath: './tailwind.config.ts',
});
