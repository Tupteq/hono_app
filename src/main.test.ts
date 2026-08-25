import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "./main.ts";

test("GET /", async () => {
  const res = await app.request("/");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { message: "Hello World" });
});
