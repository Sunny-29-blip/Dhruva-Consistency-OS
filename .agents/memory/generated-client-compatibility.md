---
name: Generated client compatibility
description: Workspace-specific TypeScript and Orval constraints encountered while building Dhruva.
---

The generated React client uses `Headers.entries()`, so its TypeScript project must include `dom.iterable` in addition to `dom`. Orval can also emit duplicate parameter names for a DELETE operation that combines a path parameter with a query parameter; avoid that shape or verify generated Zod exports before relying on codegen.

**Why:** The workspace's generated client and Zod barrel are typechecked together, so these issues fail the shared library build before an app can start.

**How to apply:** After every OpenAPI change, run codegen and the shared library typecheck before launching dependent frontend work.