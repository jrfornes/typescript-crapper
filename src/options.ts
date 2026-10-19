import { METRIC_VERSION } from "./model.js";

export const HELP = `Usage: typescript-crapper [options] [path-or-filter ...]

Analyze TypeScript sources and score CRAP metrics.
CRAP = CC² × (1 − coverage/100)³ + CC

Metric version: ${METRIC_VERSION}

Options:
  -h, --help                    Print help and exit.
  --version                     Print version and metric version.
  --metric-version              Print metric version and exit.
  --root <path>                 Project root (default: current directory).
  -s, --source-root <path>      Walk this tree instead of the project root.
  --changed                     Analyze added/modified TypeScript files from git.
  --no-coverage                 Complexity only; coverage and CRAP are N/A.
  --use-existing-coverage       Read LCOV already on disk.
  --coverage-command <cmd>      Run this shell command to generate coverage.
  --threshold <number>          Exit 2 when the worst CRAP exceeds this value.
  --strict                      Treat parser warnings as fatal errors.
`;

export interface ParsedCli {
  action: "help" | "version" | "analyze";
  projectRoot: string;
  sourceRoots: string[];
  positionals: string[];
  noCoverage: boolean;
  useExistingCoverage: boolean;
  coverageCommand?: string;
  threshold?: number;
  changed: boolean;
  strict: boolean;
  message?: string;
  exitCode?: number;
}

function takeValue(args: string[], index: number, option: string): string {
  if (index + 1 >= args.length || !args[index + 1] || args[index + 1]!.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return args[index + 1]!;
}

export function parseArgs(argv: string[]): ParsedCli {
  if (argv.some((arg) => arg === "-h" || arg === "--help")) {
    return { action: "help", message: HELP, exitCode: 0, projectRoot: ".", sourceRoots: [], positionals: [], noCoverage: false, useExistingCoverage: false, changed: false, strict: false };
  }
  if (argv.includes("--version")) {
    return {
      action: "version",
      message: `typescript-crapper 0.1.0 (${METRIC_VERSION})\n`,
      exitCode: 0,
      projectRoot: ".",
      sourceRoots: [],
      positionals: [],
      noCoverage: false,
      useExistingCoverage: false,
      changed: false,
      strict: false,
    };
  }
  if (argv.includes("--metric-version")) {
    return {
      action: "version",
      message: `${METRIC_VERSION}\n`,
      exitCode: 0,
      projectRoot: ".",
      sourceRoots: [],
      positionals: [],
      noCoverage: false,
      useExistingCoverage: false,
      changed: false,
      strict: false,
    };
  }

  const options: ParsedCli = {
    action: "analyze",
    projectRoot: ".",
    sourceRoots: [],
    positionals: [],
    noCoverage: false,
    useExistingCoverage: false,
    changed: false,
    strict: false,
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index]!;
    if (arg === "--root") {
      options.projectRoot = takeValue(argv, index, arg);
      index += 2;
      continue;
    }
    if (arg === "-s" || arg === "--source-root") {
      options.sourceRoots.push(takeValue(argv, index, arg));
      index += 2;
      continue;
    }
    if (arg === "--no-coverage") {
      options.noCoverage = true;
      index += 1;
      continue;
    }
    if (arg === "--use-existing-coverage") {
      options.useExistingCoverage = true;
      index += 1;
      continue;
    }
    if (arg === "--coverage-command") {
      options.coverageCommand = takeValue(argv, index, arg);
      index += 2;
      continue;
    }
    if (arg === "--threshold") {
      const raw = takeValue(argv, index, arg);
      const value = Number.parseFloat(raw);
      if (Number.isNaN(value)) {
        throw new Error("--threshold requires a number");
      }
      options.threshold = value;
      index += 2;
      continue;
    }
    if (arg === "--changed") {
      options.changed = true;
      index += 1;
      continue;
    }
    if (arg === "--strict") {
      options.strict = true;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    options.positionals.push(arg);
    index += 1;
  }

  if (options.noCoverage && options.useExistingCoverage) {
    throw new Error("--no-coverage and --use-existing-coverage are mutually exclusive");
  }

  return options;
}
