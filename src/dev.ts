// Local dev server: `npm run dev`.

import { serve } from "@hono/node-server";
import { app } from "./main.ts";

serve(app, (info) => console.log(`http://localhost:${info.port}`));
