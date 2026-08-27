import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Linking,
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
import type { WebView as WebViewType } from "react-native-webview";

import prestigeIcon from "./assets/icon.png";

import {
  beginCustomerBiometricAttempt,
  createCustomerBiometricLifecycle,
  finishCustomerBiometricAttempt,
  readCustomerBiometricMonotonicTimeMs,
  transitionCustomerBiometricAppState,
} from "./src/customer-biometric-lifecycle";
import {
  customerTabForUrl,
  customerTabUrl,
  customerUniversalLinkUrl,
  isAllowedNativeContactUrl,
  shouldAllowCustomerMapEmbedNavigation,
  shouldAllowCustomerWebViewNavigation,
  type CustomerTab,
} from "./src/customer-navigation";
import {
  authenticateCustomerAppUnlock,
  customerBiometricsAvailable,
  enableCustomerBiometricUnlock,
  isCustomerBiometricUnlockEnabled,
  isCustomerNativeAlertsEnabled,
  customerInstallationId,
  setCustomerNativeAlertsEnabled,
} from "./src/customer-installation";
import {
  addCustomerNotificationTapListener,
  addCustomerNotificationReceivedListener,
  initialCustomerNotificationUrl,
  readCustomerNativeNotifications,
  registerCustomerNativeNotifications,
  type CustomerNativeRegistration,
} from "./src/customer-native-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type UnlockState = "checking" | "locked" | "ready";
type CustomerNativeNotificationAction = "disable" | "enable";

type CustomerNativeBridgeMessage =
  | { type: "customer_native_notifications_disable" }
  | { type: "customer_native_notifications_enable" }
  | {
      action: CustomerNativeNotificationAction;
      ok: boolean;
      reason: "request_failed" | "server_session_required" | "success";
      type: "customer_native_notifications_result";
    };

function parseCustomerNativeBridgeMessage(value: string): CustomerNativeBridgeMessage | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const keys = Object.keys(parsed).sort();

    if (
      keys.length === 1 &&
      keys[0] === "type" &&
      (parsed.type === "customer_native_notifications_enable" ||
        parsed.type === "customer_native_notifications_disable")
    ) {
      return { type: parsed.type };
    }

    if (
      keys.join(",") === "action,ok,reason,type" &&
      parsed.type === "customer_native_notifications_result" &&
      (parsed.action === "enable" || parsed.action === "disable") &&
      typeof parsed.ok === "boolean" &&
      (parsed.reason === "request_failed" ||
        parsed.reason === "server_session_required" ||
        parsed.reason === "success")
    ) {
      return {
        action: parsed.action,
        ok: parsed.ok,
        reason: parsed.reason,
        type: parsed.type,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function customerNativeNotificationResultScript(input: {
  enabled: boolean;
  message: string;
  status: "enabled" | "error" | "ready";
}) {
  return `(function(){window.dispatchEvent(new CustomEvent('prestige-customer-native-alerts',{detail:${JSON.stringify(input)}}));})();true;`;
}

function customerNativeNotificationMutationScript(
  action: CustomerNativeNotificationAction,
  registration: CustomerNativeRegistration,
) {
  const enabledAfterSuccess = action === "enable";
  const method = enabledAfterSuccess ? "POST" : "PATCH";
  return `(function(){var action=${JSON.stringify(action)};var notify=function(ok,reason){var enabled=ok?${JSON.stringify(enabledAfterSuccess)}:${JSON.stringify(!enabledAfterSuccess)};var detail={enabled:enabled,message:ok?(enabled?'Booking alerts are enabled on this device.':'Booking alerts are off on this device.'):(reason==='server_session_required'?'Customer sign-in is required before alerts can be enabled.':'Alerts could not be changed. Reload My Bookings and try again.'),status:ok?(enabled?'enabled':'ready'):'error'};window.dispatchEvent(new CustomEvent('prestige-customer-native-alerts',{detail:detail}));if(window.ReactNativeWebView&&typeof window.ReactNativeWebView.postMessage==='function'){window.ReactNativeWebView.postMessage(JSON.stringify({action:action,ok:ok,reason:reason,type:'customer_native_notifications_result'}));}};fetch('/api/customer-device-push-subscriptions',{method:${JSON.stringify(method)},credentials:'same-origin',headers:{'Content-Type':'application/json','x-prestige-customer-purpose':'customer-device-push-subscription'},body:JSON.stringify({delivery_channel:'native_expo',native_expo_token:${JSON.stringify(registration.expoPushToken)},installation_id:${JSON.stringify(registration.installationId)}})}).then(function(response){return response.json().catch(function(){return null;}).then(function(payload){var ok=response.ok&&payload&&payload.ok===true;var reason=ok?'success':((response.status===401||response.status===403||(payload&&payload.reason==='unauthorized'))?'server_session_required':'request_failed');notify(ok,reason);});}).catch(function(){notify(false,'request_failed');});})();true;`;
}

function isCustomerBookingsUrl(value: string) {
  try {
    return new URL(value).pathname === "/my-bookings";
  } catch {
    return false;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<CustomerTab>("book");
  const [currentUrl, setCurrentUrl] = useState(customerTabUrl("book"));
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [unlockState, setUnlockState] = useState<UnlockState>("checking");
  const [notice, setNotice] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [nativeAlertsEnabled, setNativeAlertsEnabled] = useState(false);
  const [nativeAlertsPreferenceReady, setNativeAlertsPreferenceReady] = useState(false);
  const [nativeRegistration, setNativeRegistration] = useState<CustomerNativeRegistration | null>(null);
  const [loadedCustomerWebView, setLoadedCustomerWebView] = useState({ url: "", sequence: 0 });
  const [customerWebViewMounted, setCustomerWebViewMounted] = useState(false);
  const appMountedRef = useRef(true);
  const biometricAvailableRef = useRef(false);
  const biometricEnabledRef = useRef(false);
  const biometricLifecycleRef = useRef(
    createCustomerBiometricLifecycle(AppState.currentState),
  );
  const pendingCustomerUniversalLinkRef = useRef<string | null>(null);
  const nativeAlertsDisablePendingRef = useRef(false);
  const nativeAlertsEnablePendingRef = useRef(false);
  const nativeAlertsMutationBusyRef = useRef(false);
  const nativeAlertsRegistrationAttemptRef = useRef("");
  const unlockStateRef = useRef<UnlockState>("checking");
  const webViewRef = useRef<WebViewType>(null);

  const injectCustomerNativeRegistration = useCallback((registration: CustomerNativeRegistration) => {
    webViewRef.current?.injectJavaScript(
      customerNativeNotificationMutationScript("enable", registration),
    );
  }, []);

  const sendCustomerNativeNotificationResult = useCallback((input: {
    enabled: boolean;
    message: string;
    status: "enabled" | "error" | "ready";
  }) => {
    webViewRef.current?.injectJavaScript(customerNativeNotificationResultScript(input));
  }, []);

  const openCustomerUniversalLink = useCallback((safeUrl: string) => {
    if (
      biometricAvailableRef.current &&
      !biometricEnabledRef.current &&
      isCustomerBookingsUrl(safeUrl)
    ) {
      pendingCustomerUniversalLinkRef.current = safeUrl;
      unlockStateRef.current = "locked";
      setUnlockState("locked");
      setNotice("Enable Face ID to protect your Customer bookings on this iPhone.");
      return;
    }
    pendingCustomerUniversalLinkRef.current = null;
    setActiveTab("bookings");
    setCurrentUrl(safeUrl);
    setNotice("");
  }, []);

  const setCustomerUnlockState = useCallback((nextState: UnlockState) => {
    unlockStateRef.current = nextState;
    setUnlockState(nextState);
    if (nextState === "ready") setCustomerWebViewMounted(true);

    const pendingUrl = pendingCustomerUniversalLinkRef.current;
    if (nextState === "ready" && pendingUrl) {
      openCustomerUniversalLink(pendingUrl);
    }
  }, [openCustomerUniversalLink]);

  const unlockCustomerApp = useCallback(async () => {
    const attemptId = beginCustomerBiometricAttempt(biometricLifecycleRef.current);
    if (attemptId === null) return;

    setCustomerUnlockState("checking");
    const unlocked = await authenticateCustomerAppUnlock().catch(() => false);
    const currentAttempt = finishCustomerBiometricAttempt(
      biometricLifecycleRef.current,
      attemptId,
    );
    if (currentAttempt && appMountedRef.current) {
      setCustomerUnlockState(unlocked ? "ready" : "locked");
    }
  }, [setCustomerUnlockState]);

  useEffect(() => {
    appMountedRef.current = true;
    return () => {
      appMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function preparePrivacyLock() {
      const [available, enabled] = await Promise.all([
        customerBiometricsAvailable().catch(() => false),
        isCustomerBiometricUnlockEnabled().catch(() => false),
      ]);
      if (!mounted) return;

      biometricAvailableRef.current = available;
      biometricEnabledRef.current = enabled;
      setBiometricAvailable(available);
      setBiometricEnabled(enabled);
      if (!enabled) {
        setCustomerUnlockState("ready");
        return;
      }

      void unlockCustomerApp();
    }

    void preparePrivacyLock();
    return () => { mounted = false; };
  }, [setCustomerUnlockState, unlockCustomerApp]);

  useEffect(() => {
    let mounted = true;

    function queueCustomerUniversalLink(value: string | null) {
      if (!mounted || !value) return;
      const safeUrl = customerUniversalLinkUrl(value);
      if (!safeUrl) return;

      if (unlockStateRef.current === "ready") {
        openCustomerUniversalLink(safeUrl);
      } else {
        pendingCustomerUniversalLinkRef.current = safeUrl;
      }
    }

    void Linking.getInitialURL()
      .then(queueCustomerUniversalLink)
      .catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      queueCustomerUniversalLink(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [openCustomerUniversalLink]);

  useEffect(() => {
    void Promise.all([
      customerInstallationId().catch(() => ""),
      isCustomerNativeAlertsEnabled().catch(() => false),
    ]).then(([resolvedInstallationId, alertsEnabled]) => {
      setInstallationId(resolvedInstallationId);
      setNativeAlertsEnabled(alertsEnabled);
      setNativeAlertsPreferenceReady(true);
    });
    void Notifications.getBadgeCountAsync().then((count) => {
      if (count > 0) {
        setActiveTab("bookings");
        setCurrentUrl(customerTabUrl("bookings"));
      }
      return Notifications.setBadgeCountAsync(0);
    }).catch(() => false);
    const subscription = addCustomerNotificationTapListener((url) => {
      void Notifications.setBadgeCountAsync(0).catch(() => false);
      if (unlockStateRef.current === "ready") openCustomerUniversalLink(url);
      else pendingCustomerUniversalLinkRef.current = url;
    });
    void initialCustomerNotificationUrl().then((url) => {
      if (!url) return;
      if (unlockStateRef.current === "ready") openCustomerUniversalLink(url);
      else pendingCustomerUniversalLinkRef.current = url;
    }).catch(() => undefined);
    return () => subscription.remove();
  }, [openCustomerUniversalLink]);

  useEffect(() => {
    const subscription = addCustomerNotificationReceivedListener(() => {
      if (
        !nativeRegistration ||
        !isCustomerBookingsUrl(currentUrl) ||
        !isCustomerBookingsUrl(loadedCustomerWebView.url)
      ) {
        return;
      }
      void Notifications.setBadgeCountAsync(0).catch(() => false);
      nativeAlertsRegistrationAttemptRef.current = "";
      injectCustomerNativeRegistration(nativeRegistration);
    });
    return () => subscription.remove();
  }, [currentUrl, injectCustomerNativeRegistration, loadedCustomerWebView.url, nativeRegistration]);

  useEffect(() => {
    if (unlockState !== "ready" || !nativeAlertsPreferenceReady || !nativeAlertsEnabled) return;
    void registerCustomerNativeNotifications()
      .then((registration) => {
        if (registration && !nativeAlertsDisablePendingRef.current) {
          setNativeRegistration(registration);
          return;
        }
        setNativeAlertsEnabled(false);
        sendCustomerNativeNotificationResult({
          enabled: false,
          message: "Alerts are blocked in this device's notification settings.",
          status: "error",
        });
      })
      .catch(() => {
        setNativeAlertsEnabled(false);
        sendCustomerNativeNotificationResult({
          enabled: false,
          message: "Alerts could not be changed. Reload My Bookings and try again.",
          status: "error",
        });
      });
  }, [nativeAlertsEnabled, nativeAlertsPreferenceReady, sendCustomerNativeNotificationResult, unlockState]);

  useEffect(() => {
    if (
      !nativeRegistration ||
      (!nativeAlertsEnabled && !nativeAlertsEnablePendingRef.current) ||
      !isCustomerBookingsUrl(currentUrl) ||
      !isCustomerBookingsUrl(loadedCustomerWebView.url)
    ) return;
    const attemptKey = `${loadedCustomerWebView.sequence}:${nativeRegistration.expoPushToken}`;
    if (nativeAlertsRegistrationAttemptRef.current === attemptKey) return;
    nativeAlertsRegistrationAttemptRef.current = attemptKey;
    injectCustomerNativeRegistration(nativeRegistration);
  }, [currentUrl, injectCustomerNativeRegistration, loadedCustomerWebView, nativeAlertsEnabled, nativeRegistration]);

  const handleCustomerNativeBridgeMessage = useCallback(async (event: WebViewMessageEvent) => {
    const request = parseCustomerNativeBridgeMessage(event.nativeEvent.data);
    if (
      !request ||
      !isCustomerBookingsUrl(currentUrl) ||
      !isCustomerBookingsUrl(loadedCustomerWebView.url)
    ) return;

    if (request.type === "customer_native_notifications_result") {
      nativeAlertsMutationBusyRef.current = false;
      if (request.action === "enable") {
        nativeAlertsEnablePendingRef.current = false;
        if (request.ok) {
          void Notifications.setBadgeCountAsync(0).catch(() => false);
          setNativeAlertsEnabled(true);
        } else {
          nativeAlertsRegistrationAttemptRef.current = "";
          await setCustomerNativeAlertsEnabled(false).catch(() => undefined);
          setNativeRegistration(null);
          setNativeAlertsEnabled(false);
        }
        return;
      }

      if (request.ok) {
        try {
          await setCustomerNativeAlertsEnabled(false);
          nativeAlertsRegistrationAttemptRef.current = "";
          setNativeAlertsEnabled(false);
          setNativeRegistration(null);
        } catch {
          sendCustomerNativeNotificationResult({
            enabled: true,
            message: "Alerts could not be changed. Reload My Bookings and try again.",
            status: "error",
          });
        }
      }
      nativeAlertsDisablePendingRef.current = false;
      return;
    }

    if (nativeAlertsMutationBusyRef.current) {
      sendCustomerNativeNotificationResult({
        enabled: nativeAlertsEnabled,
        message: "Another alert change is still running.",
        status: "error",
      });
      return;
    }

    nativeAlertsMutationBusyRef.current = true;
    let mutationStarted = false;
    try {
      if (request.type === "customer_native_notifications_enable") {
        const registration = await registerCustomerNativeNotifications();
        if (!registration) {
          sendCustomerNativeNotificationResult({
            enabled: false,
            message: "Alerts are blocked in this device's notification settings.",
            status: "error",
          });
          return;
        }
        await setCustomerNativeAlertsEnabled(true);
        nativeAlertsEnablePendingRef.current = true;
        nativeAlertsRegistrationAttemptRef.current = "";
        mutationStarted = true;
        setNativeRegistration(registration);
        return;
      }

      nativeAlertsDisablePendingRef.current = true;
      const registration = nativeRegistration || await readCustomerNativeNotifications();
      if (!registration) {
        nativeAlertsDisablePendingRef.current = false;
        sendCustomerNativeNotificationResult({
          enabled: nativeAlertsEnabled,
          message: "Alerts could not be changed. Reload My Bookings and try again.",
          status: "error",
        });
        return;
      }
      mutationStarted = true;
      webViewRef.current?.injectJavaScript(
        customerNativeNotificationMutationScript("disable", registration),
      );
    } catch {
      sendCustomerNativeNotificationResult({
        enabled: nativeAlertsEnabled,
        message: "Alerts could not be changed. Reload My Bookings and try again.",
        status: "error",
      });
    } finally {
      if (!mutationStarted) {
        nativeAlertsDisablePendingRef.current = false;
        nativeAlertsMutationBusyRef.current = false;
      }
    }
  }, [currentUrl, loadedCustomerWebView.url, nativeAlertsEnabled, nativeRegistration, sendCustomerNativeNotificationResult]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const action = transitionCustomerBiometricAppState(
        biometricLifecycleRef.current,
        nextState,
        biometricEnabledRef.current,
        readCustomerBiometricMonotonicTimeMs(),
        unlockStateRef.current === "ready",
      );
      if (action === "lock") {
        setCustomerUnlockState("locked");
      }
      if (action === "reveal") setCustomerUnlockState("ready");
      if (action === "unlock") void unlockCustomerApp();
      if (nextState === "active") {
        void Notifications.getBadgeCountAsync().then((count) => {
          if (count > 0) {
            setActiveTab("bookings");
            setCurrentUrl(customerTabUrl("bookings"));
          }
          return Notifications.setBadgeCountAsync(0);
        }).catch(() => false);
      }
    });
    return () => subscription.remove();
  }, [setCustomerUnlockState, unlockCustomerApp]);

  const enableFaceId = useCallback(async () => {
    const enabled = await enableCustomerBiometricUnlock().catch(() => false);
    if (!enabled) {
      setNotice("Face ID was not enabled. Customer bookings remain locked on this iPhone.");
      return;
    }
    biometricAvailableRef.current = true;
    biometricEnabledRef.current = true;
    setBiometricEnabled(true);
    setCustomerUnlockState("ready");
    setNotice("Face ID is now protecting Prestige SG on this iPhone.");
  }, [setCustomerUnlockState]);

  const selectTab = useCallback((tab: CustomerTab) => {
    setActiveTab(tab);
    setCurrentUrl(customerTabUrl(tab));
    setNotice("");
  }, []);

  const allowNavigation = useCallback((request: { url: string; isTopFrame?: boolean }) => {
    if (shouldAllowCustomerWebViewNavigation(request.url)) return true;
    if (shouldAllowCustomerMapEmbedNavigation(request.url, request.isTopFrame)) return true;

    if (isAllowedNativeContactUrl(request.url)) {
      void Linking.openURL(request.url).catch(() => {
        setNotice("That contact action is not available on this iPhone.");
      });
      return false;
    }

    setNotice("For your security, Prestige SG opens only approved Customer pages.");
    return false;
  }, []);

  const updateNavigation = useCallback((navigation: WebViewNavigation) => {
    const tab = customerTabForUrl(navigation.url);
    if (tab) setActiveTab(tab);
    setCurrentUrl(navigation.url);
    if (biometricAvailable && !biometricEnabled && isCustomerBookingsUrl(navigation.url)) {
      pendingCustomerUniversalLinkRef.current = navigation.url;
      unlockStateRef.current = "locked";
      setUnlockState("locked");
      setNotice("Enable Face ID to protect your Customer bookings on this iPhone.");
    }
  }, [biometricAvailable, biometricEnabled]);

  const webLayerLocked = unlockState !== "ready" || !nativeAlertsPreferenceReady;
  const customerWebViewCanMount =
    customerWebViewMounted && nativeAlertsPreferenceReady;

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
              <Image
                alt="Prestige SG"
                accessibilityIgnoresInvertColors
                source={prestigeIcon}
                style={styles.logo}
              />
              <View style={styles.headerText}>
                <Text style={styles.brand}>Prestige SG</Text>
              </View>
              {!biometricEnabled && biometricAvailable ? (
                <Pressable accessibilityRole="button" onPress={enableFaceId} style={styles.faceIdButton}>
                  <Text style={styles.faceIdButtonText}>Enable Face ID</Text>
                </Pressable>
              ) : biometricEnabled ? (
                <Text style={styles.protectedLabel}>Face ID protected</Text>
              ) : null}
            </View>
            {notice ? (
              <View accessibilityRole="alert" style={styles.notice}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}
            {customerWebViewCanMount ? (
              <WebView
                allowsBackForwardNavigationGestures
                cacheEnabled
                domStorageEnabled
                javaScriptEnabled
                key="prestige-customer-webview"
                ref={webViewRef}
                injectedJavaScriptBeforeContentLoaded={installationId ? `window.__prestigeCustomerInstallationId = ${JSON.stringify(installationId)}; window.__prestigeCustomerNativeAlerts = { available: true, enabled: ${JSON.stringify(nativeAlertsEnabled)} }; true;` : undefined}
                mixedContentMode="never"
                onMessage={handleCustomerNativeBridgeMessage}
                onNavigationStateChange={updateNavigation}
                onLoadEnd={(event) => {
                  const loadedUrl = event.nativeEvent.url;
                  setLoadedCustomerWebView((previous) => ({
                    sequence: previous.sequence + 1,
                    url: loadedUrl,
                  }));
                }}
                onShouldStartLoadWithRequest={allowNavigation}
                originWhitelist={["https://app.prestigelimo.sg", "https://www.google.com"]}
                pullToRefreshEnabled
                setSupportMultipleWindows={false}
                sharedCookiesEnabled
                source={{ uri: currentUrl }}
                style={styles.webView}
                thirdPartyCookiesEnabled={false}
              />
            ) : null}
            <View style={styles.tabBar}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "book" }}
                onPress={() => selectTab("book")}
                style={[styles.tab, activeTab === "book" && styles.activeTab]}
              >
                <Text style={[styles.tabText, activeTab === "book" && styles.activeTabText]}>
                  Request a Ride
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === "bookings" }}
                onPress={() => selectTab("bookings")}
                style={[styles.tab, activeTab === "bookings" && styles.activeTab]}
              >
                <Text style={[styles.tabText, activeTab === "bookings" && styles.activeTabText]}>
                  My Bookings
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
        {webLayerLocked ? (
          <SafeAreaView style={[styles.lockedSafeArea, styles.lockOverlay]}>
            <Image
              alt="Prestige SG"
              accessibilityIgnoresInvertColors
              source={prestigeIcon}
              style={styles.lockedLogo}
            />
            <Text style={styles.lockedTitle}>Prestige SG</Text>
            <Text style={styles.lockedText}>Your booking information is protected.</Text>
            {unlockState === "locked" ? (
              biometricAvailable && !biometricEnabled ? (
                <>
                  <Pressable accessibilityRole="button" onPress={enableFaceId} style={styles.unlockButton}>
                    <Text style={styles.unlockButtonText}>Enable Face ID</Text>
                  </Pressable>
                  {notice ? <Text style={styles.lockedText}>{notice}</Text> : null}
                </>
              ) : (
                <>
                  <Pressable accessibilityRole="button" onPress={unlockCustomerApp} style={styles.unlockButton}>
                    <Text style={styles.unlockButtonText}>Unlock Prestige SG</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setActiveTab("bookings");
                      setCurrentUrl(`${customerTabUrl("bookings").replace("/my-bookings", "/customer-access/sign-in")}?installation=${encodeURIComponent(installationId)}`);
                      setCustomerUnlockState("ready");
                    }}
                    style={styles.pinButton}
                  >
                    <Text style={styles.pinButtonText}>Use 6-digit PIN</Text>
                  </Pressable>
                </>
              )
            ) : (
              <Text style={styles.checkingText}>
                {unlockState === "checking" ? "Checking Face ID…" : "Preparing Prestige SG…"}
              </Text>
            )}
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
  activeTab: { borderTopColor: colors.gold },
  activeTabText: { color: colors.ink, fontWeight: "700" },
  brand: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  checkingText: { color: colors.muted, fontSize: 14, marginTop: 18 },
  faceIdButton: { borderColor: colors.gold, borderRadius: 7, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  faceIdButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  header: { alignItems: "center", backgroundColor: colors.white, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", minHeight: 46, paddingHorizontal: 12, paddingVertical: 4 },
  headerText: { flex: 1, marginLeft: 8 },
  hiddenWebLayer: { opacity: 0 },
  lockedLogo: { borderRadius: 22, height: 88, width: 88 },
  lockedSafeArea: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 24 },
  lockedText: { color: colors.muted, fontSize: 15, marginTop: 8, textAlign: "center" },
  lockedTitle: { color: colors.ink, fontSize: 25, fontWeight: "700", marginTop: 18 },
  lockOverlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, zIndex: 10 },
  logo: { borderRadius: 6, height: 30, width: 30 },
  notice: { backgroundColor: "#fff8e7", borderBottomColor: "#e8d6a8", borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  noticeText: { color: "#6b4f16", fontSize: 12, lineHeight: 17 },
  pinButton: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, marginTop: 10, minWidth: 210, paddingHorizontal: 18, paddingVertical: 12 },
  pinButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700", textAlign: "center" },
  protectedLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  root: { backgroundColor: colors.background, flex: 1 },
  safeArea: { backgroundColor: colors.white, flex: 1 },
  tab: { alignItems: "center", borderTopColor: "transparent", borderTopWidth: 2, flex: 1, justifyContent: "center", minHeight: 52, paddingHorizontal: 8 },
  tabBar: { backgroundColor: colors.white, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row" },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  unlockButton: { backgroundColor: colors.ink, borderRadius: 10, marginTop: 24, minWidth: 210, paddingHorizontal: 18, paddingVertical: 13 },
  unlockButtonText: { color: colors.white, fontSize: 15, fontWeight: "700", textAlign: "center" },
  webLayer: { flex: 1 },
  webView: { backgroundColor: colors.background, flex: 1 },
});
