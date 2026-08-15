// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAndroidManifest } = require("expo/config-plugins");

const imageCaptureAction = "android.media.action.IMAGE_CAPTURE";

module.exports = function withDriverCameraQuery(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    const queries = Array.isArray(manifest.queries) ? manifest.queries : [];
    const alreadyDeclared = queries.some((query) =>
      query.intent?.some((intent) =>
        intent.action?.some(
          (action) => action.$?.["android:name"] === imageCaptureAction,
        ),
      ),
    );

    if (!alreadyDeclared) {
      queries.push({
        intent: [
          {
            action: [{ $: { "android:name": imageCaptureAction } }],
          },
        ],
      });
    }

    manifest.queries = queries;
    return configWithManifest;
  });
};
