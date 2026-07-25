/**
 * Boundary lint (TS side) — encodes the handbook §21 dependency rules.
 * Universal rule R4: never suppress these rules to make a PR pass;
 * changes to the allowed graph go through the Interface Change Protocol.
 *
 * Stub created by Task 0.1 (DevOps). Rules are active but trivially green
 * until workspaces contain code. Architecture Agent arbitrates changes.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "No dependency cycles anywhere.",
      from: {},
      to: { circular: true },
    },
    {
      name: "apps-not-into-services",
      severity: "error",
      comment:
        "Clients talk to services over HTTP via the generated api-client only (§21); never import server code.",
      from: { path: "^apps/" },
      to: { path: "^services/" },
    },
    {
      name: "no-cross-app-imports",
      severity: "error",
      comment: "Apps are independent leaves; shared code lives in packages/*.",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "packages-not-into-apps",
      severity: "error",
      comment: "packages/* are reusable libraries; they must not depend on app code.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "packages-not-into-services",
      severity: "error",
      comment: "TS packages must not reach into server code.",
      from: { path: "^packages/" },
      to: { path: "^services/" },
    },
    {
      name: "feature-code-not-into-tools",
      severity: "error",
      comment: "tools/* are build/dev pipelines, not runtime dependencies.",
      from: { path: "^(apps|packages)/" },
      to: { path: "^tools/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    exclude: { path: "node_modules|\\.turbo|dist|build" },
  },
};
