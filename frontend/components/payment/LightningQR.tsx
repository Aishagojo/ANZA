import { QRCodeSVG } from "qrcode.react";

/**
 * Spec section 15 — QR Code: "Display a large QR code generated from
 * `paymentRequest`." A real Lightning wallet scans this exact string.
 */
export function LightningQR({ paymentRequest }: { paymentRequest: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-border bg-white p-4">
      <QRCodeSVG value={paymentRequest} size={160} includeMargin />
    </div>
  );
}
