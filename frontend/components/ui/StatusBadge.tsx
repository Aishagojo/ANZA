import { CheckCircle, Clock } from "lucide-react";
import { OfferStatus } from "@/lib/types";

const CONFIG: Record<
  OfferStatus,
  { label: string; classes: string; icon: React.ReactNode }
> = {
  OPEN: {
    label: "Available",
    classes: "bg-success-bg text-success",
    icon: <CheckCircle size={14} />,
  },
  PAYMENT_PENDING: {
    label: "Payment pending",
    classes: "bg-blue-50 text-brand",
    icon: <Clock size={14} />,
  },
  LICENSED: {
    label: "Licensed",
    classes: "bg-success-bg text-success",
    icon: <CheckCircle size={14} />,
  },
};

/** Small pill shown next to "STATUS" on the offer page (spec section 11). */
export function StatusBadge({ status }: { status: OfferStatus }) {
  const { label, classes, icon } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${classes}`}
    >
      {icon}
      {label}
    </span>
  );
}
