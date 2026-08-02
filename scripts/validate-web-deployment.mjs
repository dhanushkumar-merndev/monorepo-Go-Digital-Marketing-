const apiUrlValue = process.env.NEXT_PUBLIC_API_URL;

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
