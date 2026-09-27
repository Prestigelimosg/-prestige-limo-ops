import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const app = await readFile("customer-companion/App.tsx", "utf8");
const ast = ts.createSourceFile("App.tsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(ast);
const containers = nodes.filter((node) => ts.isJsxOpeningElement(node)
  && node.tagName.getText(ast) === "SafeAreaView"
  && node.attributes.properties.some((p) => p.name?.getText(ast) === "style"
    && p.initializer?.expression?.getText(ast) === "styles.safeArea"));
assert.equal(containers.length, 1, "Keep one existing unlocked Customer safe-area container");
const edges = containers[0].attributes.properties.find((p) => p.name?.getText(ast) === "edges")
  ?.initializer?.expression;
assert.ok(edges, "The Customer container must explicitly preserve platform-specific edges");

// Execute the real installed safe-area library: an omitted edge maps to off.
const safeAreaSource = await readFile(
  "customer-companion/node_modules/react-native-safe-area-context/src/SafeAreaView.tsx", "utf8",
);
const safeAreaModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(safeAreaSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText, {
  module: safeAreaModule, exports: safeAreaModule.exports,
  require: (id) => {
    if (id === "react") return {
      forwardRef: (render) => render,
      useMemo: (callback) => callback(),
      createElement: (_type, props) => props,
    };
    if (id === "./specs/NativeSafeAreaView") return { default: "NativeSafeAreaView" };
    throw new Error(`Unexpected safe-area dependency: ${id}`);
  },
});
for (const platform of ["android", "ios"]) {
  const selected = vm.runInNewContext(`(${edges.getText(ast)})`, { Platform: { OS: platform } });
  const nativeProps = safeAreaModule.exports.SafeAreaView({ edges: selected }, null);
  assert.deepEqual(Array.from(selected), platform === "android"
    ? ["top", "left", "right", "bottom"] : ["top", "left", "right"],
  `${platform}: reserve Android bottom navigation space and preserve the existing iOS layout`);
  assert.equal(nativeProps.edges.bottom, platform === "android" ? "additive" : "off");
}

// Execute the existing tab callback against the actual approved URL mapper.
const navigation = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  await readFile("customer-companion/src/customer-navigation.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { module: navigation, exports: navigation.exports, URL });
const tabDeclaration = nodes.find((node) => ts.isVariableDeclaration(node)
  && node.name.getText(ast) === "selectTab");
const callback = tabDeclaration?.initializer?.arguments?.[0];
assert.ok(callback && ts.isArrowFunction(callback), "Preserve the existing selectTab callback");
const calls = [];
const context = {
  customerTabUrl: navigation.exports.customerTabUrl,
  setActiveTab: (value) => calls.push(["tab", value]),
  setCurrentUrl: (value) => calls.push(["url", value]),
  setNotice: (value) => calls.push(["notice", value]),
};
vm.runInNewContext(ts.transpileModule(`const selectTab = ${callback.getText(ast)};
selectTab("book"); selectTab("bookings");`, {}).outputText, context);
assert.deepEqual(calls, [
  ["tab", "book"], ["url", "https://app.prestigelimo.sg/book"], ["notice", ""],
  ["tab", "bookings"], ["url", "https://app.prestigelimo.sg/my-bookings"], ["notice", ""],
]);
const tabPressables = nodes.filter((node) => ts.isJsxOpeningElement(node)
  && node.tagName.getText(ast) === "Pressable"
  && node.attributes.properties.some((p) => p.name?.getText(ast) === "accessibilityRole"
    && p.initializer?.text === "tab"));
assert.equal(tabPressables.length, 2, "Keep exactly the two established native tabs");
assert.deepEqual(tabPressables.map((node) => node.attributes.properties.find(
  (p) => p.name?.getText(ast) === "onPress",
)?.initializer?.expression?.getText(ast)), [
  '() => selectTab("book")', '() => selectTab("bookings")',
]);
console.log("Customer Android bottom safe area and existing tab routing guard passed.");
