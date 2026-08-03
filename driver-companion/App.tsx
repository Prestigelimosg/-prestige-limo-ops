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
  type DriverJobSummary,
  loadDriverJobSummary,
  parseDriverJobUrl,
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
  summary: DriverJobSummary | null;
};

const initialScreenState: ScreenState = {
  active: false,
  jobUrl: null,
  message: "Paste the private Driver Job URL for the exact assigned job.",
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
  const [privateJobUrl, setPrivateJobUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<ScreenState>(initialScreenState);

  useEffect(() => {
    let mounted = true;

    async function restoreTrackingState() {
      const state = await readTrackingState();

      if (!mounted || !state.job) {
        return;
      }

      try {
        const summary = await loadDriverJobSummary(state.job);

        if (summary.status === "completed") {
          const result = await stopDriverTracking();

          if (mounted) {
            setScreen({
              active: false,
              jobUrl: state.job.jobUrl,
              message: result.message,
              summary,
            });
          }
          return;
        }

        if (mounted) {
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
        if (mounted) {
          setScreen({
            active: terminalFailure ? false : state.active,
            jobUrl: state.job.jobUrl,
            message: readableFailure(error),
            summary: null,
          });
        }
      }
    }

    void restoreTrackingState();

    return () => {
      mounted = false;
    };
  }, []);

  async function checkJob() {
    setBusy(true);
    try {
      const job = parseDriverJobUrl(privateJobUrl);
      const summary = await loadDriverJobSummary(job);
      setScreen({
        active: false,
        jobUrl: job.jobUrl,
        message: "Check the booking below before starting tracking.",
        summary,
      });
    } catch (error) {
      setScreen({ ...initialScreenState, message: readableFailure(error) });
    } finally {
      setBusy(false);
    }
  }

  async function startTripTracking() {
    setBusy(true);
    try {
      const job = parseDriverJobUrl(privateJobUrl || screen.jobUrl || "");
      const summary = await loadDriverJobSummary(job);

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
      if (result.active) {
        setPrivateJobUrl("");
      }
    } catch (error) {
      setScreen((current) => ({
        ...current,
        message: readableFailure(error),
      }));
    } finally {
      setBusy(false);
    }
  }

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
            phone screen is locked.
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
              <Text style={styles.jobLine}>
                {screen.summary.pickupDateTime}
              </Text>
              <Text style={styles.jobLine}>
                Passenger: {screen.summary.passengerName}
              </Text>
              <Text style={styles.jobLine}>{screen.summary.route}</Text>
              <Text style={styles.jobStatus}>
                Job status: {screen.summary.statusLabel}
              </Text>
            </View>
          ) : null}

          {!screen.active ? (
            <View style={styles.formCard}>
              <Text style={styles.formLabel}>Private Driver Job URL</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onChangeText={setPrivateJobUrl}
                placeholder="https://app.prestigelimo.sg/driver-job/..."
                style={styles.input}
                value={privateJobUrl}
              />
              <View style={styles.buttonGap}>
                <Button
                  disabled={busy || !privateJobUrl.trim()}
                  title="Check job"
                  onPress={checkJob}
                />
              </View>
              <Text style={styles.permissionText}>
                Tracking does not start automatically. After checking the exact
                booking, tap Start and allow precise location plus Always /
                Allow all the time.
              </Text>
              <Button
                disabled={busy || (!privateJobUrl.trim() && !screen.jobUrl)}
                title="Start trip tracking"
                onPress={startTripTracking}
              />
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.permissionText}>
                iPhone shows its location indicator. Android keeps a visible
                notification while tracking runs.
              </Text>
              <Button
                disabled={busy}
                title="Stop trip tracking"
                color="#b91c1c"
                onPress={stopTripTracking}
              />
            </View>
          )}

          {screen.jobUrl ? (
            <View style={styles.secondaryButton}>
              <Button
                title="Open Driver Job reporting"
                onPress={() => Linking.openURL(screen.jobUrl!)}
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
  page: { gap: 14, padding: 20, paddingBottom: 36 },
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
  jobLine: { color: "#334155", fontSize: 15, lineHeight: 21 },
  jobStatus: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  formCard: { backgroundColor: "#fff", borderRadius: 14, gap: 12, padding: 16 },
  formLabel: { color: "#0f172a", fontSize: 14, fontWeight: "700" },
  input: {
    borderColor: "#94a3b8",
    borderRadius: 10,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonGap: { marginBottom: 2 },
  permissionText: { color: "#475569", fontSize: 14, lineHeight: 20 },
  secondaryButton: { marginTop: -2 },
  warning: { color: "#7c2d12", fontSize: 13, lineHeight: 19, marginTop: 2 },
});
