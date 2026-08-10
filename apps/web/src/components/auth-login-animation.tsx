'use client';

import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';

// Serve the player runtime from this application instead of public CDNs.
// This is a static configuration and must happen before a player is created.
setWasmUrl('/dotlottie-player.wasm');

export function AuthLoginAnimation() {
  return (
    <DotLottieReact
      aria-hidden="true"
      autoplay
      className="h-96 w-full shrink-0 lg:h-[44rem]"
      layout={{ align: [0.5, 0.5], fit: 'contain' }}
      loop
      src="/Login Character Animation.lottie"
    />
  );
}
