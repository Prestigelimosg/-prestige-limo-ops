import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Button,
  BackHandler,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from "react-native-webview";

import {
  DriverJobRequestError,
  productionOrigin,
  registerNativeDriverNotifications,
  unregisterNativeDriverNotifications,
} from "./src/driver-job-contract";
import {
  driverNativeBiometricResultScript,
  driverNativeJobOpenResultScript,
  driverNativeNotificationResultScript,
  driverTrackingResultScript,
  embeddedDriverBridgeBootstrap,
  parseDriverBridgeMessage,
  parseDriverJobUrl,
  parseNativeCalendarOauthStartUrl,
  parseNativeDriverJobHandoffUrl,
  shouldAllowDriverWebViewNavigation,
  type DriverTrackingBridgeMessage,
} from "./src/driver-webview-bridge";
import {
  authenticateDriverAppUnlock,
  enableDriverBiometricUnlock,
  isDriverBiometricUnlockEnabled,
  readOrCreateDriverInstallationId,
} from "./src/driver-installation";
import {
  beginDriverBiometricAttempt,
  createDriverBiometricLifecycle,
  finishDriverBiometricAttempt,
  readDriverBiometricMonotonicTimeMs,
  transitionDriverBiometricAppState,
} from "./src/driver-biometric-lifecycle";
import {
  forgetNativeNotificationToken,
  loadNativeDriverJob,
  nativeDriverJobHandoffUrl,
  nativeNotificationOpenRequest,
  readNativeNotificationToken,
  rememberNativeDriverJob,
  rememberNativeNotificationToken,
} from "./src/native-notifications";
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
  navigationKey: number;
  openTarget: "available_jobs" | "messages" | null;
};

const initialScreenState: ScreenState = {
  active: false,
  jobUrl: `${productionOrigin}/driver-portal`,
  message: "Driver Portal is ready.",
  navigationKey: 0,
  openTarget: null,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

function baseDriverJobUrl(value: string) {
  const job = parseDriverJobUrl(value);
  return `${job.origin}/driver-job/${encodeURIComponent(job.token)}`;
}

export default function App() {
  const [canGoBack, setCanGoBack] = useState(false);
  const [screen, setScreen] = useState<ScreenState>(initialScreenState);
  const [installationId, setInstallationId] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [unlockState, setUnlockState] = useState<"checking" | "ready" | "locked">("checking");
  const [driverWebViewMounted, setDriverWebViewMounted] = useState(false);
  const biometricEnabledRef = useRef(false);
  const biometricLifecycleRef = useRef(
    createDriverBiometricLifecycle(AppState.currentState),
  );
  const unlockStateRef = useRef<"checking" | "ready" | "locked">("checking");
  const bridgeBusyRef = useRef(false);
  const currentWebViewUrlRef = useRef(initialScreenState.jobUrl || "");
  const webViewRequestHeadersRef = useRef<Record<string, string> | null>(null);
  const pendingOauthTokenRef = useRef("");
  const webViewRef = useRef<WebView>(null);

  const setDriverUnlockState = useCallback(
    (nextState: "checking" | "ready" | "locked") => {
      unlockStateRef.current = nextState;
      setUnlockState(nextState);
      if (nextState === "ready") setDriverWebViewMounted(true);
    },
    [],
  );

  const unlockDriverApp = useCallback(async () => {
    const attemptId = beginDriverBiometricAttempt(biometricLifecycleRef.current);
    if (attemptId === null) return;

    setDriverUnlockState("checking");
    const unlocked = await authenticateDriverAppUnlock().catch(() => false);
    const currentAttempt = finishDriverBiometricAttempt(
      biometricLifecycleRef.current,
      attemptId,
    );
    if (currentAttempt) {
      setDriverUnlockState(unlocked ? "ready" : "locked");
    }
  }, [setDriverUnlockState]);

  useEffect(() => {
    let mounted = true;

    async function prepareInstallation() {
      try {
        const nextInstallationId = await readOrCreateDriverInstallationId();
        const [biometricEnabled, notificationToken] = await Promise.all([
          isDriverBiometricUnlockEnabled(),
          readNativeNotificationToken(),
        ]);
        if (!mounted) return;

        biometricEnabledRef.current = biometricEnabled;
        setBiometricEnabled(biometricEnabled);
        setNotificationEnabled(Boolean(notificationToken));
        setInstallationId(nextInstallationId);
        if (!biometricEnabled) {
          setDriverUnlockState("ready");
          return;
        }

        const attemptId = beginDriverBiometricAttempt(biometricLifecycleRef.current);
        if (attemptId === null) {
          setDriverUnlockState("locked");
          return;
        }
        const unlocked = await authenticateDriverAppUnlock().catch(() => false);
        const currentAttempt = finishDriverBiometricAttempt(
          biometricLifecycleRef.current,
          attemptId,
        );
        if (mounted && currentAttempt) {
          setDriverUnlockState(unlocked ? "ready" : "locked");
        }
      } catch {
        if (mounted) setDriverUnlockState("locked");
      }
    }

    void prepareInstallation();
    return () => { mounted = false; };
  }, [setDriverUnlockState]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const action = transitionDriverBiometricAppState(
        biometricLifecycleRef.current,
        nextState,
        biometricEnabledRef.current,
        readDriverBiometricMonotonicTimeMs(),
        unlockStateRef.current === "ready",
      );

      if (action === "lock") setDriverUnlockState("locked");
      if (action === "reveal") setDriverUnlockState("ready");
      if (action === "unlock") void unlockDriverApp();
    });

    return () => subscription.remove();
  }, [setDriverUnlockState, unlockDriverApp]);

  const receiveDriverJobUrl = useCallback(async (
    incomingUrl: string,
    openTarget: ScreenState["openTarget"] = null,
  ) => {
    try {
      const incomingJob = parseDriverJobUrl(incomingUrl);
      const trackingState = await readTrackingState();

      if (
        trackingState.active &&
        trackingState.job &&
        trackingState.job.token !== incomingJob.token
      ) {
        setScreen((current) => ({
          active: true,
          jobUrl: trackingState.job!.jobUrl,
          message: "Stop the current trip before opening another job.",
          navigationKey: current.navigationKey + 1,
          openTarget: null,
        }));
        return;
      }

      if (incomingJob.jobUrl.includes("?calendar=")) {
        pendingOauthTokenRef.current = "";
      }

      currentWebViewUrlRef.current = incomingJob.jobUrl;
      webViewRequestHeadersRef.current = null;
      setCanGoBack(false);
      setScreen((current) => ({
        active:
          trackingState.active && trackingState.job?.token === incomingJob.token,
        jobUrl: incomingJob.jobUrl,
        message:
          trackingState.active && trackingState.job?.token === incomingJob.token
            ? "Trip tracking is active."
            : "Private Driver Job opened securely in Prestige Driver.",
        navigationKey: current.navigationKey + 1,
        openTarget,
      }));
    } catch (error) {
      setScreen((current) => ({
        ...current,
        message: readableFailure(error),
        openTarget: null,
      }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let warmLinkReceived = false;

    const subscription = Linking.addEventListener("url", ({ url }) => {
      warmLinkReceived = true;
      if (mounted) {
        void receiveDriverJobUrl(url);
      }
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

      const trackingState = await readTrackingState();

      if (mounted && trackingState.active && trackingState.job) {
        currentWebViewUrlRef.current = trackingState.job.jobUrl;
        setScreen((current) => ({
          active: true,
          jobUrl: trackingState.job!.jobUrl,
          message: "Trip tracking is active.",
          navigationKey: current.navigationKey + 1,
          openTarget: null,
        }));
      }
    }

    void openInitialJob();

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [receiveDriverJobUrl]);

  useEffect(() => {
    if (!installationId) {
      return;
    }

    let mounted = true;

    const openNotificationData = async (data: unknown) => {
      const request = nativeNotificationOpenRequest(data);
      if (!request) {
        return;
      }

      if (request.openTarget === "available_jobs") {
        const portalUrl = `${productionOrigin}/driver-portal?view=available-jobs`;
        currentWebViewUrlRef.current = portalUrl;
        webViewRequestHeadersRef.current = {};
        setCanGoBack(false);
        setScreen((current) => ({
          active: false,
          jobUrl: portalUrl,
          message: "Opening available jobs.",
          navigationKey: current.navigationKey + 1,
          openTarget: null,
        }));
        return;
      }

      const job = await loadNativeDriverJob(request.jobKey);
      if (mounted && job) {
        await receiveDriverJobUrl(job.jobUrl, request.openTarget);
        return;
      }

      if (mounted && installationId) {
        const handoffUrl = nativeDriverJobHandoffUrl(request.jobKey);
        currentWebViewUrlRef.current = handoffUrl;
        webViewRequestHeadersRef.current = {
          "x-prestige-driver-installation-id": installationId,
          "x-prestige-driver-purpose": "driver-native-job-open",
        };
        setCanGoBack(false);
        setScreen((current) => ({
          active: false,
          jobUrl: handoffUrl,
          message: "Opening the assigned job securely.",
          navigationKey: current.navigationKey + 1,
          openTarget: request.openTarget,
        }));
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void Notifications.setBadgeCountAsync(0).catch(() => false);
        void openNotificationData(response.notification.request.content.data);
      },
    );
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        if (
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          data.driver_pool_refresh === true
        ) {
          void openNotificationData(data);
        }
      },
    );

    try {
      const initialResponse = Notifications.getLastNotificationResponse();
      if (initialResponse) {
        void Notifications.setBadgeCountAsync(0).catch(() => false);
        void openNotificationData(initialResponse.notification.request.content.data)
          .finally(() => Notifications.clearLastNotificationResponse());
      }
    } catch {
      // A notification response is optional; ordinary exact-link opening remains available.
    }

    return () => {
      mounted = false;
      subscription.remove();
      receivedSubscription.remove();
    };
  }, [installationId, receiveDriverJobUrl]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!canGoBack) {
          return false;
        }

        webViewRef.current?.goBack();
        return true;
      },
    );

    return () => subscription.remove();
  }, [canGoBack]);

  const sendTrackingResult = useCallback(
    (
      request: DriverTrackingBridgeMessage["type"],
      result: { active: boolean; message: string; ok: boolean },
    ) => {
      webViewRef.current?.injectJavaScript(
        driverTrackingResultScript({ request, ...result }),
      );
    },
    [],
  );

  const sendNativeNotificationResult = useCallback(
    (result: { ok: boolean; state: "denied" | "enabled" | "failed" }) => {
      webViewRef.current?.injectJavaScript(
        driverNativeNotificationResultScript(result),
      );
    },
    [],
  );

  const sendNativeJobOpenResult = useCallback(
    (result: { jobKey: string; ok: boolean }) => {
      webViewRef.current?.injectJavaScript(
        driverNativeJobOpenResultScript(result),
      );
    },
    [],
  );

  const handleBridgeMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      const request = parseDriverBridgeMessage(event.nativeEvent.data);
      const currentWebViewUrl = currentWebViewUrlRef.current;

      if (!request || !currentWebViewUrl) {
        return;
      }

      if (
        request.type === "native_job_open" &&
        currentWebViewUrl !== `${productionOrigin}/driver-portal`
      ) {
        sendNativeJobOpenResult({ jobKey: request.jobKey, ok: false });
        return;
      }

      if (request.type === "native_notifications_register") {
        const requestedFromPortal = currentWebViewUrl === `${productionOrigin}/driver-portal`;
        if (requestedFromPortal !== Boolean(request.jobKey)) {
          sendNativeNotificationResult({ ok: false, state: "failed" });
          return;
        }
      }

      if (request.type === "native_job_remember") {
        try {
          const currentJob = parseDriverJobUrl(currentWebViewUrl);
          await rememberNativeDriverJob(request.jobKey, currentJob);
        } catch {
          // The exact private-page enrollment is best effort and never exposes its URL.
        }
        return;
      }

      if (bridgeBusyRef.current) {
        if (request.type === "native_biometrics_enable") {
          webViewRef.current?.injectJavaScript(
            driverNativeBiometricResultScript({ ok: false }),
          );
        } else if (request.type === "native_notifications_register") {
          sendNativeNotificationResult({ ok: false, state: "failed" });
        } else if (request.type === "native_job_open") {
          sendNativeJobOpenResult({ jobKey: request.jobKey, ok: false });
        } else {
          sendTrackingResult(request.type, {
            active: screen.active,
            message: "Another tracking action is still running.",
            ok: false,
          });
        }
        return;
      }

      bridgeBusyRef.current = true;

      try {
        if (request.type === "native_job_open") {
          const storedJob = await loadNativeDriverJob(request.jobKey);
          if (!storedJob) {
            sendNativeJobOpenResult({ jobKey: request.jobKey, ok: false });
            return;
          }
          await receiveDriverJobUrl(storedJob.jobUrl);
          return;
        }

        if (request.type === "native_biometrics_enable") {
          const attemptId = beginDriverBiometricAttempt(
            biometricLifecycleRef.current,
          );
          if (attemptId === null) {
            webViewRef.current?.injectJavaScript(
              driverNativeBiometricResultScript({ ok: false }),
            );
            return;
          }
          const enabled = await enableDriverBiometricUnlock().catch(() => false);
          const currentAttempt = finishDriverBiometricAttempt(
            biometricLifecycleRef.current,
            attemptId,
          );
          if (!currentAttempt) return;
          if (enabled) {
            biometricEnabledRef.current = true;
            setBiometricEnabled(true);
          }
          webViewRef.current?.injectJavaScript(
            driverNativeBiometricResultScript({ ok: enabled }),
          );
          return;
        }

        if (request.type === "native_notifications_register") {
          const job = request.jobKey
            ? await loadNativeDriverJob(request.jobKey)
            : parseDriverJobUrl(currentWebViewUrl);
          if (!job) {
            sendNativeNotificationResult({ ok: false, state: "failed" });
            return;
          }
          const existingToken = await readNativeNotificationToken();
          const permission = await Notifications.requestPermissionsAsync();

          if (!permission.granted) {
            if (existingToken) {
              await unregisterNativeDriverNotifications(job, existingToken);
              await forgetNativeNotificationToken();
            }
            setNotificationEnabled(false);
            sendNativeNotificationResult({ ok: false, state: "denied" });
            return;
          }

          const projectId =
            Constants.easConfig?.projectId ||
            Constants.expoConfig?.extra?.eas?.projectId;
          if (typeof projectId !== "string" || !projectId) {
            throw new Error("Native notification project identity is unavailable.");
          }

          const tokenResult = await Notifications.getExpoPushTokenAsync({
            projectId,
          });
          const nextToken = tokenResult.data;
          if (existingToken && existingToken !== nextToken) {
            await unregisterNativeDriverNotifications(job, existingToken);
          }

          const registration = await registerNativeDriverNotifications(
            job,
            nextToken,
          );
          try {
            await rememberNativeDriverJob(registration.jobKey, job);
            await rememberNativeNotificationToken(nextToken);
          } catch (error) {
            await unregisterNativeDriverNotifications(job, nextToken).catch(
              () => undefined,
            );
            throw error;
          }
          setNotificationEnabled(true);
          sendNativeNotificationResult({ ok: true, state: "enabled" });
          return;
        }

        if (request.type === "tracking_terminal") {
          await stopTrackingAfterTerminalResponse();
          const message = "Trip tracking stopped after Job Completed.";
          setScreen((current) => ({ ...current, active: false, message }));
          sendTrackingResult(request.type, { active: false, message, ok: true });
          return;
        }

        const job = parseDriverJobUrl(currentWebViewUrl);
        const result =
          request.type === "tracking_start"
            ? await startDriverTracking(job)
            : await stopDriverTracking();

        setScreen((current) => ({
          ...current,
          active: result.active,
          message: result.message,
        }));
        sendTrackingResult(request.type, {
          active: result.active,
          message: result.message,
          ok: request.type === "tracking_stop" || result.active,
        });
      } catch (error) {
        if (error instanceof DriverJobRequestError && error.terminal) {
          await stopTrackingAfterTerminalResponse();
        }

        const trackingState = await readTrackingState();
        const message = readableFailure(error);
        setScreen((current) => ({
          ...current,
          active: trackingState.active,
          message,
        }));
        if (request.type === "native_biometrics_enable") {
          webViewRef.current?.injectJavaScript(
            driverNativeBiometricResultScript({ ok: false }),
          );
        } else if (request.type === "native_notifications_register") {
          sendNativeNotificationResult({ ok: false, state: "failed" });
        } else if (request.type === "native_job_open") {
          sendNativeJobOpenResult({ jobKey: request.jobKey, ok: false });
        } else {
          sendTrackingResult(request.type, {
            active: trackingState.active,
            message,
            ok: false,
          });
        }
      } finally {
        bridgeBusyRef.current = false;
      }
    },
    [
      receiveDriverJobUrl,
      screen.active,
      sendNativeJobOpenResult,
      sendNativeNotificationResult,
      sendTrackingResult,
    ],
  );

  const openCalendarAuthorization = useCallback(
    async (requestedUrl: string) => {
      const safeStartUrl = parseNativeCalendarOauthStartUrl(requestedUrl);
      const currentWebViewUrl = currentWebViewUrlRef.current;

      if (!safeStartUrl || !currentWebViewUrl) {
        return;
      }

      if (pendingOauthTokenRef.current) {
        return;
      }

      const callbackUrl = baseDriverJobUrl(currentWebViewUrl);
      const callbackJob = parseDriverJobUrl(callbackUrl);
      pendingOauthTokenRef.current = callbackJob.token;

      try {
        const result = await WebBrowser.openAuthSessionAsync(
          safeStartUrl,
          callbackUrl,
          { preferUniversalLinks: true },
        );

        if (result.type === "success" && "url" in result && result.url) {
          await receiveDriverJobUrl(result.url);
          return;
        }

        if (pendingOauthTokenRef.current === callbackJob.token) {
          pendingOauthTokenRef.current = "";
          await receiveDriverJobUrl(`${callbackUrl}?calendar=error`);
        }
      } catch {
        if (pendingOauthTokenRef.current === callbackJob.token) {
          pendingOauthTokenRef.current = "";
          await receiveDriverJobUrl(`${callbackUrl}?calendar=error`);
        }
      }
    },
    [receiveDriverJobUrl],
  );

  const shouldStartNavigation = useCallback(
    (request: { url: string }) => {
      const currentWebViewUrl = currentWebViewUrlRef.current;
      if (!currentWebViewUrl) {
        return false;
      }

      if (parseNativeCalendarOauthStartUrl(request.url)) {
        void openCalendarAuthorization(request.url);
        return false;
      }

      const allowed = shouldAllowDriverWebViewNavigation(request.url, currentWebViewUrl);
      if (allowed) {
        try {
          currentWebViewUrlRef.current = parseDriverJobUrl(request.url).jobUrl;
          webViewRequestHeadersRef.current = null;
        } catch {
          const requested = new URL(request.url);
          if (requested.origin === productionOrigin && requested.pathname === "/driver-portal") {
            currentWebViewUrlRef.current = `${productionOrigin}/driver-portal`;
            webViewRequestHeadersRef.current = null;
          } else if (parseNativeDriverJobHandoffUrl(request.url)) {
            currentWebViewUrlRef.current = request.url;
          }
        }
      }
      return allowed;
    },
    [openCalendarAuthorization],
  );

  const updateNavigationState = useCallback((navigation: WebViewNavigation) => {
    setCanGoBack(navigation.canGoBack);
  }, []);

  const webLayerLocked = unlockState !== "ready";

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <View
          accessibilityElementsHidden={webLayerLocked}
          importantForAccessibility={webLayerLocked ? "no-hide-descendants" : "auto"}
          pointerEvents={webLayerLocked ? "none" : "auto"}
          style={[styles.webLayer, webLayerLocked ? styles.hiddenWebLayer : null]}
        >
          <SafeAreaView
            edges={["top", "right", "bottom", "left"]}
            style={styles.safeArea}
          >
            <View style={styles.roleBar}>
              <View>
                <Text style={styles.eyebrow}>PRESTIGE LIMO</Text>
                <Text style={styles.title}>Prestige Driver</Text>
              </View>
              <View style={screen.active ? styles.activePill : styles.inactivePill}>
                <Text style={styles.pillText}>
                  {screen.active ? "TRACKING ON" : "TRACKING OFF"}
                </Text>
              </View>
            </View>

            {driverWebViewMounted && screen.jobUrl ? (
              <WebView
                key={screen.navigationKey}
                ref={webViewRef}
                allowFileAccess
                allowsBackForwardNavigationGestures
                geolocationEnabled={false}
                injectedJavaScriptBeforeContentLoaded={embeddedDriverBridgeBootstrap(
                  installationId,
                  biometricEnabled,
                  notificationEnabled,
                  screen.openTarget,
                )}
                javaScriptCanOpenWindowsAutomatically={false}
                mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
                onMessage={handleBridgeMessage}
                onNavigationStateChange={updateNavigationState}
                onShouldStartLoadWithRequest={shouldStartNavigation}
                originWhitelist={[productionOrigin]}
                setSupportMultipleWindows={false}
                sharedCookiesEnabled
                source={{
                  ...(webViewRequestHeadersRef.current
                    ? { headers: webViewRequestHeadersRef.current }
                    : {}),
                  uri: currentWebViewUrlRef.current || screen.jobUrl,
                }}
                style={styles.webView}
              />
            ) : driverWebViewMounted ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Open your private Driver Job Link</Text>
                <Text style={styles.emptyMessage}>{screen.message}</Text>
                <Text style={styles.emptyHelp}>
                  The safe job card, acknowledgement, Calendar, messages, status
                  reporting, OTS photo and issue controls will stay inside this app.
                  Tracking does not start automatically. Force-quitting the app,
                  switching off Location Services, or revoking permission can stop
                  updates after you start sharing.
                </Text>
              </View>
            ) : null}
          </SafeAreaView>
        </View>

        {webLayerLocked ? (
          <SafeAreaView style={styles.lockOverlay}>
            {unlockState === "locked" ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Prestige Driver is locked</Text>
                <Text style={styles.emptyMessage}>
                  Use Face ID to unlock this approved Driver installation.
                </Text>
                <Button onPress={() => void unlockDriverApp()} title="Unlock with Face ID" />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Securing Prestige Driver…</Text>
              </View>
            )}
          </SafeAreaView>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "#f8fafc", flex: 1 },
  safeArea: { backgroundColor: "#f8fafc", flex: 1 },
  roleBar: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  eyebrow: {
    color: "#9a6a16",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: { color: "#0f172a", fontSize: 17, fontWeight: "800" },
  hiddenWebLayer: { opacity: 0 },
  lockOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    zIndex: 10,
  },
  activePill: {
    backgroundColor: "#ccfbf1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inactivePill: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  webView: { backgroundColor: "#f8fafc", flex: 1 },
  webLayer: { flex: 1 },
  emptyState: {
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    margin: 20,
    maxWidth: 560,
    padding: 22,
    width: "90%",
  },
  emptyTitle: { color: "#0f172a", fontSize: 20, fontWeight: "800" },
  emptyMessage: { color: "#334155", fontSize: 15, lineHeight: 22 },
  emptyHelp: { color: "#64748b", fontSize: 13, lineHeight: 19 },
});
