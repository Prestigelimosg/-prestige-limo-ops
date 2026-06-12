export type FlightEtaNormalizationProvider = "flightaware-aeroapi";

export type FlightEtaNormalizationInput = {
  provider: FlightEtaNormalizationProvider;
  flightNumber: string;
  serviceType: "MNG";
  rawEstimatedArrivalIso?: string | null;
  rawScheduledArrivalIso?: string | null;
  rawStatus?: string | null;
};

export type FlightEtaNormalizationResult = {
  setupOnly: true;
  liveLookupEnabled: false;
  provider: FlightEtaNormalizationProvider;
  flightNumber: string;
  serviceType: "MNG";
  latestEtaIso: string | null;
  scheduledArrivalIso: string | null;
  status: string | null;
  customerVisible: false;
  notes: string[];
};

export function normalizeFlightEtaResultSetup(
  input: FlightEtaNormalizationInput,
): FlightEtaNormalizationResult {
  return {
    setupOnly: true,
    liveLookupEnabled: false,
    provider: input.provider,
    flightNumber: input.flightNumber.trim().toUpperCase(),
    serviceType: "MNG",
    latestEtaIso: input.rawEstimatedArrivalIso || null,
    scheduledArrivalIso: input.rawScheduledArrivalIso || null,
    status: input.rawStatus?.trim() || null,
    customerVisible: false,
    notes: [
      "Setup-only ETA result normalization foundation.",
      "No FlightAware token/env is read.",
      "No external API call is made.",
      "No live ETA lookup, scheduler, notification, resend, admin alert, or replacement-driver action is active.",
    ],
  };
}
