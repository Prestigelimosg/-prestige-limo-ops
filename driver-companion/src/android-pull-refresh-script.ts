// Only the Android shell injects this script into its existing top-level WebView.
export const androidPullRefreshScript = String.raw`
(function () {
  if (window.top !== window || location.origin !== "https://app.prestigelimo.sg") return;
  if (window.__prestigeAndroidPullRefresh) return;
  var start = null, armed = false, pending = false, dirty = false, indicator = null;
  function hide() {
    if (indicator) { indicator.remove(); indicator = null; }
  }
  function cancel() { start = null; armed = false; hide(); }
  function atTop() {
    var root = document.scrollingElement || document.documentElement;
    return (root.scrollTop || window.scrollY || 0) <= 1;
  }
  function unsafe(target) {
    if (!target || !target.closest || pending || !atTop() || document.visibilityState !== "visible") return true;
    if (window.getSelection && window.getSelection() && !window.getSelection().isCollapsed) return true;
    if (target.closest("input,textarea,select,button,a,label,[contenteditable=true],[role=button],[role=slider],iframe,canvas,svg,.gm-style,[role=application]")) return true;
    for (var node = target; node && node !== document.scrollingElement && node !== document.documentElement && node !== document.body; node = node.parentElement) {
      var style = getComputedStyle(node);
      if (node.scrollTop > 0 || ((/auto|scroll/.test(style.overflowY)) && node.scrollHeight > node.clientHeight + 1) ||
          style.touchAction === "none") return true;
    }
    return false;
  }
  function show(distance) {
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.setAttribute("role", "status");
      indicator.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:#fff;color:#152338;border:1px solid #c7a34a;border-radius:24px;padding:10px 18px;font:600 14px system-ui;box-shadow:0 2px 8px #0002";
      document.body.appendChild(indicator);
    }
    indicator.textContent = distance >= 90 ? "Release to refresh" : "Pull to refresh";
  }
  window.__prestigeAndroidPullRefresh = {
    finish: function () { pending = false; cancel(); }
  };
  document.addEventListener("input", function () { dirty = true; cancel(); }, true);
  document.addEventListener("change", function () { dirty = true; cancel(); }, true);
  document.addEventListener("visibilitychange", cancel, true);
  document.addEventListener("touchstart", function (event) {
    cancel();
    if (event.touches.length !== 1 || unsafe(event.target)) return;
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY, target: event.target };
  }, { passive: true });
  document.addEventListener("touchmove", function (event) {
    if (!start) return;
    if (event.touches.length !== 1 || unsafe(start.target)) { cancel(); return; }
    var dx = Math.abs(event.touches[0].clientX - start.x);
    var dy = event.touches[0].clientY - start.y;
    if (dx > 25 || dy < -5) { cancel(); return; }
    if (dy < 15) return;
    if (event.cancelable) event.preventDefault();
    armed = dy >= 90;
    show(dy);
  }, { passive: false });
  document.addEventListener("touchend", function () {
    var refresh = start && armed && !unsafe(start.target);
    cancel();
    if (!refresh) return;
    if (dirty && !window.confirm("Refresh this page? Unsaved edits may be lost.")) return;
    pending = true;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "prestige_android_pull_refresh", version: 1 }));
  }, { passive: true });
  document.addEventListener("touchcancel", cancel, { passive: true });
})();
true;
`;
