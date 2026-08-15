import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Button,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import {
  DriverJobRequestError,
  type DriverDetailsInput,
  type DriverJobDetails,
  type DriverJobStatusAction,
  loadDriverJobDetails,
  nextDriverJobStatusAction,
  parseDriverJobUrl,
  saveAndAcknowledgeDriverJob,
  updateDriverJobStatus,
} from "./src/driver-job-contract";
import {
  readTrackingState,
  startDriverTracking,
  stopDriverTracking,
  stopTrackingAfterTerminalResponse,
} from "./src/tracking";

type ScreenState = {
  active: boolean;
  jobUrl: string | null;
  message: string;
  summary: DriverJobDetails | null;
};

const emptyDriverDetails: DriverDetailsInput = {
  contact: "",
  name: "",
  plate: "",
  vehicleModel: "",
};

const driverStatusActions: DriverJobStatusAction[] = [
  "OTW",
  "OTS",
  "POB",
  "Job Completed",
];

const initialScreenState: ScreenState = {
  active: false,
  jobUrl: null,
  message: "Open the private Driver Job Link sent by Prestige.",
  summary: null,
};

function readableFailure(error: unknown) {
  if (error instanceof DriverJobRequestError) {
    if (error.status === 410) {
      return "This Driver Job link has expired.";
    }
    if (error.status === 401 || error.status === 403) {
      return "This Driver Job link is not active for location sharing.";
    }
  }

  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

export default function App() {
  const [busy, setBusy] = useState(false);
  const [driverDetails, setDriverDetails] =
    useState<DriverDetailsInput>(emptyDriverDetails);
  const [screen, setScreen] = useState<ScreenState>(initialScreenState);

  useEffect(() => {
    let mounted = true;
    let latestRequest = 0;
    let warmLinkReceived = false;

    async function showTrackedJob() {
      const request = ++latestRequest;
      const state = await readTrackingState();

      if (!mounted || request !== latestRequest || !state.job) {
        return;
      }

      try {
        const summary = await loadDriverJobDetails(state.job);

        if (summary.status === "completed") {
          const result = await stopDriverTracking();

          if (mounted && request === latestRequest) {
            setScreen({
              active: false,
              jobUrl: state.job.jobUrl,
              message: result.message,
              summary,
            });
          }
          return;
        }

        if (mounted && request === latestRequest) {
          setScreen({
            active: state.active,
            jobUrl: state.job.jobUrl,
            message: state.active
              ? "Trip tracking is active."
              : "This job is saved, but phone tracking is not active.",
            summary,
          });
        }
      } catch (error) {
        const terminalFailure =
          error instanceof DriverJobRequestError && error.terminal;

        if (terminalFailure) {
          await stopTrackingAfterTerminalResponse();
        }
        if (mounted && request === latestRequest) {
          setScreen({
            active: terminalFailure ? false : state.active,
            jobUrl: state.job.jobUrl,
            message: readableFailure(error),
            summary: null,
          });
        }
      }
    }

    async function receiveDriverJobUrl(incomingUrl: string) {
      const request = ++latestRequest;
      setBusy(true);

      try {
        const incomingJob = parseDriverJobUrl(incomingUrl);
        const trackingState = await readTrackingState();

        if (
          trackingState.active &&
          trackingState.job &&
          trackingState.job.token !== incomingJob.token
        ) {
          const activeSummary = await loadDriverJobDetails(trackingState.job);

          if (mounted && request === latestRequest) {
            setScreen({
              active: true,
              jobUrl: trackingState.job.jobUrl,
              message: "Stop the current trip before opening another job.",
              summary: activeSummary,
            });
          }
          return;
        }

        const summary = await loadDriverJobDetails(incomingJob);
        const sameJobIsActive =
          trackingState.active && trackingState.job?.token === incomingJob.token;

        if (summary.status === "completed" && sameJobIsActive) {
          await stopDriverTracking();
        }

        if (mounted && request === latestRequest) {
          setScreen({
            active: summary.status === "completed" ? false : sameJobIsActive,
            jobUrl: incomingJob.jobUrl,
            message:
              summary.status === "completed"
                ? "This job is already completed and cannot start tracking."
                : sameJobIsActive
                  ? "Trip tracking is active."
                  : "Job link opened. Check the booking below before starting tracking.",
            summary,
          });
        }
      } catch (error) {
        if (mounted && request === latestRequest) {
          setScreen((current) => ({
            ...current,
            message: readableFailure(error),
          }));
        }
      } finally {
        if (mounted && request === latestRequest) {
          setBusy(false);
        }
      }
    }

    const subscription = Linking.addEventListener("url", ({ url }) => {
      warmLinkReceived = true;
      void receiveDriverJobUrl(url);
    });

    async function openInitialJob() {
      try {
        const initialUrl = await Linking.getInitialURL();

        if (!mounted || warmLinkReceived) {
          return;
        }

        if (initialUrl) {
          await receiveDriverJobUrl(initialUrl);
          return;
        }
      } catch {
        if (!mounted || warmLinkReceived) {
          return;
        }
      }

      await showTrackedJob();
    }

    void openInitialJob();

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!screen.summary) {
      return;
    }

    setDriverDetails(screen.summary.assignedDriver);
  }, [screen.summary]);

  async function startTripTracking() {
    setBusy(true);
    try {
      const job = parseDriverJobUrl(screen.jobUrl || "");
      const summary = await loadDriverJobDetails(job);

      if (summary.status === "completed") {
        throw new Error(
          "This job is already completed and cannot start tracking.",
        );
      }

      const result = await startDriverTracking(job);
      setScreen({
        active: result.active,
        jobUrl: job.jobUrl,
        message: result.message,
        summary,
      });
    } catch (error) {
      setScreen((current) => ({
        ...current,
        message: readableFailure(error),
      }));
    } finally {
      setBusy(false);
    }
  }

  function updateDriverDetail(field: keyof DriverDetailsInput, value: string) {
    setDriverDetails((current) => ({ ...current, [field]: value }));
  }

  async function acknowledgeJob() {
    setBusy(true);
    try {
      const job = parseDriverJobUrl(screen.jobUrl || "");
      const summary = await saveAndAcknowledgeDriverJob(job, driverDetails);
      setScreen((current) => ({
        ...current,
        jobUrl: job.jobUrl,
        message: "Job saved and acknowledged.",
        summary,
      }));
    } catch (error) {
      setScreen((current) => ({
        ...current,
        message: readableFailure(error),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function reportDriverStatus(status: DriverJobStatusAction) {
    setBusy(true);
    try {
      const job = parseDriverJobUrl(screen.jobUrl || "");
      const summary = await updateDriverJobStatus(job, status);

      if (status === "Job Completed") {
        await stopTrackingAfterTerminalResponse();
      }

      setScreen({
        active: status === "Job Completed" ? false : screen.active,
        jobUrl: job.jobUrl,
        message: `${status} recorded.`,
        summary,
      });
    } catch (error) {
      setScreen((current) => ({
        ...current,
        message: readableFailure(error),
      }));
    } finally {
      setBusy(false);
    }
  }

  const nextStatusAction = screen.summary
    ? nextDriverJobStatusAction(screen.summary.status)
    : null;

  async function stopTripTracking() {
    setBusy(true);
    try {
      const result = await stopDriverTracking();
      setScreen((current) => ({
        ...current,
        active: false,
        message: result.message,
      }));
    } catch (error) {
      const state = await readTrackingState();
      setScreen((current) => ({
        ...current,
        active: state.active,
        jobUrl: state.job?.jobUrl || current.jobUrl,
        message: readableFailure(error),
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        style={styles.safeArea}
      >
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>PRESTIGE LIMO</Text>
          <Text style={styles.title}>Driver Companion</Text>
          <Text style={styles.intro}>
            Keep the admin live map updated for one assigned job while your
            device screen is locked.
          </Text>

          <View
            style={[
              styles.statusCard,
              screen.active && styles.statusCardActive,
            ]}
          >
            <Text style={styles.statusLabel}>
              {screen.active ? "TRACKING ACTIVE" : "TRACKING OFF"}
            </Text>
            <Text style={styles.statusMessage}>{screen.message}</Text>
          </View>

          {screen.summary ? (
            <View style={styles.jobCard}>
              <Text style={styles.reference}>{screen.summary.reference}</Text>
              {screen.summary.bookingTypeLabel ? (
                <Text style={styles.jobType}>
                  {screen.summary.bookingTypeLabel}
                </Text>
              ) : null}
              <Text style={styles.jobLine}>
                {screen.summary.pickupDateTime}
              </Text>
              <Text style={styles.jobLine}>
                Passenger: {screen.summary.passengerName}
              </Text>
              {screen.summary.flightNumber ? (
                <Text style={styles.jobLine}>
                  Flight: {screen.summary.flightNumber}
                </Text>
              ) : null}
              <Text style={styles.routeLabel}>ROUTE</Text>
              <Text style={styles.jobLine}>
                Pickup: {screen.summary.pickupLocation || "TBC"}
              </Text>
              {screen.summary.waypoints.map((waypoint, index) => (
                <Text key={`${waypoint}-${index}`} style={styles.jobLine}>
                  Stop {index + 1}: {waypoint}
                </Text>
              ))}
              <Text style={styles.jobLine}>
                Drop-off: {screen.summary.dropoffLocation || "TBC"}
              </Text>
              <Text style={styles.routeSummary}>{screen.summary.route}</Text>
              <Text style={styles.jobStatus}>
                Job status: {screen.summary.statusLabel}
              </Text>
            </View>
          ) : null}

          {screen.summary && screen.jobUrl ? (
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Driver confirmation</Text>
              <Text style={styles.permissionText}>
                Confirm the driver and vehicle for this exact job before
                reporting status.
              </Text>
              <Text style={styles.inputLabel}>Driver name</Text>
              <TextInput
                autoCapitalize="words"
                editable={!busy}
                onChangeText={(value) => updateDriverDetail("name", value)}
                placeholder="Driver name"
                style={styles.input}
                value={driverDetails.name}
              />
              <Text style={styles.inputLabel}>Contact</Text>
              <TextInput
                editable={!busy}
                keyboardType="phone-pad"
                onChangeText={(value) => updateDriverDetail("contact", value)}
                placeholder="Contact number"
                style={styles.input}
                value={driverDetails.contact}
              />
              <Text style={styles.inputLabel}>Plate</Text>
              <TextInput
                autoCapitalize="characters"
                editable={!busy}
                onChangeText={(value) => updateDriverDetail("plate", value)}
                placeholder="Vehicle plate"
                style={styles.input}
                value={driverDetails.plate}
              />
              <Text style={styles.inputLabel}>Vehicle</Text>
              <TextInput
                autoCapitalize="words"
                editable={!busy}
                onChangeText={(value) =>
                  updateDriverDetail("vehicleModel", value)
                }
                placeholder="Vehicle model"
                style={styles.input}
                value={driverDetails.vehicleModel}
              />
              <Button
                disabled={busy}
                title="Save & Acknowledge Job"
                onPress={acknowledgeJob}
              />
              <Text style={styles.acknowledgementState}>
                {screen.summary.acknowledged
                  ? "Acknowledged"
                  : "Acknowledgement required"}
              </Text>
            </View>
          ) : null}

          {screen.summary?.acknowledged ? (
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Job reporting</Text>
              <Text style={styles.permissionText}>
                Report each step in order. Only the next required step is
                available.
              </Text>
              <View style={styles.statusActions}>
                {driverStatusActions.map((action) => (
                  <View key={action} style={styles.statusAction}>
                    <Button
                      disabled={busy || nextStatusAction !== action}
                      title={action}
                      onPress={() => reportDriverStatus(action)}
                    />
                  </View>
                ))}
              </View>
              {screen.summary.statusHistory.length ? (
                <View style={styles.history}>
                  {screen.summary.statusHistory.map((item, index) => (
                    <Text
                      key={`${item.status}-${item.occurredAt}-${index}`}
                      style={styles.historyLine}
                    >
                      {item.statusLabel}
                      {item.occurredAt ? ` · ${item.occurredAt}` : ""}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {!screen.active &&
          screen.jobUrl &&
          screen.summary?.acknowledged &&
          screen.summary.status !== "completed" ? (
            <View style={styles.formCard}>
              <Text style={styles.permissionText}>
                Tracking does not start automatically. After checking the exact
                booking, tap Start and allow precise location plus Always /
                Allow all the time.
              </Text>
              <Button
                disabled={busy}
                title="Start trip tracking"
                onPress={startTripTracking}
              />
            </View>
          ) : screen.active ? (
            <View style={styles.formCard}>
              <Text style={styles.permissionText}>
                iOS shows its location indicator. Android keeps a visible
                notification while tracking runs.
              </Text>
              <Button
                disabled={busy}
                title="Stop trip tracking"
                color="#b91c1c"
                onPress={stopTripTracking}
              />
            </View>
          ) : null}

          <Text style={styles.warning}>
            Force-quitting the app, switching off Location Services, or revoking
            permission can stop updates. The admin map will then show the last
            update as stale or offline.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#f8fafc", flex: 1 },
  page: {
    alignSelf: "center",
    gap: 14,
    maxWidth: 720,
    padding: 20,
    paddingBottom: 36,
    width: "100%",
  },
  eyebrow: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: { color: "#0f172a", fontSize: 28, fontWeight: "800" },
  intro: { color: "#475569", fontSize: 16, lineHeight: 23 },
  statusCard: { backgroundColor: "#e2e8f0", borderRadius: 14, padding: 16 },
  statusCardActive: { backgroundColor: "#ccfbf1" },
  statusLabel: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  statusMessage: {
    color: "#1e293b",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 5,
  },
  jobCard: {
    backgroundColor: "#fff",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    padding: 16,
  },
  reference: { color: "#0f172a", fontSize: 18, fontWeight: "800" },
  jobType: { color: "#475569", fontSize: 13, fontWeight: "700" },
  jobLine: { color: "#334155", fontSize: 15, lineHeight: 21 },
  routeLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 7,
  },
  routeSummary: {
    color: "#334155",
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
    marginTop: 3,
  },
  jobStatus: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  formCard: { backgroundColor: "#fff", borderRadius: 14, gap: 12, padding: 16 },
  sectionTitle: { color: "#0f172a", fontSize: 17, fontWeight: "800" },
  permissionText: { color: "#475569", fontSize: 14, lineHeight: 20 },
  inputLabel: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: -7,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  acknowledgementState: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  statusActions: { gap: 8 },
  statusAction: { width: "100%" },
  history: {
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 5,
    paddingTop: 10,
  },
  historyLine: { color: "#475569", fontSize: 13, lineHeight: 18 },
  warning: { color: "#7c2d12", fontSize: 13, lineHeight: 19, marginTop: 2 },
});
