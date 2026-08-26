// Hono application and its AWS Lambda handler.

import { Hono } from "hono";
import { handle } from "hono/aws-lambda";

// Set on the Lambda by the stack from the LABEL deploy parameter; locally, export it yourself.
const label = process.env.LABEL;
if (!label) throw new Error("LABEL is required; export it before starting the app.");

export const app = new Hono();

app.get("/", (c) => c.json({ message: "Hello World", label }));

export const handler = handle(app);
