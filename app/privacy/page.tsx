import type { Metadata } from "next";

import { PublicInformationShell } from "../public-information-shell";
import { PrivacyPolicyContent, privacyPolicyIntro, privacyPolicyUpdated } from "./policy-content";

export const metadata: Metadata = {
  description: "Privacy Policy for Prestige SG Driver, Prestige Limo Sg Customer and Prestige Limo Ops Admin.",
  title: "Privacy Policy | Prestige Limo Ops",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicInformationShell
      eyebrow={privacyPolicyUpdated}
      intro={privacyPolicyIntro}
      title="Privacy Policy"
    >
      <PrivacyPolicyContent />
    </PublicInformationShell>
  );
}
