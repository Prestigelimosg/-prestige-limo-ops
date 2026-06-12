export type FlightEtaComparisonInput = {
  flightNumber: string;
  serviceType: "MNG";
  previousLatestEtaIso?: string | null;
  normalizedLatestEtaIso?: string | null;
  scheduledArrivalIso?: string | null;
  status?: string | null;
};

export type FlightEtaComparisonResult = {
  setupOnly: true;
  liveUpdateEnabled: false;
  serviceType: "MNG";
  flightNumber: string;
  etaChanged: boolean;
  previousLatestEtaIso: string | null;
  normalizedLatestEtaIso: string | null;
  scheduledArrivalIso: string | null;
  status: string | null;
  driverNotificationAllowed: false;
  adminAlertAllowed: false;
  customerVisible: false;
  notes: string[];
};

export function compareFlightEtaUpdateSetup(
  input: FlightEtaComparisonInput,
): FlightEtaComparisonResult {
  const previousLatestEtaIso = input.previousLatestEtaIso || null;
  const normalizedLatestEtaIso = input.normalizedLatestEtaIso || null;

  return {
    setupOnly: true,
    liveUpdateEnabled: false,
    serviceType: "MNG",
    flightNumber: input.flightNumber.trim().toUpperCase(),
    etaChanged: previousLatestEtaIso !== normalizedLatestEtaIso,
    previousLatestEtaIso,
    normalizedLatestEtaIso,
    scheduledArrivalIso: input.scheduledArrivalIso || null,
    status: input.status?.trim() || null,
    driverNotificationAllowed: false,
    adminAlertAllowed: false,
    customerVisible: false,
    notes: [
      "Setup-only ETA comparison/update foundation.",
      "No database update is made.",
      "No driver notification is sent.",
      "No admin alert is sent.",
      "No customer visibility is enabled.",
    ],
  };
}
