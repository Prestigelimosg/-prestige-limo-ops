import "./src/background-location-task";

import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { applyNativeNoticeCleanup, nativeNoticeTaskData } from "./src/native-notifications";
import { registerRootComponent } from "expo";
import App from "./App";

const notificationCleanupTask = "prestige-driver-notice-cleanup-v1";
TaskManager.defineTask<Notifications.NotificationTaskPayload>(notificationCleanupTask, async ({ data, error }) => {
  if (!error) await applyNativeNoticeCleanup(nativeNoticeTaskData(data), Notifications).catch(() => undefined);
});
void Notifications.registerTaskAsync(notificationCleanupTask).catch(() => undefined);

registerRootComponent(App);
