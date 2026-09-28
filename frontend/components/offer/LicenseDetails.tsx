import { User, Calendar, ShieldQuestion, Bitcoin } from "lucide-react";
import { Offer } from "@/lib/types";
import { LICENSE_TYPE_LABELS } from "@/lib/licenseTypes";

/**
 * The label/value grid used on both the public offer page (spec section 11)
 * and the licensed confirmation page (spec section 18) — those two screens
 * show almost the same fields, so this is shared rather than duplicated.
 */
export function LicenseDetails({ offer }: { offer: Offer }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <Field icon={<User size={14} />} label="Licensed To" value={offer.brandName} />
      <Field
        icon={<Calendar size={14} />}
        label="License"
        value={LICENSE_TYPE_LABELS[offer.licenseType]}
      />
      <Field
        icon={<ShieldQuestion size={14} />}
        label="Rights"
        value={offer.licenseDescription}
      />
      <Field
        icon={<Bitcoin size={14} className="text-bitcoin" />}
        label="Price"
        value={`${offer.priceSats.toLocaleString()} sats`}
      />
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {icon} {label}
      </p>
      <p className="text-sm font-medium text-text-primary">{value}</p>
    </div>
  );
}
