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
}
