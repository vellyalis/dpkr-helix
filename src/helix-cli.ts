#!/usr/bin/env node
import { runHelixCli } from "./helix-launcher.js";

runHelixCli(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
