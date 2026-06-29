import { loadPublicCompanyProfile } from "../../../lib/company-profile-persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await loadPublicCompanyProfile();

  return Response.json(result);
}
