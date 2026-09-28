export function matchOfferRoute(method, pathname) {
  if (method === 'POST' && pathname === '/api/offers') return { action: 'create', auth: true };
  const match = /^\/api\/offers\/([A-Za-z0-9_-]{1,100})(\/(publish|payment|status))?$/.exec(pathname);
  if (!match) return null;
  if (method === 'GET' && !match[2]) return { action: 'get', id: match[1], auth: false };
  if (method === 'POST' && match[3] === 'payment') return { action: 'createPayment', id: match[1], auth: false };
  if (method === 'GET' && match[3] === 'status') return { action: 'getStatus', id: match[1], auth: false };
  if (method === 'POST' && match[3] === 'publish') return { action: 'publish', id: match[1], auth: true };
  return null;
}

export function matchWebhookRoute(method, pathname) {
  if (method !== 'POST') return null;
  if (pathname === '/api/webhooks/lightning' || pathname === '/api/webhooks/bitnob/lightning') {
    return { action: 'lightningWebhook', auth: false };
  }
  return null;
}
