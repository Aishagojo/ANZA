export function matchOfferRoute(method, pathname) {
  if (method === 'POST' && pathname === '/api/v1/offers') return { action: 'create', auth: true };
  const match = /^\/api\/v1\/offers\/([A-Za-z0-9_-]{1,100})(\/publish)?$/.exec(pathname);
  if (!match) return null;
  if (method === 'GET' && !match[2]) return { action: 'get', id: match[1], auth: false };
  if (method === 'POST' && match[2]) return { action: 'publish', id: match[1], auth: true };
  return null;
}
