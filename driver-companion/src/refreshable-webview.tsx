import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from "react-native";
import { WebView as NativeWebView, type WebViewProps } from "react-native-webview";
import { androidPullRefreshScript } from "./android-pull-refresh-script";
export type WebView = NativeWebView;

const finishScript = "window.__prestigeAndroidPullRefresh?.finish(); true;";
const styles = StyleSheet.create({
  container: { flex: 1 },
  progress: { position: "absolute", top: 12, alignSelf: "center", backgroundColor: "#fff", borderRadius: 24, padding: 12 },
});

const AndroidWebView = forwardRef<NativeWebView, WebViewProps>(function AndroidWebView(props, ref) {
  const webView = useRef<NativeWebView>(null);
  const busy = useRef(false);
  const loading = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useImperativeHandle(ref, () => webView.current as NativeWebView);
  const settle = useCallback(() => {
    busy.current = false;
    loading.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRefreshing(false);
    webView.current?.injectJavaScript(finishScript);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <View style={styles.container}>
      <NativeWebView
        {...props}
        ref={webView}
        injectedJavaScript={`${props.injectedJavaScript || ""}\n${androidPullRefreshScript}`}
        onMessage={(event) => {
          let message;
          try { message = JSON.parse(event.nativeEvent.data); } catch { /* Existing bridge handles non-JSON. */ }
          if (message?.type !== "prestige_android_pull_refresh") {
            props.onMessage?.(event);
            return;
          }
          if (message.version !== 1 || Object.keys(message).sort().join(",") !== "type,version" ||
              !/^https:\/\/app\.prestigelimo\.sg(?:\/|$)/.test(event.nativeEvent.url) ||
              AppState.currentState !== "active") return;
          if (busy.current || loading.current) return;
          busy.current = true;
          setRefreshing(true);
          timer.current = setTimeout(settle, 20_000);
          webView.current?.reload();
        }}
        onLoadStart={(event) => {
          loading.current = true;
          props.onLoadStart?.(event);
        }}
        onLoadEnd={(event) => {
          settle();
          // Reinjection is idempotent, including pages restored from WebView history.
          webView.current?.injectJavaScript(androidPullRefreshScript);
          props.onLoadEnd?.(event);
        }}
        onError={(event) => { settle(); props.onError?.(event); }}
        onHttpError={(event) => { settle(); props.onHttpError?.(event); }}
      />
      {refreshing ? <View pointerEvents="none" style={styles.progress}><ActivityIndicator color="#98752b" accessibilityLabel="Refreshing" /></View> : null}
    </View>
  );
});

// iOS receives exactly its original props and the original native WebView.
export const WebView = forwardRef<NativeWebView, WebViewProps>(function WebView(props, ref) {
  return Platform.OS === "android"
    ? <AndroidWebView {...props} ref={ref} />
    : <NativeWebView {...props} ref={ref} />;
});
