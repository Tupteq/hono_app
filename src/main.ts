// Hono application and its AWS Lambda handler.

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";

export const app = new Hono();

app.get("/", (c) => c.json({ message: "Hello World" }));

export const handler = handle(app);
