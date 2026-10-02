#!/usr/bin/env node
// Runs the Next.js CLI with project defaults. Used by `npm run dev` and `npm run build`.
import { checkNode, runNext } from "./lib.mjs";

checkNode();
runNext(process.argv.slice(2));
