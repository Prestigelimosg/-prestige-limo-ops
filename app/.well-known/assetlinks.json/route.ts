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
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "sg.prestigelimo.customer",
      sha256_cert_fingerprints: [
        "A5:CE:3F:8D:E4:9D:46:C3:2B:9C:2C:19:A7:86:9B:30:87:EE:A6:88:02:2E:01:4F:4D:94:98:A3:96:11:D7:3A",
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
