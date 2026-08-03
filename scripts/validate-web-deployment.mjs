const apiUrlValue = process.env.NEXT_PUBLIC_API_URL;
const googleClientIdValue = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

function deploymentApiUrl(value) {
  if (!value) {
    throw new Error('NEXT_PUBLIC_API_URL is required before deploying the Cloudflare Worker.');
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be a valid HTTPS URL.');
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/v1' && url.pathname !== '/v1/')
  ) {
    throw new Error('NEXT_PUBLIC_API_URL must be an HTTPS origin with the exact /v1 path.');
  }
}

deploymentApiUrl(apiUrlValue);

if (
  !googleClientIdValue ||
  !/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/u.test(googleClientIdValue)
) {
  throw new Error(
    'NEXT_PUBLIC_GOOGLE_CLIENT_ID must be an explicit Google OAuth web client ID before deploying.',
  );
}
