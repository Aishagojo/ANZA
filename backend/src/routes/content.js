export function matchVideoRoute(method, pathname) {
  if (method === 'POST' && pathname === '/api/videos/upload-authorization') return { action: 'authorizeUpload', scope: 'content', auth: true };
  if (method === 'POST' && pathname === '/api/videos') return { action: 'register', scope: 'content', auth: true };
  if (method === 'GET' && pathname === '/api/videos') return { action: 'listMine', scope: 'content', auth: true };
  const match = /^\/api\/videos\/([A-Za-z0-9_-]{1,100})$/.exec(pathname);
  if (!match) return null;
  if (method === 'GET') return { action: 'getOne', scope: 'content', id: match[1], auth: true };
  if (method === 'DELETE') return { action: 'remove', scope: 'content', id: match[1], auth: true };
  return null;
}
