const androidAppLinksAssociation = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "sg.prestigelimo.drivercompanion",
      sha256_cert_fingerprints: [
        "2C:15:46:61:3E:14:DA:3E:CB:C0:F9:0D:2A:30:6E:B7:C3:F8:13:D5:53:EF:E6:C3:7C:95:B7:C9:8F:42:24:24",
      ],
    },
  },
] as const;

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(androidAppLinksAssociation), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
