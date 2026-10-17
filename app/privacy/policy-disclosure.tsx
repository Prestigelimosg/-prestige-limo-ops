import { PrivacyPolicyContent, privacyPolicyIntro, privacyPolicyUpdated } from "./policy-content";

// Plain disclosure stays inside the existing Admin WebView route.
export function PrivacyPolicyDisclosure() {
  return (
    <details className="mx-auto mt-6 w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-900">Privacy Policy</summary>
      <article aria-label="Privacy Policy" className="mt-4 space-y-6 break-words leading-7">
        <p className="text-xs text-slate-500">{privacyPolicyUpdated}</p>
        <p>{privacyPolicyIntro}</p>
        <PrivacyPolicyContent />
      </article>
    </details>
  );
}
