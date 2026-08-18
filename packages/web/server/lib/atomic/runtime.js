import { execFile as nodeExecFile } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024;
const HASH_PATTERN = /^[A-Z2-7]{4,52}$/i;
const VIEW_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const queues = new Map();

const isRecord = (value) => Boolean(value) && value.constructor === Object;
const isString = (value) => value?.constructor === String;
const isBoolean = (value) => value?.constructor === Boolean;
const isHash = (value) => isString(value) && HASH_PATTERN.test(value);
const isOptionalString = (value) => value === undefined || value === null || isString(value);

export class AtomicRuntimeError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'AtomicRuntimeError';
    this.code = code;
  }
}

const incompatibleOutput = (kind) => new AtomicRuntimeError(
  'VERSION_INCOMPATIBLE',
  `The installed Atomic CLI returned an unsupported ${kind} format`,
);

const parseJson = (text, kind) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AtomicRuntimeError(
      'VERSION_INCOMPATIBLE',
      `The installed Atomic CLI returned malformed ${kind} JSON`,
      error,
    );
  }
};

const parseStatus = (text) => {
  const entries = [];
  const kinds = {
    'A ': 'added',
    AD: 'added',
    'R ': 'renamed',
    'M ': 'modified',
    'C ': 'conflicted',
    'D ': 'deleted',
    DD: 'deleted',
    'T ': 'modified',
    'P ': 'modified',
    '??': 'untracked',
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^(\?\?|A |AD|R |M |C |D |DD|T |P ) (.+)$/.exec(line);
    if (!match || !match[2].trim()) throw incompatibleOutput('status');
    const code = match[1];
    const renamed = code === 'R ' ? /^(.+?)\s+->\s+(.+)$/.exec(match[2]) : null;
    entries.push(renamed
      ? { kind: kinds[code], previousPath: renamed[1], path: renamed[2] }
      : { kind: kinds[code], path: match[2] });
  }
  return { clean: entries.length === 0, entries };
};

const parseViews = (text) => {
  const views = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([* ]) ([^\s]+)$/.exec(line);
    if (!match || !VIEW_PATTERN.test(match[2])) {
      throw incompatibleOutput('view list');
    }
    views.push({
      name: match[2],
      scope: 'unknown',
      changeCount: null,
      state: null,
      current: match[1] === '*',
    });
  }
  if (views.length === 0 || views.filter((view) => view.current).length !== 1) {
    throw incompatibleOutput('view list');
  }
  return views;
};

const parseHistory = (text) => {
  const value = parseJson(text, 'history');
  if (!Array.isArray(value)) throw incompatibleOutput('history');

  const changes = value.map((entry) => {
    if (!isRecord(entry) || !isHash(entry.hash) || !isString(entry.message)) {
      throw incompatibleOutput('history');
    }
    return {
      hash: entry.hash,
      sequence: Number.isInteger(entry.sequence) ? entry.sequence : null,
      state: isHash(entry.state) ? entry.state : null,
      message: entry.message,
      timestamp: isString(entry.timestamp) && !Number.isNaN(Date.parse(entry.timestamp)) ? entry.timestamp : null,
      author: isString(entry.author) ? entry.author : null,
      tagged: isBoolean(entry.is_tagged) ? entry.is_tagged : null,
    };
  });

  const missing = ['author', 'timestamp', 'tagged'].filter((field) => (
    (changes.length === 0 && field === 'author') || changes.some((change) => change[field] === null)
  ));
  return {
    changes,
    metadata: missing.length > 0 ? { completeness: 'partial', missing } : { completeness: 'complete' },
  };
};

const authorName = (authors) => {
  const first = authors[0];
  if (isString(first)) return first;
  if (!isRecord(first)) return null;
  if (isString(first.name)) return first.name;
  return isString(first.email) ? first.email : null;
};

const isFiniteNumber = (value) => value?.constructor === Number && Number.isFinite(value);
const optionalString = (value) => (isString(value) ? value : null);
const optionalNumber = (value) => (isFiniteNumber(value) ? value : null);

// The change JSON's `provenance` object is the inline AI attestation (vendor,
// model, tokens, cost, session, metadata). It is best-effort telemetry, so it
// is normalized field-by-field and any malformed/missing part degrades to null
// rather than failing the whole change read.
const normalizeAttestation = (value) => {
  if (!isRecord(value)) return null;

  const tokens = isRecord(value.tokens)
    ? {
      input: optionalNumber(value.tokens.input),
      output: optionalNumber(value.tokens.output),
      total: optionalNumber(value.tokens.total),
    }
    : null;

  const cost = isRecord(value.cost) && isFiniteNumber(value.cost.amount_micros) && isString(value.cost.currency)
    ? { amountMicros: value.cost.amount_micros, currency: value.cost.currency }
    : null;

  const metadata = Array.isArray(value.metadata)
    ? value.metadata
      .filter((entry) => isRecord(entry) && isString(entry.key) && isString(entry.value))
      .map((entry) => ({ key: entry.key, value: entry.value }))
    : [];

  const attestation = {
    vendor: optionalString(value.vendor),
    model: optionalString(value.model),
    tool: optionalString(value.tool),
    suggestionType: optionalString(value.suggestion_type),
    tokens,
    cost,
    sessionId: optionalString(value.session_id),
    finishReason: optionalString(value.finish_reason),
    stepCount: Number.isInteger(value.step_count) ? value.step_count : null,
    metadata,
  };

  // Nothing recognizable → treat as no attestation so the UI shows no panel.
  const hasSignal = attestation.vendor || attestation.model || attestation.tool
    || attestation.sessionId || attestation.tokens || attestation.cost || attestation.metadata.length > 0;
  return hasSignal ? attestation : null;
};

const parseChange = (text) => {
  const value = parseJson(text, 'change');
  if (
    !isRecord(value)
    || !isHash(value.hash)
    || !isString(value.message)
    || !isString(value.timestamp)
    || Number.isNaN(Date.parse(value.timestamp))
    || !Array.isArray(value.authors)
    || !Array.isArray(value.dependencies)
    || !Array.isArray(value.hunks)
    || !value.hunks.every((hunk) => isRecord(hunk) && isString(hunk.hunk_type) && isString(hunk.path))
    || !value.dependencies.every((dependency) => isString(dependency) || isRecord(dependency))
    || !value.authors.every((author) => isString(author) || isRecord(author))
    || (value.has_provenance !== undefined && !isBoolean(value.has_provenance))
    || (value.sequence !== undefined && !Number.isInteger(value.sequence))
  ) {
    throw incompatibleOutput('change');
  }

  return {
    hash: value.hash,
    sequence: value.sequence ?? null,
    state: null,
    message: value.message,
    timestamp: value.timestamp,
    author: authorName(value.authors),
    tagged: null,
    hunks: value.hunks.map((hunk) => ({ kind: hunk.hunk_type, path: hunk.path })),
    hasProvenance: value.has_provenance ?? null,
    attestation: normalizeAttestation(value.provenance),
  };
};

const parseProvenance = (text) => {
  const value = parseJson(text, 'provenance');
  if (
    !isRecord(value)
    || !isOptionalString(value.id)
    || (!('@context' in value) && !('@graph' in value))
    || ('@graph' in value && !Array.isArray(value['@graph']))
  ) {
    throw incompatibleOutput('provenance');
  }
  return value;
};

const errorText = (error) => [error?.message, error?.stderr, error?.stdout]
  .filter(isString)
  .join('\n');

const classifyExecutionError = (error) => {
  if (error?.code === 'ENOENT') {
    return new AtomicRuntimeError('CLI_MISSING', 'Atomic CLI is not installed', error);
  }
  if (error?.killed || error?.code === 'ETIMEDOUT') {
    return new AtomicRuntimeError('TIMEOUT', 'Atomic CLI request timed out', error);
  }
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return new AtomicRuntimeError('OUTPUT_LIMIT', 'Atomic CLI output exceeded the server limit', error);
  }

  const text = errorText(error);
  if (/database already open|cannot acquire lock|database is locked/i.test(text)) {
    return new AtomicRuntimeError('BUSY', 'Atomic repository is busy', error);
  }
  if (/not (?:in )?(?:an? )?atomic repository|no atomic repository|\.atomic.*not found/i.test(text)) {
    return new AtomicRuntimeError('NOT_REPOSITORY', 'Directory is not an Atomic repository', error);
  }
  if (/unexpected argument|unrecognized (?:option|subcommand)|invalid value.*format|usage:/i.test(text)) {
    return new AtomicRuntimeError('VERSION_INCOMPATIBLE', 'Installed Atomic CLI is incompatible', error);
  }
  return new AtomicRuntimeError('COMMAND_FAILED', 'Atomic CLI request failed', error);
};

const serialize = async (key, operation) => {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(key, current);
  try {
    return await current;
  } finally {
    if (queues.get(key) === current) queues.delete(key);
  }
};

export const createAtomicRuntime = (dependencies = {}) => {
  const execFile = dependencies.execFile ?? nodeExecFile;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = dependencies.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const binary = dependencies.binary ?? 'atomic';

  const execute = (directory, args) => serialize(directory, () => new Promise((resolve, reject) => {
    execFile(binary, args, {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1', CLICOLOR: '0', RUST_LOG: 'off', TERM: 'dumb' },
      timeout: timeoutMs,
      maxBuffer,
      windowsHide: true,
      shell: false,
    }, (error, stdout) => {
      if (error) return reject(classifyExecutionError(error));
      return resolve(stdout);
    });
  }));

  return {
    async overview(directory) {
      const workingCopy = parseStatus(await execute(directory, ['status', '-s', '--no-color']));
      const views = parseViews(await execute(directory, ['view', 'list', '--short', '--no-color']));
      return { status: 'ready', workingCopy, views, currentView: views.find((view) => view.current) };
    },

    async diff(directory, options = {}) {
      const args = ['diff', '--no-color', '--context', String(options.context)];
      if (options.change) args.push('-c', options.change);
      if (options.paths?.length) args.push('--', ...options.paths);
      return { diff: await execute(directory, args) };
    },

    async history(directory, options = {}) {
      const args = ['log', '-n', String(options.count), '-f', 'json', '--full-hash', '--no-color'];
      if (options.view) args.push('--view', options.view);
      return parseHistory(await execute(directory, args));
    },

    async change(directory, hash) {
      const args = ['change', hash, '-f', 'json', '--full-hash', '--no-color'];
      return parseChange(await execute(directory, args));
    },

    async provenance(directory, hash) {
      return {
        status: 'available',
        document: parseProvenance(await execute(directory, ['provenance', 'show', hash, '--no-color'])),
      };
    },
  };
};
