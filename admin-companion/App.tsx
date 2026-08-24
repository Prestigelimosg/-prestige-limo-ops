import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
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
import type {
  WebViewErrorEvent,
  WebViewNavigationEvent,
} from "react-native-webview/lib/WebViewTypes";

import {
  authenticateAdminAppUnlock,
  enableAdminBiometricUnlock,
  isAdminBiometricUnlockEnabled,
  readOrCreateAdminInstallationId,
} from "./src/admin-installation";
import {
  forgetAdminNativeNotificationToken,
  nativeAdminNotificationOpenRequest,
  readAdminNativeNotificationToken,
  rememberAdminNativeNotificationToken,
} from "./src/admin-native-notifications";
import {
  adminSignInUrl,
  isAdminSignInUrl,
  isProtectedAdminUrl,
  shouldAllowAdminWebViewNavigation,
  productionOrigin,
} from "./src/admin-navigation";
import {
  adminNativeNotificationResultScript,
  adminNativeSubscriptionRequestScript,
  embeddedAdminBridgeBootstrap,
  parseAdminBridgeMessage,
} from "./src/admin-webview-bridge";

type ScreenMode = "checking" | "enrollment-required" | "locked" | "web";
type AdminWebViewLoadState = "loading" | "ready" | "failed";

const adminWebViewInitialLoadTimeoutMs = 15_000;
const adminWebViewAutomaticRecoveryLimit = 1;

const signOutScript = `
void fetch("/api/admin-auth/session", {
  credentials: "same-origin",
  headers: { "x-prestige-admin-auth-purpose": "admin-account-sign-out" },
  method: "DELETE"
}).then(function (response) {
  if (!response.ok) throw new Error("sign_out_failed");
  window.location.assign("/admin-sign-in?action=signout");
}).catch(function () {
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: "admin-sign-out-failed" }));
});
true;
`;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(adminSignInUrl());
  const [installationId, setInstallationId] = useState("");
  const [navigationKey, setNavigationKey] = useState(0);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    "denied" | "granted" | "undetermined"
  >("undetermined");
  const [notice, setNotice] = useState("");
  const [screenMode, setScreenMode] = useState<ScreenMode>("checking");
  const [webViewLoadState, setWebViewLoadState] =
    useState<AdminWebViewLoadState>("loading");
  const biometricPromptBusyRef = useRef(false);
  const biometricResumePendingRef = useRef(false);
  const nativeBridgeBusyRef = useRef(false);
  const pendingNativeActionRef = useRef<"register" | "unregister" | null>(null);
  const pendingNativeContextRef = useRef<"sign_out" | "toggle" | null>(null);
  const pendingDashboardOpenRef = useRef(false);
  const pendingNativeTokenRef = useRef("");
  const pendingPreviousNativeTokenRef = useRef("");
  const pendingProtectedUrlRef = useRef("");
  const signOutPendingRef = useRef(false);
  const webViewAutomaticRecoveryCountRef = useRef(0);
  const webViewHasCompletedLoadRef = useRef(false);
  const webViewLoadFailurePendingRef = useRef(false);
  const webViewLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webViewRef = useRef<WebView>(null);

  const clearAdminWebViewLoadTimeout = useCallback(() => {
    if (!webViewLoadTimeoutRef.current) return;
    clearTimeout(webViewLoadTimeoutRef.current);
    webViewLoadTimeoutRef.current = null;
  }, []);

  const recoverAdminWebView = useCallback((automatic: boolean) => {
    clearAdminWebViewLoadTimeout();
    if (
      automatic &&
      webViewAutomaticRecoveryCountRef.current >= adminWebViewAutomaticRecoveryLimit
    ) {
      setWebViewLoadState("failed");
      return;
    }

    if (automatic) {
      webViewAutomaticRecoveryCountRef.current += 1;
    } else {
      webViewAutomaticRecoveryCountRef.current = 0;
    }
    webViewHasCompletedLoadRef.current = false;
    setWebViewLoadState("loading");
    setNavigationKey((current) => current + 1);
  }, [clearAdminWebViewLoadTimeout]);

  const handleAdminWebViewLoadStart = useCallback(() => {
    clearAdminWebViewLoadTimeout();
    webViewHasCompletedLoadRef.current = false;
    webViewLoadFailurePendingRef.current = false;
    setWebViewLoadState("loading");
    webViewLoadTimeoutRef.current = setTimeout(() => {
      webViewLoadTimeoutRef.current = null;
      if (
        webViewHasCompletedLoadRef.current ||
        AppState.currentState !== "active"
      ) {
        return;
      }
      webViewLoadFailurePendingRef.current = true;
      recoverAdminWebView(true);
    }, adminWebViewInitialLoadTimeoutMs);
  }, [clearAdminWebViewLoadTimeout, recoverAdminWebView]);

  const handleAdminWebViewLoadError = useCallback((event: WebViewErrorEvent) => {
    event.preventDefault();
    webViewLoadFailurePendingRef.current = true;
    webViewHasCompletedLoadRef.current = false;
    recoverAdminWebView(true);
  }, [recoverAdminWebView]);

  const handleAdminWebViewContentProcessTermination = useCallback(() => {
    webViewLoadFailurePendingRef.current = true;
    webViewHasCompletedLoadRef.current = false;
    recoverAdminWebView(true);
  }, [recoverAdminWebView]);

  const retryAdminWebView = useCallback(() => {
    webViewLoadFailurePendingRef.current = false;
    webViewHasCompletedLoadRef.current = false;
    recoverAdminWebView(false);
  }, [recoverAdminWebView]);

  const unlockAdminApp = useCallback(async () => {
    if (biometricPromptBusyRef.current) return;
    biometricPromptBusyRef.current = true;
    setScreenMode("checking");
    try {
      const unlocked = await authenticateAdminAppUnlock().catch(() => false);
      setScreenMode(unlocked ? "web" : "locked");
    } finally {
      biometricPromptBusyRef.current = false;
    }
  }, []);

  const completeMandatoryEnrollment = useCallback(async (protectedUrl: string) => {
    if (biometricPromptBusyRef.current) return;
    pendingProtectedUrlRef.current = protectedUrl;
    biometricPromptBusyRef.current = true;
    setNotice("");
    setScreenMode("checking");
    try {
      const enabled = await enableAdminBiometricUnlock().catch(() => false);
      if (!enabled) {
        setScreenMode("enrollment-required");
        return;
      }

      setBiometricEnabled(true);
      setCurrentUrl(protectedUrl);
      setNavigationKey((current) => current + 1);
      setNotice("Face ID now protects verified Prestige Limo Ops access on this iPhone.");
      setScreenMode("web");
    } finally {
      biometricPromptBusyRef.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function preparePrivacyLock() {
      const [nextInstallationId, enabled, savedNotificationToken, permission] =
        await Promise.all([
          readOrCreateAdminInstallationId(),
          isAdminBiometricUnlockEnabled(),
          readAdminNativeNotificationToken(),
          Notifications.getPermissionsAsync(),
        ]).catch(() => ["", false, null, { granted: false, status: "undetermined" }] as const);
      if (!mounted) return;

      if (!nextInstallationId) {
        setScreenMode("locked");
        return;
      }
      const nextPermission = permission.granted
        ? "granted"
        : permission.status === "denied"
          ? "denied"
          : "undetermined";
      setInstallationId(nextInstallationId);
      setBiometricEnabled(enabled);
      setNotificationEnabled(Boolean(savedNotificationToken) && nextPermission === "granted");
      setNotificationPermission(nextPermission);
      setNavigationKey((current) => current + 1);
      if (!enabled) {
        setScreenMode("web");
        return;
      }

      biometricPromptBusyRef.current = true;
      const unlocked = await authenticateAdminAppUnlock().catch(() => false);
      biometricPromptBusyRef.current = false;
      if (mounted) setScreenMode(unlocked ? "web" : "locked");
    }

    void preparePrivacyLock();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => clearAdminWebViewLoadTimeout();
  }, [clearAdminWebViewLoadTimeout]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const returningToForeground = previousState !== "active" && nextState === "active";
      previousState = nextState;

      if (nextState !== "active") {
        clearAdminWebViewLoadTimeout();
      }
      if (nextState !== "active" && biometricPromptBusyRef.current) {
        biometricResumePendingRef.current = true;
      } else if (nextState !== "active" && biometricEnabled) {
        setScreenMode("locked");
      }

      if (returningToForeground) {
        void Promise.all([
          Notifications.getPermissionsAsync(),
          readAdminNativeNotificationToken(),
        ]).then(([permission, savedToken]) => {
        const nextPermission = permission.granted
          ? "granted"
          : permission.status === "denied"
            ? "denied"
            : "undetermined";
        const enabled = Boolean(savedToken) && nextPermission === "granted";
        setNotificationPermission(nextPermission);
        setNotificationEnabled(enabled);
        webViewRef.current?.injectJavaScript(
          adminNativeNotificationResultScript({
            ok: enabled,
            state: enabled ? "enabled" : nextPermission === "denied" ? "denied" : "disabled",
          }),
        );
        }).catch(() => {
          setNotificationEnabled(false);
        });
      }
      if (!returningToForeground || !biometricEnabled) return;
      if (biometricResumePendingRef.current) {
        biometricResumePendingRef.current = false;
        return;
      }
      if (!biometricPromptBusyRef.current) void unlockAdminApp();
    });

    return () => subscription.remove();
  }, [
    biometricEnabled,
    clearAdminWebViewLoadTimeout,
    unlockAdminApp,
  ]);

  useEffect(() => {
    if (
      screenMode !== "web" ||
      webViewLoadState !== "loading" ||
      webViewHasCompletedLoadRef.current ||
      AppState.currentState !== "active"
    ) {
      return;
    }
    handleAdminWebViewLoadStart();
  }, [handleAdminWebViewLoadStart, screenMode, webViewLoadState]);

  useEffect(() => {
    const openDashboardFromNotification = (
      response: Notifications.NotificationResponse | null,
    ) => {
      const request = nativeAdminNotificationOpenRequest(
        response?.notification.request.content.data,
      );
      if (!request) return;

      pendingDashboardOpenRef.current = true;
      if (biometricEnabled) {
        setScreenMode("locked");
        void unlockAdminApp();
      } else if (installationId) {
        setCurrentUrl(`${productionOrigin}${request.openTarget}`);
        setNavigationKey((current) => current + 1);
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      openDashboardFromNotification,
    );
    try {
      const initialResponse = Notifications.getLastNotificationResponse();
      if (initialResponse) {
        openDashboardFromNotification(initialResponse);
        void Notifications.clearLastNotificationResponse();
      }
    } catch {
      // Ordinary verified Admin navigation remains available without a response.
    }

    return () => subscription.remove();
  }, [biometricEnabled, installationId, unlockAdminApp]);

  useEffect(() => {
    if (
      !pendingDashboardOpenRef.current ||
      !installationId ||
      (biometricEnabled && screenMode !== "web")
    ) {
      return;
    }

    pendingDashboardOpenRef.current = false;
    setCurrentUrl(`${productionOrigin}/`);
    setNavigationKey((current) => current + 1);
  }, [biometricEnabled, installationId, screenMode]);

  const allowNavigation = useCallback((request: { url: string }) => {
    if (!shouldAllowAdminWebViewNavigation(request.url)) {
      setNotice("For your security, Prestige Limo Ops opens only approved operations pages.");
      return false;
    }

    if (isAdminSignInUrl(request.url)) return true;

    if (isProtectedAdminUrl(request.url) && !biometricEnabled) {
      void completeMandatoryEnrollment(request.url);
      return false;
    }

    return biometricEnabled && screenMode === "web";
  }, [biometricEnabled, completeMandatoryEnrollment, screenMode]);

  const updateNavigation = useCallback((navigation: WebViewNavigation) => {
    setCurrentUrl(navigation.url);
    if (isAdminSignInUrl(navigation.url)) setNotice("");
  }, []);

  const retryEnrollment = useCallback(() => {
    void completeMandatoryEnrollment(pendingProtectedUrlRef.current || "https://app.prestigelimo.sg/");
  }, [completeMandatoryEnrollment]);

  const requestNativeSubscription = useCallback(async (
    action: "register" | "unregister",
    context: "sign_out" | "toggle" = "toggle",
  ) => {
    if (!installationId || nativeBridgeBusyRef.current) return;
    nativeBridgeBusyRef.current = true;

    try {
      const existingToken = await readAdminNativeNotificationToken();
      if (action === "unregister") {
        if (!existingToken) {
          setNotificationEnabled(false);
          webViewRef.current?.injectJavaScript(
            adminNativeNotificationResultScript({ ok: true, state: "disabled" }),
          );
          if (context === "sign_out") {
            signOutPendingRef.current = false;
            webViewRef.current?.injectJavaScript(signOutScript);
          }
          nativeBridgeBusyRef.current = false;
          return;
        }

        pendingNativeTokenRef.current = existingToken;
        pendingPreviousNativeTokenRef.current = existingToken;
        pendingNativeActionRef.current = action;
        pendingNativeContextRef.current = context;
        webViewRef.current?.injectJavaScript(
          adminNativeSubscriptionRequestScript({
            action,
            context,
            installationId,
            nativeToken: existingToken,
          }),
        );
        return;
      }

      const permission = await Notifications.requestPermissionsAsync();
      const permissionState = permission.granted
        ? "granted"
        : permission.status === "denied"
          ? "denied"
          : "undetermined";
      setNotificationPermission(permissionState);
      if (!permission.granted) {
        setNotificationEnabled(false);
        webViewRef.current?.injectJavaScript(
          adminNativeNotificationResultScript({ ok: false, state: "denied" }),
        );
        nativeBridgeBusyRef.current = false;
        return;
      }

      const projectId =
        Constants.easConfig?.projectId ||
        Constants.expoConfig?.extra?.eas?.projectId;
      if (typeof projectId !== "string" || !projectId) {
        throw new Error("Native Admin notification project identity is unavailable.");
      }
      const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
      const nextToken = tokenResult.data;
      pendingNativeTokenRef.current = nextToken;
      pendingPreviousNativeTokenRef.current = existingToken || "";
      pendingNativeActionRef.current = action;
      pendingNativeContextRef.current = context;
      setNotificationEnabled(false);
      webViewRef.current?.injectJavaScript(
        adminNativeSubscriptionRequestScript({
          action,
          context,
          installationId,
          nativeToken: nextToken,
          previousToken: existingToken,
        }),
      );
    } catch {
      pendingNativeTokenRef.current = "";
      pendingPreviousNativeTokenRef.current = "";
      pendingNativeActionRef.current = null;
      pendingNativeContextRef.current = null;
      setNotificationEnabled(false);
      webViewRef.current?.injectJavaScript(
        adminNativeNotificationResultScript({ ok: false, state: "failed" }),
      );
      nativeBridgeBusyRef.current = false;
    }
  }, [installationId]);

  const handleAdminWebViewLoadEnd = useCallback((
    event: WebViewNavigationEvent | WebViewErrorEvent,
  ) => {
    if (webViewLoadFailurePendingRef.current) return;
    clearAdminWebViewLoadTimeout();
    webViewHasCompletedLoadRef.current = true;
    webViewAutomaticRecoveryCountRef.current = 0;
    setWebViewLoadState("ready");
    if (
      signOutPendingRef.current &&
      event.nativeEvent.url === `${productionOrigin}/`
    ) {
      void requestNativeSubscription("unregister", "sign_out");
    }
  }, [clearAdminWebViewLoadTimeout, requestNativeSubscription]);

  const handleWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
    const message = parseAdminBridgeMessage(event.nativeEvent.data);
    if (!message) {
      if (event.nativeEvent.data.includes("admin-sign-out-failed")) {
        setNotice("Sign out did not complete. Please try again.");
      }
      return;
    }

    if (message.type === "admin_notifications_register") {
      await requestNativeSubscription("register");
      return;
    }
    if (message.type === "admin_notifications_unregister") {
      await requestNativeSubscription("unregister");
      return;
    }

    if (
      !nativeBridgeBusyRef.current ||
      pendingNativeActionRef.current !== message.action ||
      pendingNativeContextRef.current !== message.context
    ) {
      return;
    }

    if (!message.ok) {
      const pendingToken = pendingNativeTokenRef.current;
      const previousToken = pendingPreviousNativeTokenRef.current;
      if (message.action === "register" && pendingToken !== previousToken) {
        await forgetAdminNativeNotificationToken().catch(() => undefined);
      }
      pendingNativeTokenRef.current = "";
      pendingPreviousNativeTokenRef.current = "";
      pendingNativeActionRef.current = null;
      pendingNativeContextRef.current = null;
      nativeBridgeBusyRef.current = false;
      setNotificationEnabled(false);
      setNotice(
        message.context === "sign_out"
          ? "Push must turn off safely before sign out. Please try again."
          : "Admin app push could not be updated. Please try again.",
      );
      return;
    }

    if (message.action === "register") {
      const registeredToken = pendingNativeTokenRef.current;
      try {
        if (!registeredToken) throw new Error("missing_registered_token");
        await rememberAdminNativeNotificationToken(registeredToken);
      } catch {
        if (registeredToken) {
          pendingNativeActionRef.current = "unregister";
          pendingNativeContextRef.current = "toggle";
          webViewRef.current?.injectJavaScript(
            adminNativeSubscriptionRequestScript({
              action: "unregister",
              context: "toggle",
              installationId,
              nativeToken: registeredToken,
            }),
          );
          setNotice("Admin app push could not be saved securely. It is being turned off.");
          return;
        }
      }
      pendingNativeTokenRef.current = "";
      pendingPreviousNativeTokenRef.current = "";
      pendingNativeActionRef.current = null;
      pendingNativeContextRef.current = null;
      nativeBridgeBusyRef.current = false;
      setNotificationEnabled(true);
      setNotificationPermission("granted");
      return;
    }

    await forgetAdminNativeNotificationToken();
    pendingNativeTokenRef.current = "";
    pendingPreviousNativeTokenRef.current = "";
    pendingNativeActionRef.current = null;
    pendingNativeContextRef.current = null;
    nativeBridgeBusyRef.current = false;
    setNotificationEnabled(false);
    if (message.context === "sign_out") {
      signOutPendingRef.current = false;
      webViewRef.current?.injectJavaScript(signOutScript);
    }
  }, [installationId, requestNativeSubscription]);

  const signOutAfterNativePushRevocation = useCallback(async () => {
    if (nativeBridgeBusyRef.current) {
      setNotice("Finish the current push update before signing out.");
      return;
    }
    const token = await readAdminNativeNotificationToken().catch(() => null);
    if (!token) {
      webViewRef.current?.injectJavaScript(signOutScript);
      return;
    }

    signOutPendingRef.current = true;
    if (currentUrl === `${productionOrigin}/`) {
      await requestNativeSubscription("unregister", "sign_out");
      return;
    }
    setCurrentUrl(`${productionOrigin}/`);
    setNavigationKey((current) => current + 1);
  }, [currentUrl, requestNativeSubscription]);

  const signOut = useCallback(() => {
    void signOutAfterNativePushRevocation();
  }, [signOutAfterNativePushRevocation]);

  const webLayerLocked = screenMode !== "web";
  const enrollmentRequired = screenMode === "enrollment-required";
  const signedInPage = isProtectedAdminUrl(currentUrl) && biometricEnabled;
  const adminBridgeBootstrap = installationId
    ? embeddedAdminBridgeBootstrap(
        installationId,
        notificationEnabled,
        notificationPermission,
      )
    : "true;";

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
          <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
            <View style={styles.header}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>P</Text>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.brand}>Prestige Limo Ops</Text>
                <Text style={styles.subtitle}>{signedInPage ? "Face ID protected" : "Admin sign in"}</Text>
              </View>
              {signedInPage ? (
                <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}>
                  <Text style={styles.signOutButtonText}>Sign out</Text>
                </Pressable>
              ) : null}
            </View>
            {notice ? (
              <View accessibilityRole="alert" style={styles.notice}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}
            <View style={styles.webViewContainer}>
              <WebView
                injectedJavaScriptBeforeContentLoaded={adminBridgeBootstrap}
                allowsBackForwardNavigationGestures={false}
                allowsLinkPreview={false}
                cacheEnabled
                domStorageEnabled
                javaScriptCanOpenWindowsAutomatically={false}
                javaScriptEnabled
                key={`prestige-admin-webview-${navigationKey}`}
                mixedContentMode="never"
                onContentProcessDidTerminate={handleAdminWebViewContentProcessTermination}
                onError={handleAdminWebViewLoadError}
                onHttpError={(event) => {
                  if (event.nativeEvent.statusCode >= 500) {
                    setNotice("Prestige Limo Ops is temporarily unavailable.");
                  }
                }}
                onLoadEnd={handleAdminWebViewLoadEnd}
                onLoadStart={handleAdminWebViewLoadStart}
                onMessage={(event) => {
                  void handleWebViewMessage(event);
                }}
                onNavigationStateChange={updateNavigation}
                onShouldStartLoadWithRequest={allowNavigation}
                originWhitelist={["https://app.prestigelimo.sg"]}
                pullToRefreshEnabled
                ref={webViewRef}
                setSupportMultipleWindows={false}
                sharedCookiesEnabled
                source={{ uri: currentUrl }}
                style={styles.webView}
                thirdPartyCookiesEnabled={false}
              />
              {webViewLoadState === "loading" ? (
                <View accessibilityRole="progressbar" style={styles.webViewRecoveryOverlay}>
                  <ActivityIndicator color={colors.gold} size="large" />
                  <Text style={styles.webViewRecoveryText}>Loading secure Admin sign-in…</Text>
                </View>
              ) : webViewLoadState === "failed" ? (
                <View accessibilityRole="alert" style={styles.webViewRecoveryOverlay}>
                  <Text style={styles.webViewRecoveryTitle}>The secure Admin screen did not load.</Text>
                  <Text style={styles.webViewRecoveryText}>
                    {"Check this iPhone's connection, then reload the protected Admin screen."}
                  </Text>
                  <Pressable accessibilityRole="button" onPress={retryAdminWebView} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Reload Admin screen</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </SafeAreaView>
        </View>
        {webLayerLocked ? (
          <SafeAreaView style={[styles.lockedSafeArea, styles.lockOverlay]}>
            <View style={styles.lockMark}>
              <Text style={styles.lockMarkText}>P</Text>
            </View>
            <Text style={styles.lockedTitle}>Prestige Limo Ops</Text>
            <Text style={styles.lockedText}>
              {enrollmentRequired
                ? "Face ID is required before verified operations pages can open."
                : screenMode === "locked"
                  ? "Face ID is required to unlock this Admin app."
                  : "Checking Face ID…"}
            </Text>
            {enrollmentRequired ? (
              <Pressable accessibilityRole="button" onPress={retryEnrollment} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Retry Face ID</Text>
              </Pressable>
            ) : screenMode === "locked" ? (
              <Pressable accessibilityRole="button" onPress={unlockAdminApp} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Unlock Prestige Limo Ops</Text>
              </Pressable>
            ) : null}
          </SafeAreaView>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const colors = {
  background: "#f8fafc",
  border: "#cbd5e1",
  gold: "#b08b3e",
  ink: "#0f172a",
  muted: "#64748b",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  brand: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  brandMark: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 7, height: 32, justifyContent: "center", width: 32 },
  brandMarkText: { color: colors.gold, fontSize: 19, fontWeight: "800" },
  header: { alignItems: "center", backgroundColor: colors.white, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", minHeight: 52, paddingHorizontal: 12, paddingVertical: 6 },
  headerText: { flex: 1, marginLeft: 9 },
  hiddenWebLayer: { opacity: 0 },
  lockedSafeArea: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 28 },
  lockedText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 330, textAlign: "center" },
  lockedTitle: { color: colors.ink, fontSize: 25, fontWeight: "700", marginTop: 18 },
  lockMark: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 24, height: 88, justifyContent: "center", width: 88 },
  lockMarkText: { color: colors.gold, fontSize: 44, fontWeight: "800" },
  lockOverlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, zIndex: 10 },
  notice: { backgroundColor: "#fff8e7", borderBottomColor: "#e8d6a8", borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  noticeText: { color: "#6b4f16", fontSize: 12, lineHeight: 17 },
  primaryButton: { backgroundColor: colors.ink, borderRadius: 10, marginTop: 24, paddingHorizontal: 22, paddingVertical: 12 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: "700" },
  root: { backgroundColor: colors.background, flex: 1 },
  safeArea: { backgroundColor: colors.white, flex: 1 },
  signOutButton: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  signOutButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 1 },
  webLayer: { flex: 1 },
  webView: { backgroundColor: colors.background, flex: 1 },
  webViewContainer: { backgroundColor: colors.background, flex: 1 },
  webViewRecoveryOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", backgroundColor: colors.background, justifyContent: "center", padding: 28 },
  webViewRecoveryText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 12, maxWidth: 330, textAlign: "center" },
  webViewRecoveryTitle: { color: colors.ink, fontSize: 18, fontWeight: "700", textAlign: "center" },
});
