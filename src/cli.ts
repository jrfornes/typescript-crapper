#!/usr/bin/env node
import { resolve } from "node:path";

import { analyzeFiles } from "./analyze.js";
import { loadCoverageBundle } from "./coverage/load.js";
import { planCoverageCommand, runCommand, runShellCommand, showCommand } from "./coverage/run.js";
import { resolveSelectedFiles } from "./discover.js";
import { formatReport } from "./output/console.js";
import { writeMetricsAtomic } from "./output/metrics.js";
import { parseArgs } from "./options.js";
import { thresholdExceeded } from "./scoring.js";

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    console.error("Try --help for usage.");
    return 1;
  }

  if (parsed.action === "help" || parsed.action === "version") {
    process.stdout.write(parsed.message ?? "");
    return parsed.exitCode ?? 0;
  }

  const projectRoot = resolve(parsed.projectRoot);
  let files: string[];
  try {
    files = await resolveSelectedFiles({
      projectRoot,
      sourceRoots: parsed.sourceRoots,
      positionals: parsed.positionals,
      changed: parsed.changed,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "GIT_STATUS_FAILED") {
      console.error("Could not read git status.");
      return 1;
    }
    throw error;
  }

  if (files.length === 0) {
    console.log("No TypeScript sources selected.");
    return 0;
  }

  let coverageFailed = false;
  let bundle = null;

  if (parsed.noCoverage) {
    bundle = null;
  } else if (parsed.coverageCommand) {
    console.error(`+ (${projectRoot}) ${parsed.coverageCommand}`);
    const result = await runShellCommand(parsed.coverageCommand, projectRoot);
    if (result.exitCode !== 0) {
      console.error("Coverage command failed.");
      coverageFailed = true;
    } else {
      bundle = await loadCoverageBundle(projectRoot);
    }
  } else if (parsed.useExistingCoverage) {
    bundle = await loadCoverageBundle(projectRoot);
  } else {
    const plan = await planCoverageCommand(files[0]!, projectRoot);
    if ("error" in plan) {
      console.error(plan.guidance ?? "Coverage generation is not available.");
      return 3;
    }
    console.error(`+ (${plan.packageDir}) ${showCommand(plan.command)}`);
    const result = await runCommand(plan.command, plan.packageDir);
    if (result.exitCode !== 0) {
      console.error("Coverage generation failed.");
      return 3;
    }
    bundle = await loadCoverageBundle(projectRoot);
  }

  if (coverageFailed) {
    return 3;
  }

  const { entries, diagnostics } = await analyzeFiles({
    projectRoot,
    files,
    bundle,
    strict: parsed.strict,
  });

  for (const diagnostic of diagnostics) {
    const loc = diagnostic.startLine ? `:${diagnostic.startLine}` : "";
    console.error(
      `${diagnostic.severity} [${diagnostic.code}] ${diagnostic.path}${loc}: ${diagnostic.message}`,
    );
  }

  if (parsed.strict && diagnostics.length > 0) {
    return 1;
  }

  process.stdout.write(formatReport(entries));

  const metricsPath = await writeMetricsAtomic(entries, projectRoot);
  console.error(`Wrote ${metricsPath}`);

  if (parsed.threshold !== undefined && thresholdExceeded(entries, parsed.threshold)) {
    console.error(`CRAP threshold ${parsed.threshold} exceeded.`);
    return 2;
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
