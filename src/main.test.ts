import assert from "node:assert/strict";
import { test } from "node:test";

test("GET /", async () => {
  // main.ts reads LABEL at import time, so it has to be set before the module loads.
  process.env.LABEL = "test";
  const { app } = await import("./main.ts");
  const res = await app.request("/");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { message: "Hello World", label: "test" });
});
