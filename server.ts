#!/usr/bin/env bun
import { startServer } from "@agiterra/crew-tools";

startServer().catch((e) => {
  console.error("[crew] fatal:", e);
  process.exit(1);
});
