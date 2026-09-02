import { checkCleanBaseline } from "./build.mjs";
try { const result = await checkCleanBaseline(); process.stdout.write(`Clean baseline verified (${result.checkedFiles} files).\n`); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
