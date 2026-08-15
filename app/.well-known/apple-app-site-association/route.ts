const appleAppSiteAssociation = {
  applinks: {
    details: [
      {
        appIDs: ["U9Y2574Y7S.sg.prestigelimo.drivercompanion"],
        components: [
          {
            "/": "/driver-job/*",
            comment: "Open only the established private Prestige Driver Job path.",
          },
        ],
      },
    ],
  },
  webcredentials: {
    apps: ["U9Y2574Y7S.sg.prestigelimo.drivercompanion"],
  },
} as const;

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(appleAppSiteAssociation), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
