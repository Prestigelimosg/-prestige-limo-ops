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
      {
        appIDs: ["U9Y2574Y7S.sg.prestigelimo.customer"],
        components: [
          {
            "/": "/api/customer-portal-access/*",
            comment: "Open only the established private Prestige Customer portal access path.",
          },
          {
            "/": "/customer-access/activate",
            comment: "Open only the one-use Prestige SG account activation path.",
          },
          {
            "/": "/my-bookings",
            "?": { booking: "*", tracking: "1" },
            comment: "Open one exact authenticated Customer booking after notification tap.",
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
