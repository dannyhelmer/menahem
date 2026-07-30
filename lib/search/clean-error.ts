// Never surface a raw fetch/HTTP exception to the model or the user -- some
// providers embed the API key in the request URL, so an unhandled error's
// own text could leak it. Mirrors the Python app's core/providers/errors.py.
export function cleanProviderError(providerName: string, statusCode?: number): Error {
  if (statusCode === 401 || statusCode === 403) {
    return new Error(
      `${providerName} rejected the request -- the API key looks invalid or missing. Check Settings > Search Providers.`,
    );
  }
  if (statusCode === 429) {
    return new Error(`${providerName} rate-limited this request. Try again in a moment.`);
  }
  if (statusCode && statusCode >= 500) {
    return new Error(`${providerName} is temporarily unavailable.`);
  }
  return new Error(`${providerName} request failed. Check your connection or try again.`);
}
