import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Node's direct TypeScript harness needs the extension that Next's bundler resolves.
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href,
      };
    }

    return nextResolve(specifier, context);
  },
});
