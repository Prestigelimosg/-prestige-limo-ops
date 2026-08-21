import { StatusBar } from "expo-status-bar";
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
import { WebView, type WebViewNavigation } from "react-native-webview";

import prestigeIcon from "./assets/icon.png";

import {
  customerTabForUrl,
  customerTabUrl,
  customerUniversalLinkUrl,
  isAllowedNativeContactUrl,
  shouldAllowCustomerWebViewNavigation,
  type CustomerTab,
} from "./src/customer-navigation";
import {
  authenticateCustomerAppUnlock,
  customerBiometricsAvailable,
  enableCustomerBiometricUnlock,
  isCustomerBiometricUnlockEnabled,
} from "./src/customer-installation";

type UnlockState = "checking" | "locked" | "ready";

export default function App() {
  const [activeTab, setActiveTab] = useState<CustomerTab>("book");
  const [currentUrl, setCurrentUrl] = useState(customerTabUrl("book"));
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [unlockState, setUnlockState] = useState<UnlockState>("checking");
  const [notice, setNotice] = useState("");
  const biometricPromptBusyRef = useRef(false);
  const pendingCustomerUniversalLinkRef = useRef<string | null>(null);
  const unlockStateRef = useRef<UnlockState>("checking");

  const openCustomerUniversalLink = useCallback((safeUrl: string) => {
    pendingCustomerUniversalLinkRef.current = null;
    setActiveTab("bookings");
    setCurrentUrl(safeUrl);
    setNotice("");
  }, []);

  const setCustomerUnlockState = useCallback((nextState: UnlockState) => {
    unlockStateRef.current = nextState;
    setUnlockState(nextState);

    const pendingUrl = pendingCustomerUniversalLinkRef.current;
    if (nextState === "ready" && pendingUrl) {
      openCustomerUniversalLink(pendingUrl);
    }
  }, [openCustomerUniversalLink]);

  const unlockCustomerApp = useCallback(async () => {
    if (biometricPromptBusyRef.current) return;
    biometricPromptBusyRef.current = true;
    setCustomerUnlockState("checking");
    try {
      const unlocked = await authenticateCustomerAppUnlock().catch(() => false);
      setCustomerUnlockState(unlocked ? "ready" : "locked");
    } finally {
      biometricPromptBusyRef.current = false;
    }
  }, [setCustomerUnlockState]);

  useEffect(() => {
    let mounted = true;

    async function preparePrivacyLock() {
      const [available, enabled] = await Promise.all([
        customerBiometricsAvailable().catch(() => false),
        isCustomerBiometricUnlockEnabled().catch(() => false),
      ]);
      if (!mounted) return;

      setBiometricAvailable(available);
      setBiometricEnabled(enabled);
      if (!enabled) {
        setCustomerUnlockState("ready");
        return;
      }

      biometricPromptBusyRef.current = true;
      const unlocked = await authenticateCustomerAppUnlock().catch(() => false);
      biometricPromptBusyRef.current = false;
      if (mounted) setCustomerUnlockState(unlocked ? "ready" : "locked");
    }

    void preparePrivacyLock();
    return () => { mounted = false; };
  }, [setCustomerUnlockState]);

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
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const returning = previousState !== "active" && nextState === "active";
      previousState = nextState;

      if (nextState !== "active" && biometricEnabled) {
        setCustomerUnlockState("locked");
      }
      if (returning && biometricEnabled) {
        void unlockCustomerApp();
      }
    });
    return () => subscription.remove();
  }, [biometricEnabled, setCustomerUnlockState, unlockCustomerApp]);

  const enableFaceId = useCallback(async () => {
    const enabled = await enableCustomerBiometricUnlock().catch(() => false);
    if (!enabled) {
      setNotice("Face ID was not enabled. Your booking pages remain available.");
      return;
    }
    setBiometricEnabled(true);
    setCustomerUnlockState("ready");
    setNotice("Face ID is now protecting Prestige SG on this iPhone.");
  }, [setCustomerUnlockState]);

  const selectTab = useCallback((tab: CustomerTab) => {
    setActiveTab(tab);
    setCurrentUrl(customerTabUrl(tab));
    setNotice("");
  }, []);

  const allowNavigation = useCallback((request: { url: string }) => {
    if (shouldAllowCustomerWebViewNavigation(request.url)) return true;

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
  }, []);

  if (unlockState !== "ready") {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.lockedSafeArea}>
          <StatusBar style="dark" />
          <Image
            alt="Prestige SG"
            accessibilityIgnoresInvertColors
            source={prestigeIcon}
            style={styles.lockedLogo}
          />
          <Text style={styles.lockedTitle}>Prestige SG</Text>
          <Text style={styles.lockedText}>Your booking information is protected.</Text>
          {unlockState === "locked" ? (
            <Pressable accessibilityRole="button" onPress={unlockCustomerApp} style={styles.unlockButton}>
              <Text style={styles.unlockButtonText}>Unlock Prestige SG</Text>
            </Pressable>
          ) : (
            <Text style={styles.checkingText}>Checking Face ID…</Text>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <StatusBar style="dark" />
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
        <WebView
          allowsBackForwardNavigationGestures
          cacheEnabled
          domStorageEnabled
          javaScriptEnabled
          key="prestige-customer-webview"
          mixedContentMode="never"
          onNavigationStateChange={updateNavigation}
          onShouldStartLoadWithRequest={allowNavigation}
          originWhitelist={["https://app.prestigelimo.sg"]}
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          source={{ uri: currentUrl }}
          style={styles.webView}
          thirdPartyCookiesEnabled={false}
        />
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
  lockedLogo: { borderRadius: 22, height: 88, width: 88 },
  lockedSafeArea: { alignItems: "center", backgroundColor: colors.background, flex: 1, justifyContent: "center", padding: 24 },
  lockedText: { color: colors.muted, fontSize: 15, marginTop: 8, textAlign: "center" },
  lockedTitle: { color: colors.ink, fontSize: 25, fontWeight: "700", marginTop: 18 },
  logo: { borderRadius: 6, height: 30, width: 30 },
  notice: { backgroundColor: "#fff8e7", borderBottomColor: "#e8d6a8", borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  noticeText: { color: "#6b4f16", fontSize: 12, lineHeight: 17 },
  protectedLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  safeArea: { backgroundColor: colors.white, flex: 1 },
  tab: { alignItems: "center", borderTopColor: "transparent", borderTopWidth: 2, flex: 1, justifyContent: "center", minHeight: 52, paddingHorizontal: 8 },
  tabBar: { backgroundColor: colors.white, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row" },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  unlockButton: { backgroundColor: colors.ink, borderRadius: 10, marginTop: 24, minWidth: 210, paddingHorizontal: 18, paddingVertical: 13 },
  unlockButtonText: { color: colors.white, fontSize: 15, fontWeight: "700", textAlign: "center" },
  webView: { backgroundColor: colors.background, flex: 1 },
});
