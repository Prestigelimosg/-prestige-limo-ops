export const driverJobIssueChoices = [
  { label: "Cannot find passenger", value: "cannot_find_passenger" },
  { label: "Passenger no-show", value: "passenger_no_show" },
  { label: "Passenger late", value: "passenger_late" },
  { label: "Flight or pickup timing changed", value: "flight_or_pickup_timing_changed" },
  { label: "Route or itinerary changed", value: "route_or_itinerary_changed" },
  { label: "Vehicle issue", value: "vehicle_issue" },
  { label: "Traffic delay", value: "traffic_delay" },
  { label: "Accident / safety concern", value: "accident_or_safety_concern" },
  { label: "Other issue", value: "other_issue" },
] as const;

export type DriverJobIssueChoice = (typeof driverJobIssueChoices)[number];
export type DriverJobIssueType = DriverJobIssueChoice["value"];

const driverJobIssueChoiceByValue = new Map<string, DriverJobIssueChoice>(
  driverJobIssueChoices.map((choice) => [choice.value, choice]),
);

export function getDriverJobIssueChoice(value: unknown) {
  return typeof value === "string" ? driverJobIssueChoiceByValue.get(value) || null : null;
}
