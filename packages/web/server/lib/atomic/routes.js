import { AtomicRuntimeError } from './runtime.js';

const VIEW_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HASH_PATTERN = /^[A-Z2-7]{4,52}$/i;

const singleQuery = (value) => value?.constructor === String ? value.trim() : null;

const optionalView = (value) => {
  const view = singleQuery(value);
  if (value === undefined) return null;
  if (!view || !VIEW_PATTERN.test(view)) throw new Error('view parameter is invalid');
  return view;
};

const validPath = (value) => {
  const filePath = singleQuery(value);
  if (
    !filePath
    || filePath.length > 1024
    || filePath.includes('\0')
    || filePath.startsWith('/')
    || filePath.startsWith('\\')
    || /^[A-Za-z]:[\\/]/.test(filePath)
    || filePath.split(/[\\/]+/).some((segment) => segment === '..')
  ) {
    throw new Error('path parameter must be a repository-relative path');
  }
  return filePath;
};

const optionalPaths = (value) => {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 100) throw new Error('At most 100 path parameters are supported');
  return values.map(validPath);
};

const clampedInteger = (value, fallback, minimum, maximum, name) => {
  if (value === undefined) return fallback;
  const raw = singleQuery(value);
  if (!raw || !/^-?\d+$/.test(raw)) throw new Error(`${name} parameter must be an integer`);
  return Math.min(maximum, Math.max(minimum, Number(raw)));
};

const errorResponse = (res, error) => {
  if (!(error instanceof AtomicRuntimeError)) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid Atomic request' });
  }
  const statuses = {
    CLI_MISSING: 503,
    NOT_REPOSITORY: 409,
    VERSION_INCOMPATIBLE: 503,
    BUSY: 503,
    TIMEOUT: 504,
    OUTPUT_LIMIT: 413,
    COMMAND_FAILED: 502,
  };
  return res.status(statuses[error.code] ?? 500).json({ error: error.message, code: error.code });
};

const unavailableReason = (error) => {
  if (error.code === 'CLI_MISSING') return 'not-installed';
  if (error.code === 'NOT_REPOSITORY') return 'not-repository';
  if (error.code === 'VERSION_INCOMPATIBLE') return 'unsupported';
  return 'error';
};

const unavailableResponse = (res, error) => {
  if (!(error instanceof AtomicRuntimeError)) return errorResponse(res, error);
  return res.json({ status: 'unavailable', reason: unavailableReason(error), message: error.message });
};

export const registerAtomicRoutes = (app, dependencies) => {
  const { atomicRuntime, resolveProjectDirectory } = dependencies;

  const withDirectory = (handler) => async (req, res) => {
    try {
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) return res.status(400).json({ error });
      return res.json(await handler(req, directory));
    } catch (error) {
      return errorResponse(res, error);
    }
  };

  app.get('/api/atomic/overview', async (req, res) => {
    try {
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) return res.status(400).json({ error });
      return res.json(await atomicRuntime.overview(directory));
    } catch (error) {
      return unavailableResponse(res, error);
    }
  });

  app.get('/api/atomic/diff', withDirectory((req, directory) => {
    const target = singleQuery(req.query.target);
    if (target !== 'working' && target !== 'change') throw new Error('target parameter must be working or change');
    const change = singleQuery(req.query.change);
    if (target === 'change' && (!change || !HASH_PATTERN.test(change))) throw new Error('change parameter is invalid');
    if (target === 'change' && req.query.path !== undefined) throw new Error('path is not supported for a change diff');
    if (target === 'working' && req.query.change !== undefined) throw new Error('change is not supported for a working diff');
    return atomicRuntime.diff(directory, {
      change: target === 'change' ? change : null,
      paths: target === 'working' ? optionalPaths(req.query.path) : [],
      context: clampedInteger(req.query.context, 3, 0, 20, 'context'),
    });
  }));

  app.get('/api/atomic/history', withDirectory((req, directory) => atomicRuntime.history(directory, {
    view: optionalView(req.query.view),
    count: clampedInteger(req.query.limit, 20, 1, 100, 'limit'),
  })));

  app.get('/api/atomic/change', withDirectory((req, directory) => {
    const change = singleQuery(req.query.change);
    if (!change || !HASH_PATTERN.test(change)) throw new Error('change parameter is invalid');
    return atomicRuntime.change(directory, change);
  }));

  app.get('/api/atomic/provenance', async (req, res) => {
    try {
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) return res.status(400).json({ error });
      const change = singleQuery(req.query.change);
      if (!change || !HASH_PATTERN.test(change)) throw new Error('change parameter is invalid');
      return res.json(await atomicRuntime.provenance(directory, change));
    } catch (error) {
      return unavailableResponse(res, error);
    }
  });
};
