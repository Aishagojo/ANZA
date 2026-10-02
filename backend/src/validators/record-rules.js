// Cross-field invariants in addition to JSON Schema shape validation.
export function validateRecordRules(name, value) {
  const check = (condition, message) => {
    if (!condition) throw new TypeError(name + ': ' + message);
  };
  const publicUrl = raw => {
    let url;
    try { url = new URL(raw); } catch { throw new TypeError(name + ': invalid preview URL'); }
    check(url.protocol === 'https:' && !url.username && !url.password,
      'preview URL must use HTTPS without credentials');
  };
  if (name === 'MediaListing') {
    publicUrl(value.preview_image_url);
    publicUrl(value.terms.content_url);
    check(value.status === 'draft' ? value.event_id === null : value.event_id !== null,
      'event reference must match listing publication state');
  }
  if (name === 'DownloadGrant') {
    check(value.expires_at > value.created_at, 'expiry must follow creation');
    check(!(value.used_at !== null && value.revoked_at !== null), 'grant cannot be both consumed and revoked');
    if (value.used_at !== null) check(value.used_at >= value.created_at && value.used_at < value.expires_at,
      'use must occur after creation and before expiry');
    if (value.revoked_at !== null) check(value.revoked_at >= value.created_at, 'revocation predates creation');
  }
  if (name === 'Order') {
    if (value.status === 'paid') check(value.payment_id !== null && value.license_id !== null,
      'paid order requires payment and license references');
    else check(value.license_id === null, 'unpaid order must not have a license');
  }
  if (name === 'OfferDraft') {
    // The content reference is either supplied whole or resolved from the
    // caller's own video. Half-supplied content is never accepted, and a video
    // reference is authoritative so it cannot be overridden by a pasted URL.
    check(Boolean(value.video_id) !== Boolean(value.content_url),
      'supply either video_id or content_url, not both and not neither');
    if (!value.video_id) check(Boolean(value.content_sha256),
      'content_url requires the matching content_sha256');
  }
  if (name === 'VideoRegistration') {
    const session = String(value.context || '').split('=')[1];
    check(session === value.upload_session_id, 'context must echo the signed upload session');
  }
  if (name === 'Video') {
    check(value.updated_at >= value.created_at, 'updated_at cannot precede created_at');
    check(value.public_id.includes('/'), 'public_id must retain its ContentPort folder prefix');
  }
}
