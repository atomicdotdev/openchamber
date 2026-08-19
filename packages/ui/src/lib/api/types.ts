import type { WorktreeMetadata } from '../../types/worktree';
import { z } from 'zod';

type DraftStarterRef = {
  type: 'command' | 'skill';
  name: string;
};

type RuntimePlatform = 'web' | 'desktop' | 'vscode';

interface RuntimeDescriptor {
  platform: RuntimePlatform;

  isDesktop: boolean;

  isVSCode: boolean;

  label?: string;
}

interface Subscription {

  close: () => void;
}

export interface TerminalSession {
  sessionId: string;
  cols: number;
  rows: number;
  status: 'running' | 'exited' | 'error';
}

export type TerminalShell = 'auto' | 'bash' | 'zsh' | 'sh' | 'fish' | 'pwsh' | 'powershell' | 'cmd' | 'dash' | 'ksh' | 'nu';

export interface TerminalShellOption {
  id: TerminalShell;
  name: string;
  supportsLogin: boolean;
}

export interface TerminalStreamEvent {
  type: 'snapshot' | 'data' | 'exit' | 'reconnecting';
  sequence?: number;
  data?: string;
  replayData?: string;
  status?: 'running' | 'exited' | 'error';
  exitCode?: number;
  signal?: number | null;
  attempt?: number;
  maxAttempts?: number;

  runtime?: 'node' | 'bun';
  ptyBackend?: string;
}

export interface TerminalError extends Error {
  code?: string;
}

export interface CreateTerminalOptions {
  cwd: string;
  sessionId?: string;
  cols?: number;
  rows?: number;
  themeMode?: 'light' | 'dark';
  terminalBackground?: string;
  terminalForeground?: string;
  shell?: TerminalShell;
  loginShell?: boolean;
}

export interface ResizeTerminalPayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalHandlers {
  onEvent: (event: TerminalStreamEvent) => void;
  onError?: (error: TerminalError, fatal?: boolean) => void;
}

export interface ForceKillOptions {
  sessionId?: string;
  cwd?: string;
}

export interface TerminalAPI {
  listShells?(): Promise<TerminalShellOption[]>;
  createSession(options: CreateTerminalOptions): Promise<TerminalSession>;
  connect(sessionId: string, handlers: TerminalHandlers): Subscription;
  sendInput(sessionId: string, input: string): Promise<void>;
  resize(payload: ResizeTerminalPayload): Promise<void>;
  updateAppearance?(sessionId: string, appearance: Pick<CreateTerminalOptions, 'themeMode' | 'terminalBackground' | 'terminalForeground'>): Promise<void>;
  close(sessionId: string): Promise<void>;
  restartSession?(currentSessionId: string, options: CreateTerminalOptions): Promise<TerminalSession>;
  forceKill?(options: ForceKillOptions): Promise<void>;
}

interface GitStatusFile {
  path: string;
  index: string;
  working_dir: string;
}

export interface GitMergeInProgress {
  /** Short SHA of MERGE_HEAD */
  head: string;
  /** First line of MERGE_MSG */
  message: string;
}

export interface GitRebaseInProgress {
  /** Branch name being rebased */
  headName: string;
  /** Short SHA of the onto commit */
  onto: string;
}

export interface GitRemoteComparison {
  remote: string;
  branch: string;
  ahead: number;
  behind: number;
}

export interface GitStatus {
  current: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  upstreamComparison?: GitRemoteComparison | null;
  files: GitStatusFile[];
  isClean: boolean;
  diffStats?: Record<string, { insertions: number; deletions: number }>;
  /** Present when a merge is in progress with conflicts */
  mergeInProgress?: GitMergeInProgress | null;
  /** Present when a rebase is in progress */
  rebaseInProgress?: GitRebaseInProgress | null;
  /** Phase 1: reason for attention-required state */
  attentionReason?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null;
}

export interface GitDiffResponse {
  diff: string;
}

export interface GetGitDiffOptions {
  path: string;
  staged?: boolean;
  contextLines?: number;
}

/**
 * Diff between two refs. Uses three-dot (`base...head`) semantics server-side, so changes
 * pulled into `head` by merging `base` are excluded — only the branch's own work is returned.
 */
export interface GetGitRangeDiffOptions {
  base: string;
  head: string;
  path?: string;
  contextLines?: number;
}

export interface GitFileDiffResponse {
  original: string;
  modified: string;
  path: string;
  isBinary?: boolean;
}

export interface GetGitFileDiffOptions {
  path: string;
  staged?: boolean;
}

export interface GitBranchDetails {
  current: boolean;
  name: string;
  commit: string;
  label: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
}

export interface GitBranch {
  all: string[];
  current: string;
  branches: Record<string, GitBranchDetails>;
  defaultBranches?: Record<string, string>;
}

interface GitCommitSummary {
  changes: number;
  insertions: number;
  deletions: number;
}

export interface GitCommitResult {
  success: boolean;
  commit: string;
  branch: string;
  summary: GitCommitSummary;
}

export interface GitPushResult {
  success: boolean;
  pushed: Array<{
    local: string;
    remote: string;
  }>;
  repo: string;
  ref: unknown;
}

export interface GitPullResult {
  success: boolean;
  summary: GitCommitSummary;
  files: string[];
  insertions: number;
  deletions: number;
}

export interface GitPullOptions {
  remote?: string;
  branch?: string;
  rebase?: boolean;
}

export interface GitStashEntry {
  ref: string;
  message: string;
  relativeTime: string;
  hash: string;
}

export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitMergeResult {
  success: boolean;
  conflict?: boolean;
  conflictFiles?: string[];
}

export interface CheckoutCommitResponse {
  success: boolean;
}

export interface CherryPickResponse {
  success: boolean;
  conflict?: boolean;
  conflictFiles?: string[];
}

export interface RevertCommitResponse {
  success: boolean;
  conflict?: boolean;
  conflictFiles?: string[];
}

export interface ResetToCommitResponse {
  success: boolean;
}

export interface GitRebaseResult {
  success: boolean;
  conflict?: boolean;
  conflictFiles?: string[];
}

export interface MergeConflictDetails {
  /** Git status --porcelain output showing current state */
  statusPorcelain: string;
  /** List of unmerged file paths */
  unmergedFiles: string[];
  /** Git diff output showing current conflict state */
  diff: string;
  /** Information about MERGE_HEAD or REBASE_HEAD */
  headInfo: string;
  /** The operation type: 'merge' or 'rebase' */
  operation: 'merge' | 'rebase';
}

export type GitIdentityAuthType = 'ssh' | 'token';

export interface GitIdentityProfile {
  id: string;
  name: string;
  userName: string;
  userEmail: string;
  authType?: GitIdentityAuthType;
  sshKey?: string | null;
  signCommits?: boolean;
  signingKey?: string | null;
  host?: string | null;
  color?: string | null;
  icon?: string | null;
}

export interface DiscoveredGitCredential {
  host: string;
  username: string;
}

export interface GitIdentitySummary {
  userName: string | null;
  userEmail: string | null;
  sshCommand: string | null;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  parents: string[];
}

export interface GitLogResponse {
  all: GitLogEntry[];
  latest: GitLogEntry | null;
  total: number;
}

export interface CommitFileEntry {
  path: string;
  insertions: number;
  deletions: number;
  isBinary: boolean;
  changeType: 'A' | 'M' | 'D' | 'R' | 'C' | string;
}

export interface GitCommitFilesResponse {
  files: CommitFileEntry[];
}

export interface CommitFileDiffResponse {
  original: string;
  modified: string;
  isBinary: boolean;
}

export interface GitWorktreeInfo {
  head: string;
  name: string;
  branch: string;
  path: string;
}

export interface GitWorktreeValidationError {
  code: string;
  message: string;
}

export interface GitWorktreeValidationResult {
  ok: boolean;
  errors: GitWorktreeValidationError[];
  resolved?: {
    mode?: 'new' | 'existing';
    localBranch?: string | null;
  };
}

export interface GitWorktreeBootstrapStatus {
  status: 'pending' | 'ready' | 'failed';
  phase?: 'directory-created' | 'git-ready' | 'setup-ready';
  error: string | null;
  updatedAt: number;
}

export interface CreateGitWorktreePayload {
  mode?: 'new' | 'existing';
  /** Worktree folder name (falls back to OpenCode name generation when omitted). */
  worktreeName?: string;
  /** Backward-compatible alias for worktreeName. */
  name?: string;
  /** New local branch name for mode=new. */
  branchName?: string;
  /** Existing local/remote branch for mode=existing. */
  existingBranch?: string;
  /** Start ref for mode=new (local/remote branch or commit SHA). */
  startRef?: string;
  /** Additional startup script to run after project startup script. */
  startCommand?: string;
  /** Configure upstream tracking for the created/attached local branch. */
  setUpstream?: boolean;
  upstreamRemote?: string;
  upstreamBranch?: string;
  /** Optional remote provisioning (used for fork PR workflows). */
  ensureRemoteName?: string;
  ensureRemoteUrl?: string;
  /** Return once the target directory exists and finish Git worktree setup in the background. */
  returnAfterDirectoryCreated?: boolean;
}

export interface GitWorktreeCreateResult {
  head: string;
  name: string;
  branch: string;
  path: string;
  directoryCreated?: true;
  bootstrapStatus?: GitWorktreeBootstrapStatus;
}

export interface RemoveGitWorktreePayload {
  directory: string;
  deleteLocalBranch?: boolean;
}

export interface GitDeleteBranchPayload {
  branch: string;
  force?: boolean;
}

export interface GitDeleteRemoteBranchPayload {
  branch: string;
  remote?: string;
}

export interface GitRemoveRemotePayload {
  remote: string;
}

export interface CreateGitCommitOptions {
  addAll?: boolean;
  files?: string[];
  stageFiles?: string[];
}

export interface GitLogOptions {
  maxCount?: number;
  from?: string;
  to?: string;
  file?: string;
  all?: boolean;
}

export interface GeneratedCommitMessage {
  subject: string;
  highlights: string[];
}

export interface GeneratedPullRequestDescription {
  title: string;
  body: string;
}

interface GitWorktreeAPI {
  list(directory: string): Promise<GitWorktreeInfo[]>;
  validate?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeValidationResult>;
  bootstrapStatus?(directory: string): Promise<GitWorktreeBootstrapStatus>;
  preview?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult>;
  create?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult>;
  remove?(directory: string, payload: RemoveGitWorktreePayload): Promise<{ success: boolean }>;
}

export interface GitAPI {
  checkIsGitRepository(directory: string): Promise<boolean>;
  getGitStatus(directory: string, options?: { mode?: 'light' }): Promise<GitStatus>;
  getGitDiff(directory: string, options: GetGitDiffOptions): Promise<GitDiffResponse>;
  getGitFileDiff(directory: string, options: GetGitFileDiffOptions): Promise<GitFileDiffResponse>;
  getGitRangeDiff?(directory: string, options: GetGitRangeDiffOptions): Promise<GitDiffResponse>;
  revertGitFile(directory: string, filePath: string, options?: { scope?: 'all' | 'working' }): Promise<void>;
  stageGitFile(directory: string, filePath: string): Promise<void>;
  stageGitFiles?(directory: string, filePaths: string[]): Promise<void>;
  unstageGitFile(directory: string, filePath: string): Promise<void>;
  unstageGitFiles?(directory: string, filePaths: string[]): Promise<void>;
  stageGitHunk?(directory: string, filePath: string, patch: string): Promise<void>;
  unstageGitHunk?(directory: string, filePath: string, patch: string): Promise<void>;
  revertGitHunk?(directory: string, filePath: string, patch: string): Promise<void>;
  isLinkedWorktree(directory: string): Promise<boolean>;
  getGitBranches(directory: string): Promise<GitBranch>;
  deleteGitBranch(directory: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }>;
  deleteRemoteBranch(directory: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }>;
  removeRemote(directory: string, payload: GitRemoveRemotePayload): Promise<{ success: boolean }>;
  generateCommitMessage(directory: string, files: string[], options?: { zenModel?: string; providerId?: string; modelId?: string }): Promise<{ message: GeneratedCommitMessage }>;
  generatePullRequestDescription(
    directory: string,
    payload: { base: string; head: string; context?: string; zenModel?: string; providerId?: string; modelId?: string }
  ): Promise<GeneratedPullRequestDescription>;
  listGitWorktrees(directory: string): Promise<GitWorktreeInfo[]>;
  validateGitWorktree?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeValidationResult>;
  getGitWorktreeBootstrapStatus?(directory: string): Promise<GitWorktreeBootstrapStatus>;
  previewGitWorktree?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult>;
  createGitWorktree?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult>;
  deleteGitWorktree?(directory: string, payload: RemoveGitWorktreePayload): Promise<{ success: boolean }>;
  createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions): Promise<GitCommitResult>;
  gitPush(directory: string, options?: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> }): Promise<GitPushResult>;
  gitPull(directory: string, options?: GitPullOptions): Promise<GitPullResult>;
  gitFetch(directory: string, options?: { remote?: string; branch?: string }): Promise<{ success: boolean }>;
  listGitStashes(directory: string): Promise<{ stashes: GitStashEntry[] }>;
  countGitStashFiles(directory: string, refs: string[]): Promise<{ counts: Record<string, number> }>;
  stashGitChanges(directory: string, options?: { message?: string }): Promise<{ success: boolean; created: boolean; message: string; output: string }>;
  applyGitStash(directory: string, options: { ref: string }): Promise<{ success: boolean; ref: string }>;
  popGitStash(directory: string, options: { ref: string }): Promise<{ success: boolean; ref: string }>;
  dropGitStash(directory: string, options: { ref: string }): Promise<{ success: boolean; ref: string }>;
  checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }>;
  createBranch(directory: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }>;
  renameBranch(directory: string, oldName: string, newName: string): Promise<{ success: boolean; branch: string }>;
  getGitLog(directory: string, options?: GitLogOptions): Promise<GitLogResponse>;
  getCommitFiles(directory: string, hash: string): Promise<GitCommitFilesResponse>;
  getCommitFileDiff?(directory: string, hash: string, filePath: string, isBinary: boolean): Promise<CommitFileDiffResponse>;
  getCurrentGitIdentity(directory: string): Promise<GitIdentitySummary | null>;
  hasLocalIdentity?(directory: string): Promise<boolean>;
  setGitIdentity(directory: string, profileId: string): Promise<{ success: boolean; profile: GitIdentityProfile }>;
  getGitIdentities(): Promise<GitIdentityProfile[]>;
  createGitIdentity(profile: GitIdentityProfile): Promise<GitIdentityProfile>;
  updateGitIdentity(id: string, updates: GitIdentityProfile): Promise<GitIdentityProfile>;
  deleteGitIdentity(id: string): Promise<void>;
  discoverGitCredentials?(): Promise<DiscoveredGitCredential[]>;
  getGlobalGitIdentity?(): Promise<GitIdentitySummary | null>;
  getRemoteUrl?(directory: string, remote?: string): Promise<string | null>;
  getRemotes(directory: string): Promise<GitRemote[]>;
  rebase(directory: string, options: { onto: string }): Promise<GitRebaseResult>;
  abortRebase(directory: string): Promise<{ success: boolean }>;
  continueRebase(directory: string): Promise<{ success: boolean; conflict: boolean; conflictFiles?: string[] }>;
  merge(directory: string, options: { branch: string }): Promise<GitMergeResult>;
  abortMerge(directory: string): Promise<{ success: boolean }>;
  continueMerge(directory: string): Promise<{ success: boolean; conflict: boolean; conflictFiles?: string[] }>;
  checkoutCommit(directory: string, hash: string): Promise<CheckoutCommitResponse>;
  cherryPick(directory: string, hash: string): Promise<CherryPickResponse>;
  revertCommit(directory: string, hash: string): Promise<RevertCommitResponse>;
  resetToCommit(directory: string, hash: string, mode: 'soft' | 'mixed' | 'hard', force?: boolean): Promise<ResetToCommitResponse>;
  stash(directory: string, options?: { message?: string; includeUntracked?: boolean }): Promise<{ success: boolean }>;
  stashPop(directory: string): Promise<{ success: boolean }>;
  getConflictDetails(directory: string): Promise<MergeConflictDetails>;
  /** Phase 1: validate that a cwd is inside a worktreeRoot */
  validateWorktreeDirectory?(directory: string, worktreeRoot: string): Promise<{
    valid: boolean;
    insideWorktreeRoot: boolean;
    resolvedWorktreeRoot: string | null;
    resolvedCwd: string | null;
  }>;
  /** Phase 1: canonicalize a directory to full worktree state */
  canonicalizeWorktreeState?(directory: string): Promise<{
    worktreeRoot: string | null;
    cwd: string | null;
    branch: string | null;
    headState: 'branch' | 'detached' | 'unborn';
    worktreeStatus: 'pending' | 'ready' | 'missing' | 'invalid' | 'not-a-repo';
    legacy: boolean;
    degraded: boolean;
    attentionReason?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null;
  }>;
  worktree?: GitWorktreeAPI;
}

export interface FileListEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: number;
}

export interface DirectoryListResult {
  directory: string;
  entries: FileListEntry[];
}

export interface FileSearchQuery {
  directory: string;
  query: string;
  maxResults?: number;
  includeHidden?: boolean;
  respectGitignore?: boolean;
}

export interface FileSearchResult {
  path: string;
  score?: number;
  preview?: string[];
}

export interface CommandExecResult {
  command: string;
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

interface ListDirectoryOptions {
  respectGitignore?: boolean;
}

interface FileReadOptions {
  allowOutsideWorkspace?: boolean;
  outsideFileGrant?: string;
  optional?: boolean;
  directory?: string;
}

export interface FilesAPI {
  listDirectory(path: string, options?: ListDirectoryOptions): Promise<DirectoryListResult>;
  search(payload: FileSearchQuery): Promise<FileSearchResult[]>;
  createDirectory(path: string): Promise<{ success: boolean; path: string }>;
  statFile?(path: string, options?: FileReadOptions): Promise<{ path: string; isFile: boolean; size: number; mtimeMs?: number }>;
  readFile?(path: string, options?: FileReadOptions): Promise<{ content: string; path: string }>;
  readFileBinary?(path: string, options?: FileReadOptions): Promise<{ dataUrl: string; path: string }>;
  writeFile?(path: string, content: string): Promise<{ success: boolean; path: string }>;
  uploadFile?(path: string, file: Blob, options?: { overwrite?: boolean; directory?: string }): Promise<{ success: boolean; path: string }>;
  delete?(path: string): Promise<{ success: boolean }>;
  rename?(oldPath: string, newPath: string): Promise<{ success: boolean; path: string }>;
  revealPath?(path: string): Promise<{ success: boolean }>;
  execCommands?(commands: string[], cwd: string): Promise<{ success: boolean; results: CommandExecResult[] }>;
  downloadFile?(path: string): Promise<void>;
}

export interface ProjectEntry {
  id: string;
  path: string;
  label?: string;
  icon?: string | null;
  iconImage?: {
    mime: string;
    updatedAt: number;
    source: 'custom' | 'auto';
  } | null;
  iconBackground?: string | null;
  color?: string | null;
  defaultModel?: string;
  addedAt?: number;
  lastOpenedAt?: number;
  sidebarCollapsed?: boolean;
}

export interface SettingsPayload {
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: 'light' | 'dark';
  lightThemeId?: string;
  darkThemeId?: string;
  lastDirectory?: string;
  homeDirectory?: string;
  opencodeBinary?: string;
  projects?: ProjectEntry[];
  activeProjectId?: string;
  securityScopedBookmarks?: string[];
  pinnedDirectories?: string[];
  showReasoningTraces?: boolean;
  collapsibleThinkingBlocks?: boolean;
  showDeletionDialog?: boolean;
  nativeNotificationsEnabled?: boolean;
  notificationMode?: 'always' | 'hidden-only';
  autoDeleteEnabled?: boolean;
  autoSaveEnabled?: boolean;
  autoDeleteAfterDays?: number;
  sessionRetentionAction?: 'archive' | 'delete';
  followUpBehavior?: 'steer' | 'queue';
  queueModeEnabled?: boolean;
  gitmojiEnabled?: boolean;
  inputSpellcheckEnabled?: boolean;
  showOpenCodeUpdateNotifications?: boolean;
  openCodeUpdateToastDismissedVersion?: string;
  showToolFileIcons?: boolean;
  codeBlockLineWrap?: boolean;
  showTurnChangedFiles?: boolean;
  showExpandedBashTools?: boolean;
  showExpandedEditTools?: boolean;
  chatRenderMode?: 'sorted' | 'live';
  messageStreamTransport?: 'auto' | 'ws' | 'sse';
  activityRenderMode?: 'collapsed' | 'summary';
  mermaidRenderingMode?: 'svg' | 'ascii';
  showSplitAssistantMessageActions?: boolean;
  fontSize?: number;
  terminalFontSize?: number;
  terminalShell?: TerminalShell;
  terminalLoginShells?: TerminalShell[];
  editorFontSize?: number;
  uiFont?: string;
  monoFont?: string;
  padding?: number;
  cornerRadius?: number;
  inputBarOffset?: number;
  shortcutOverrides?: Record<string, string>;
  diffLayoutPreference?: 'dynamic' | 'inline' | 'side-by-side';
  gitChangesViewMode?: 'flat' | 'tree';
  directoryShowHidden?: boolean;
  filesViewShowGitignored?: boolean;
  openInAppId?: string;
  gitProviderId?: string;
  gitModelId?: string;
  pwaAppName?: string;
  mobileKeyboardMode?: 'native' | 'resize-content';
  draftStarters?: DraftStarterRef[];
  draftStartersVisible?: boolean;
  draftStartersCraftGoalAdded?: boolean;

  [key: string]: unknown;
}

export interface SettingsLoadResult {
  settings: SettingsPayload;
  source: 'desktop' | 'web';
}

export interface SettingsAPI {
  load(): Promise<SettingsLoadResult>;
  save(changes: Partial<SettingsPayload>): Promise<SettingsPayload>;

  restartOpenCode?: () => Promise<{ restarted: boolean }>;
}

export interface DirectoryPermissionRequest {
  path: string;
}

interface DirectoryPermissionResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface StartAccessingResult {
  success: boolean;
  error?: string;
}

export interface PermissionsAPI {
  requestDirectoryAccess(request: DirectoryPermissionRequest): Promise<DirectoryPermissionResult>;
  startAccessingDirectory(path: string): Promise<StartAccessingResult>;
  stopAccessingDirectory(path: string): Promise<StartAccessingResult>;
}

export interface NotificationPayload {
  title?: string;
  body?: string;

  tag?: string;
  kind?: string;
  sessionId?: string;
  directory?: string;
  requireHidden?: boolean;
}

export interface NotificationsAPI {
  notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean>;
  canNotify?: () => boolean | Promise<boolean>;
}

interface DiagnosticsAPI {
  downloadLogs(): Promise<{ fileName: string; content: string }>;
}

export interface ToolsAPI {

  getAvailableTools(): Promise<string[]>;
}

export interface EditorAPI {
  openFile(path: string, line?: number, column?: number): Promise<void>;
  openDiff(
    original: string,
    modified: string,
    label?: string,
    options?: { line?: number; patch?: string },
  ): Promise<void>;
}

export interface VSCodeAPI {
  executeCommand(command: string, ...args: unknown[]): Promise<unknown>;
  openAgentManager(): Promise<void>;
  openExternalUrl(url: string): Promise<void>;
  pickFiles?(options?: { extensions?: string[] }): Promise<unknown>;
  saveImage?(payload: unknown): Promise<unknown>;
  saveMarkdown?(payload: unknown): Promise<unknown>;
}

export interface PushSubscribePayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  origin?: string;
  /** Runtime surface ('ios' | 'android' | 'vscode' | 'desktop' | 'web') for presence-aware routing. */
  platform?: string;
}

export interface PushUnsubscribePayload {
  endpoint: string;
}

export interface ApnsTokenPayload {
  token: string;
  /** 'ios' (APNs) or 'android' (FCM) — lets the relay route the token to the right service. */
  platform?: string;
  /**
   * APNs environment the token belongs to: 'sandbox' for Xcode/dev-signed installs,
   * 'production' for TestFlight/App Store. Omitted when unknown (server defaults to production).
   */
  environment?: 'sandbox' | 'production';
}

export interface PushAPI {
  getVapidPublicKey(): Promise<{ publicKey: string } | null>;
  subscribe(payload: PushSubscribePayload): Promise<{ ok: true } | null>;
  unsubscribe(payload: PushUnsubscribePayload): Promise<{ ok: true } | null>;
  setVisibility(payload: { visible: boolean; platform?: string }): Promise<{ ok: true } | null>;
  /** Register a native iOS APNs device token (Capacitor mobile app only). */
  registerApnsToken(payload: ApnsTokenPayload): Promise<{ ok: true } | null>;
  unregisterApnsToken(payload: ApnsTokenPayload): Promise<{ ok: true } | null>;
}

export type AtomicUnavailableReason = 'not-installed' | 'not-repository' | 'unsupported' | 'error';

export interface AtomicView {
  name: string;
  current: boolean;
  scope: 'shared' | 'draft' | 'unknown';
  changeCount: number | null;
  state: string | null;
}

export interface AtomicStatusEntry {
  path: string;
  kind: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  previousPath?: string;
}

export interface AtomicWorkingCopyStatus {
  clean: boolean;
  entries: AtomicStatusEntry[];
}

export type AtomicOverview =
  | {
      status: 'ready';
      currentView: AtomicView;
      views: AtomicView[];
      workingCopy: AtomicWorkingCopyStatus;
    }
  | {
      status: 'unavailable';
      reason: AtomicUnavailableReason;
      message: string;
    };

export type AtomicDiffRequest =
  | { target: 'working'; paths?: string[] }
  | { target: 'change'; change: string };

export interface AtomicDiffResult {
  diff: string;
}

export interface AtomicHistoryEntry {
  hash: string;
  sequence: number | null;
  state: string | null;
  message: string;
  timestamp: string | null;
  author: string | null;
  tagged: boolean | null;
}

export type AtomicHistoryMetadata =
  | { completeness: 'complete' }
  | { completeness: 'partial'; missing: Array<'author' | 'timestamp' | 'tagged'> };

export interface AtomicHistoryResult {
  changes: AtomicHistoryEntry[];
  metadata: AtomicHistoryMetadata;
}

export interface AtomicChangeHunk {
  kind: string;
  path: string;
}

/** One key/value pair from a change attestation's metadata list. */
export interface AtomicAttestationMetadata {
  key: string;
  value: string;
}

/**
 * AI authorship attestation carried inline in a change's JSON. Every field is
 * optional because a change may be human-authored (no attestation) or a given
 * Atomic version may omit fields; consumers must treat any field as absent.
 */
export interface AtomicAttestation {
  vendor: string | null;
  model: string | null;
  tool: string | null;
  suggestionType: string | null;
  tokens: { input: number | null; output: number | null; total: number | null } | null;
  cost: { amountMicros: number; currency: string } | null;
  sessionId: string | null;
  finishReason: string | null;
  stepCount: number | null;
  metadata: AtomicAttestationMetadata[];
}

export interface AtomicChangeDetail extends AtomicHistoryEntry {
  hunks: AtomicChangeHunk[];
  hasProvenance: boolean | null;
  attestation: AtomicAttestation | null;
  ledger: AtomicChangeLedgerEntry[];
}

/** One node of a change's decision ledger (the reasoning graph of a turn). */
export interface AtomicLedgerNode {
  id: string;
  kind: string;
  timestamp: number | null;
  summary: string;
  classified: boolean;
}

/** One directed edge between decision-ledger nodes. */
export interface AtomicLedgerEdge {
  from: string;
  to: string;
  kind: string;
}

/**
 * One decision-graph entry that explains a change: the ordered `goal /
 * exploration / execution / commitment / …` reasoning of an attested turn,
 * projected from `atomic change`'s `ledger`. A change may carry several (one per
 * contributing turn) or none.
 */
export interface AtomicChangeLedgerEntry {
  graphHash: string;
  sessionId: string | null;
  agentDisplayName: string | null;
  agentVendor: string | null;
  timestamp: number | null;
  nodeCount: number | null;
  edgeCount: number | null;
  changeCount: number | null;
  changesExplained: string[];
  previous: string | null;
  nodes: AtomicLedgerNode[];
  edges: AtomicLedgerEdge[];
}

export type AtomicJsonValue =
  | null
  | boolean
  | number
  | string
  | AtomicJsonValue[]
  | { [key: string]: AtomicJsonValue };

export type AtomicProvenanceResult =
  | { status: 'available'; document: AtomicJsonValue }
  | { status: 'unavailable'; reason: AtomicUnavailableReason; message: string };

/** One acceptance criterion of an intent, projected from the canonical node. */
export interface AtomicIntentAcceptanceCriterion {
  id: string;
  text: string;
  status: string;
  verifiedBy: string | null;
  evidence: string | null;
}

/** One task of an intent, projected from the canonical node. */
export interface AtomicIntentTask {
  id: string;
  text: string;
  status: string;
  /** Acceptance-criterion ids this task satisfies. */
  satisfies: string[];
  /** Repository-relative paths the task names. */
  touchesFile: string[];
}

/**
 * One vault intent: the read-time projection of a canonical intent node plus
 * its list-level attestation status. The `urn` is the canonical `@id`
 * (`urn:atomic:intent:<uid>`) memories reference through `derivedFrom`.
 */
export interface AtomicIntent {
  id: string;
  urn: string;
  title: string | null;
  status: string;
  kind: string | null;
  why: string | null;
  acceptanceCriteria: AtomicIntentAcceptanceCriterion[];
  tasks: AtomicIntentTask[];
  scopeIn: string[];
  scopeOut: string[];
  constraints: string[];
  attested: string | null;
}

/**
 * One vault memory: the read-time projection of a canonical memory node. Its
 * `derivedFrom` holds the source urns (intents, acceptance criteria, …) that
 * produced it — the semantic linkage the vault view groups intents by.
 */
export interface AtomicMemory {
  id: string;
  urn: string;
  kind: string | null;
  status: string;
  text: string;
  derivedFrom: string[];
  attested: string | null;
}

export type AtomicVaultResult =
  | { status: 'available'; intents: AtomicIntent[]; memories: AtomicMemory[] }
  | { status: 'unavailable'; reason: AtomicUnavailableReason; message: string };

export interface AtomicHistoryOptions {
  limit?: number;
  view?: string;
}

/** Read-only access to the active directory's Atomic repository. */
export interface AtomicAPI {
  overview(directory: string): Promise<AtomicOverview>;
  diff(directory: string, request: AtomicDiffRequest): Promise<AtomicDiffResult>;
  history(directory: string, options?: AtomicHistoryOptions): Promise<AtomicHistoryResult>;
  change(directory: string, change: string): Promise<AtomicChangeDetail>;
  provenance(directory: string, change: string): Promise<AtomicProvenanceResult>;
  vault(directory: string): Promise<AtomicVaultResult>;
}

const atomicUnavailableReasonSchema = z.enum(['not-installed', 'not-repository', 'unsupported', 'error']);
const atomicChangeIdSchema = z.string().trim().regex(/^[A-Z2-7]{4,52}$/i);
const atomicViewNameSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const atomicPathSchema = z.string().trim().min(1).max(1024).refine((path) => (
  !path.includes('\0')
  && !path.startsWith('/')
  && !path.startsWith('\\')
  && !/^[A-Za-z]:[\\/]/.test(path)
  && !path.split(/[\\/]+/).includes('..')
));

export const AtomicViewSchema: z.ZodType<AtomicView> = z.strictObject({
  name: z.string(),
  current: z.boolean(),
  scope: z.enum(['shared', 'draft', 'unknown']),
  changeCount: z.number().int().nullable(),
  state: z.string().nullable(),
});

export const AtomicStatusEntrySchema: z.ZodType<AtomicStatusEntry> = z.strictObject({
  path: z.string(),
  kind: z.enum(['added', 'modified', 'deleted', 'renamed', 'untracked', 'conflicted']),
  previousPath: z.string().optional(),
});

export const AtomicOverviewSchema: z.ZodType<AtomicOverview> = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ready'),
    currentView: AtomicViewSchema,
    views: z.array(AtomicViewSchema),
    workingCopy: z.strictObject({ clean: z.boolean(), entries: z.array(AtomicStatusEntrySchema) }),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    reason: atomicUnavailableReasonSchema,
    message: z.string(),
  }),
]);

export const AtomicDiffRequestSchema: z.ZodType<AtomicDiffRequest> = z.discriminatedUnion('target', [
  z.strictObject({ target: z.literal('working'), paths: z.array(atomicPathSchema).max(100).optional() }),
  z.strictObject({ target: z.literal('change'), change: atomicChangeIdSchema }),
]);

export const AtomicDiffResultSchema: z.ZodType<AtomicDiffResult> = z.strictObject({ diff: z.string() });

export const AtomicHistoryEntrySchema: z.ZodType<AtomicHistoryEntry> = z.strictObject({
  hash: z.string(),
  sequence: z.number().int().nullable(),
  state: z.string().nullable(),
  message: z.string(),
  timestamp: z.string().nullable(),
  author: z.string().nullable(),
  tagged: z.boolean().nullable(),
});

export const AtomicHistoryResultSchema: z.ZodType<AtomicHistoryResult> = z.strictObject({
  changes: z.array(AtomicHistoryEntrySchema),
  metadata: z.discriminatedUnion('completeness', [
    z.strictObject({ completeness: z.literal('complete') }),
    z.strictObject({
      completeness: z.literal('partial'),
      missing: z.array(z.enum(['author', 'timestamp', 'tagged'])),
    }),
  ]),
});

export const AtomicAttestationSchema: z.ZodType<AtomicAttestation> = z.strictObject({
  vendor: z.string().nullable(),
  model: z.string().nullable(),
  tool: z.string().nullable(),
  suggestionType: z.string().nullable(),
  tokens: z.strictObject({
    input: z.number().nullable(),
    output: z.number().nullable(),
    total: z.number().nullable(),
  }).nullable(),
  cost: z.strictObject({ amountMicros: z.number(), currency: z.string() }).nullable(),
  sessionId: z.string().nullable(),
  finishReason: z.string().nullable(),
  stepCount: z.number().int().nullable(),
  metadata: z.array(z.strictObject({ key: z.string(), value: z.string() })),
});

export const AtomicChangeLedgerEntrySchema: z.ZodType<AtomicChangeLedgerEntry> = z.strictObject({
  graphHash: z.string(),
  sessionId: z.string().nullable(),
  agentDisplayName: z.string().nullable(),
  agentVendor: z.string().nullable(),
  timestamp: z.number().nullable(),
  nodeCount: z.number().int().nullable(),
  edgeCount: z.number().int().nullable(),
  changeCount: z.number().int().nullable(),
  changesExplained: z.array(z.string()),
  previous: z.string().nullable(),
  nodes: z.array(z.strictObject({
    id: z.string(),
    kind: z.string(),
    timestamp: z.number().nullable(),
    summary: z.string(),
    classified: z.boolean(),
  })),
  edges: z.array(z.strictObject({ from: z.string(), to: z.string(), kind: z.string() })),
});

export const AtomicChangeDetailSchema: z.ZodType<AtomicChangeDetail> = z.strictObject({
  hash: z.string(),
  sequence: z.number().int().nullable(),
  state: z.string().nullable(),
  message: z.string(),
  timestamp: z.string().nullable(),
  author: z.string().nullable(),
  tagged: z.boolean().nullable(),
  hunks: z.array(z.strictObject({ kind: z.string(), path: z.string() })),
  hasProvenance: z.boolean().nullable(),
  attestation: AtomicAttestationSchema.nullable(),
  ledger: z.array(AtomicChangeLedgerEntrySchema),
});

export const AtomicProvenanceResultSchema: z.ZodType<AtomicProvenanceResult> = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('available'), document: z.json() }),
  z.strictObject({ status: z.literal('unavailable'), reason: atomicUnavailableReasonSchema, message: z.string() }),
]);

export const AtomicIntentAcceptanceCriterionSchema: z.ZodType<AtomicIntentAcceptanceCriterion> = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.string(),
  verifiedBy: z.string().nullable(),
  evidence: z.string().nullable(),
});

export const AtomicIntentTaskSchema: z.ZodType<AtomicIntentTask> = z.strictObject({
  id: z.string(),
  text: z.string(),
  status: z.string(),
  satisfies: z.array(z.string()),
  touchesFile: z.array(z.string()),
});

export const AtomicIntentSchema: z.ZodType<AtomicIntent> = z.strictObject({
  id: z.string(),
  urn: z.string(),
  title: z.string().nullable(),
  status: z.string(),
  kind: z.string().nullable(),
  why: z.string().nullable(),
  acceptanceCriteria: z.array(AtomicIntentAcceptanceCriterionSchema),
  tasks: z.array(AtomicIntentTaskSchema),
  scopeIn: z.array(z.string()),
  scopeOut: z.array(z.string()),
  constraints: z.array(z.string()),
  attested: z.string().nullable(),
});

export const AtomicMemorySchema: z.ZodType<AtomicMemory> = z.strictObject({
  id: z.string(),
  urn: z.string(),
  kind: z.string().nullable(),
  status: z.string(),
  text: z.string(),
  derivedFrom: z.array(z.string()),
  attested: z.string().nullable(),
});

export const AtomicVaultResultSchema: z.ZodType<AtomicVaultResult> = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('available'),
    intents: z.array(AtomicIntentSchema),
    memories: z.array(AtomicMemorySchema),
  }),
  z.strictObject({ status: z.literal('unavailable'), reason: atomicUnavailableReasonSchema, message: z.string() }),
]);

export const AtomicHistoryOptionsSchema: z.ZodType<AtomicHistoryOptions> = z.strictObject({
  limit: z.number().int().optional(),
  view: atomicViewNameSchema.optional(),
});

export const AtomicDirectoryRequestSchema = z.strictObject({ directory: z.string().trim().min(1) });
export const AtomicDiffBridgeRequestSchema = AtomicDirectoryRequestSchema.extend({ request: AtomicDiffRequestSchema });
export const AtomicHistoryBridgeRequestSchema = AtomicDirectoryRequestSchema.extend({ options: AtomicHistoryOptionsSchema.optional() });
export const AtomicChangeBridgeRequestSchema = AtomicDirectoryRequestSchema.extend({ change: atomicChangeIdSchema });

export type GitHubUserSummary = {
  login: string;
  id?: number;
  avatarUrl?: string;
  name?: string;
  email?: string;
};

type GitHubRepoRef = {
  owner: string;
  repo: string;
  url: string;
};

export type GitHubChecksSummary = {
  state: 'success' | 'failure' | 'pending' | 'unknown';
  total: number;
  success: number;
  failure: number;
  /** queued + in_progress + unconcluded runs. */
  pending: number;
  inProgress?: number;
  queued?: number;
  /** Earliest started_at among in-progress runs (ISO), for elapsed display. */
  startedAt?: string;
};

export type GitHubCheckRun = {
  id?: number;
  name: string;
  startedAt?: string;
  completedAt?: string;
  app?: {
    name?: string;
    slug?: string;
  };
  status?: string;
  conclusion?: string | null;
  detailsUrl?: string;
  output?: {
    title?: string;
    summary?: string;
    text?: string;
  };
  job?: {
    runId?: number;
    jobId?: number;
    url?: string;
    name?: string;
    workflowName?: string;
    conclusion?: string | null;
    steps?: Array<{
      name: string;
      status?: string;
      conclusion?: string | null;
      number?: number;
      startedAt?: string;
      completedAt?: string;
    }>;
  };
  annotations?: Array<{
    path?: string;
    startLine?: number;
    endLine?: number;
    level?: string;
    message: string;
    title?: string;
    rawDetails?: string;
  }>;
};

export type GitHubPullRequest = {
  number: number;
  title: string;
  body?: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  base: string;
  head: string;
  headSha?: string;
  mergeable?: boolean | null;
  mergeableState?: string | null;
};

type GitHubPullRequestHeadRepo = {
  owner: string;
  repo: string;
  url: string;
  cloneUrl?: string;
  sshUrl?: string;
};

export type GitHubPullRequestSummary = GitHubPullRequest & {
  author?: GitHubUserSummary | null;
  body?: string;
  createdAt?: string;
  updatedAt?: string;
  headLabel?: string;
  headRepo?: GitHubPullRequestHeadRepo | null;
  sourceRepo?: (GitHubRepoSelector & { source: string }) | null;
};

type GitHubPullRequestFile = {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
  patch?: string;
};

type GitHubPullRequestReviewComment = {
  id: number;
  url: string;
  body: string;
  author?: GitHubUserSummary | null;
  path?: string;
  line?: number | null;
  position?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type GitHubPullRequestsListResult = {
  connected: boolean;
  repo?: GitHubRepoRef | null;
  prs?: GitHubPullRequestSummary[];
  page?: number;
  hasMore?: boolean;
};

export type GitHubPullRequestContextResult = {
  connected: boolean;
  /** Server-side stamp of when the data was fetched from GitHub (ms epoch); survives server cache serves. */
  fetchedAt?: number;
  repo?: GitHubRepoRef | null;
  pr?: GitHubPullRequestSummary | null;
  issueComments?: GitHubIssueComment[];
  reviewComments?: GitHubPullRequestReviewComment[];
  files?: GitHubPullRequestFile[];
  diff?: string;
  checks?: GitHubChecksSummary | null;
  checkRuns?: GitHubCheckRun[];
};

export type GitHubPullRequestStatus = {
  connected: boolean;
  /** Server-side stamp of when the data was fetched from GitHub (ms epoch); survives server cache serves. */
  fetchedAt?: number;
  repo?: GitHubRepoRef | null;
  branch?: string;
  pr?: GitHubPullRequest | null;
  checks?: GitHubChecksSummary | null;
  canMerge?: boolean;
  defaultBranch?: string | null;
  resolvedRemoteName?: string | null;
};

export type GitHubPullRequestCreateInput = {
  directory: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
  /** Remote to create the PR against (target repo, e.g., 'upstream' for forks) */
  remote?: string;
  /** Remote where the head branch lives (source repo, e.g., 'origin' for forks) */
  headRemote?: string;
  /** Explicit target repo (alternative to remote, for auto-detected upstream) */
  targetRepo?: { owner: string; repo: string };
};

export type GitHubPullRequestUpdateInput = {
  directory: string;
  number: number;
  title: string;
  body?: string;
};

export type GitHubPullRequestMergeInput = {
  directory: string;
  number: number;
  method: 'merge' | 'squash' | 'rebase';
};

export type GitHubPullRequestReadyInput = {
  directory: string;
  number: number;
};

export type GitHubPullRequestReadyResult = {
  ready: boolean;
};

export type GitHubPullRequestMergeResult = {
  merged: boolean;
  message?: string;
};

type GitHubIssueLabel = {
  name: string;
  color?: string;
};

export type GitHubRepoSelector = {
  owner: string;
  repo: string;
};

export type GitHubIssueSummary = {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  author?: GitHubUserSummary | null;
  labels?: GitHubIssueLabel[];
  sourceRepo?: (GitHubRepoSelector & { source: string }) | null;
};

export type GitHubIssue = GitHubIssueSummary & {
  body?: string;
  assignees?: GitHubUserSummary[];
  createdAt?: string;
  updatedAt?: string;
};

export type GitHubIssueComment = {
  id: number;
  url: string;
  body: string;
  author?: GitHubUserSummary | null;
  createdAt?: string;
  updatedAt?: string;
};

export type GitHubIssuesListResult = {
  connected: boolean;
  repo?: GitHubRepoRef | null;
  issues?: GitHubIssueSummary[];
  page?: number;
  hasMore?: boolean;
};

export type GitHubRepoUpstreamResult = {
  connected: boolean;
  isFork: boolean;
  upstream: { owner: string; repo: string; url: string; defaultBranch: string; defaultBranchSha: string | null; remoteName: string | null } | null;
};

export type GitHubIssueGetResult = {
  connected: boolean;
  repo?: GitHubRepoRef | null;
  issue?: GitHubIssue | null;
};

export type GitHubIssueCommentsResult = {
  connected: boolean;
  repo?: GitHubRepoRef | null;
  comments?: GitHubIssueComment[];
};

export type GitHubAuthStatus = {
  connected: boolean;
  user?: GitHubUserSummary | null;
  scope?: string;
  accounts?: GitHubAuthAccount[];
  ghCli?: {
    available: boolean;
    disabled: boolean;
    active: boolean;
    user?: GitHubUserSummary | null;
  } | null;
};

type GitHubAuthAccount = {
  id: string;
  user: GitHubUserSummary;
  scope?: string;
  current?: boolean;
  source?: 'oauth' | 'gh-cli';
};

export type GitHubDeviceFlowStart = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
  scope?: string;
};

export type GitHubDeviceFlowComplete =
  | { connected: true; user: GitHubUserSummary; scope?: string }
  | { connected: false; status?: string; error?: string };

export interface GitHubAPI {
  authStatus(): Promise<GitHubAuthStatus>;
  authStart(): Promise<GitHubDeviceFlowStart>;
  authComplete(deviceCode: string): Promise<GitHubDeviceFlowComplete>;
  authDisconnect(): Promise<{ removed: boolean }>;
  authActivate(accountId: string): Promise<GitHubAuthStatus>;
  authSetGhCliDisabled(disabled: boolean): Promise<{ disabled: boolean }>;
  me?(): Promise<GitHubUserSummary>;

  prStatus(directory: string, branch: string, remote?: string, options?: { force?: boolean }): Promise<GitHubPullRequestStatus>;
  prCreate(payload: GitHubPullRequestCreateInput): Promise<GitHubPullRequest>;
  prUpdate(payload: GitHubPullRequestUpdateInput): Promise<GitHubPullRequest>;
  prMerge(payload: GitHubPullRequestMergeInput): Promise<GitHubPullRequestMergeResult>;
  prReady(payload: GitHubPullRequestReadyInput): Promise<GitHubPullRequestReadyResult>;

  prsList(directory: string, options?: { page?: number; query?: string }): Promise<GitHubPullRequestsListResult>;
  prContext(
    directory: string,
    number: number,
    options?: { includeDiff?: boolean; includeCheckDetails?: boolean; sourceRepo?: GitHubRepoSelector | null }
  ): Promise<GitHubPullRequestContextResult>;

  issuesList(directory: string, options?: { page?: number; query?: string }): Promise<GitHubIssuesListResult>;
  issueGet(directory: string, number: number, options?: { sourceRepo?: GitHubRepoSelector | null }): Promise<GitHubIssueGetResult>;
  issueComments(directory: string, number: number, options?: { sourceRepo?: GitHubRepoSelector | null }): Promise<GitHubIssueCommentsResult>;
  repoUpstream(directory: string): Promise<GitHubRepoUpstreamResult>;
  repoBranches(owner: string, repo: string): Promise<string[]>;
}

export interface RemoteClientRecord {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt?: string | null;
  clientKind?: string | null;
  authMethod?: string | null;
  /** Pairing session this client was created from, when authMethod is 'pairing'. */
  pairingId?: string | null;
  deviceName?: string | null;
  devicePlatform?: string | null;
  usesRelay?: boolean;
  /** Transport that carried the device's most recent authenticated request. */
  lastTransport?: 'relay' | 'direct' | null;
}

// A pairing link that has been created but not yet redeemed by a device.
export interface PendingPairingRecord {
  id: string;
  label?: string;
  fingerprint?: string | null;
  expiresAt?: string;
  usesRelay?: boolean;
}

export interface RemoteClientCreateResult {
  client: RemoteClientRecord;
  token: string;
}

export interface RemoteClientRevokeResult {
  revoked: boolean;
  client?: RemoteClientRecord;
}

export interface RemoteClientPurgeRevokedResult {
  purged: number;
}

export interface PairingSessionCreateResult {
  pairing: {
    id: string;
    label?: string;
    fingerprint?: string | null;
    expiresAt?: string;
    secret: string;
  };
  server: {
    label: string;
    // Transport candidates for the pairing-v2 payload. Shape matches
    // PairingEndpointCandidate in `@/lib/connectionPayload` (direct lan/tunnel or
    // relay); left as a structural type here so this contract file stays leaf.
    candidates: Array<Record<string, unknown>>;
  };
}

export interface ClientAuthAPI {
  listClients(): Promise<RemoteClientRecord[]>;
  createClient(input?: { label?: string }): Promise<RemoteClientCreateResult>;
  // Creates a one-time pairing session (pairing v2). `serverUrl` is the
  // externally reachable URL to advertise as the direct candidate (the desktop
  // UI talks to its server over loopback, so it must supply the LAN URL); the
  // server folds in a relay candidate when its relay host is enabled.
  createPairingSession(input?: {
    label?: string;
    allowedClientKinds?: Array<'mobile' | 'desktop'>;
    serverUrl?: string;
    // Per-link transport choice. `includeRelay: true` adds the relay candidate
    // and enables the relay host on demand; `false` omits it; omitted keeps the
    // legacy "relay only if already enabled" behavior. `includeDirect: false`
    // produces a relay-only link (no direct candidate).
    includeRelay?: boolean;
    includeDirect?: boolean;
  }): Promise<PairingSessionCreateResult>;
  purgeRevokedClients(): Promise<RemoteClientPurgeRevokedResult>;
  revokeClient(id: string): Promise<RemoteClientRevokeResult>;
  // Pairing links created but not yet redeemed (the "pending devices" list).
  listPendingPairings(): Promise<PendingPairingRecord[]>;
  cancelPairing(id: string): Promise<{ cancelled: boolean }>;
  // Direct transports the server can be reached on, for the create-device dialog.
  // LAN reflects the server's actual bind, independent of the UI origin.
  getPairingTransports(): Promise<{ local: string | null; lan: string | null; relayAvailable: boolean }>;
}

export interface RuntimeAPIs {
  runtime: RuntimeDescriptor;
  terminal: TerminalAPI;
  git: GitAPI;
  files: FilesAPI;
  settings: SettingsAPI;
  permissions: PermissionsAPI;
  notifications: NotificationsAPI;
  github?: GitHubAPI;
  push?: PushAPI;
  atomic: AtomicAPI;
  diagnostics?: DiagnosticsAPI;
  clientAuth?: ClientAuthAPI;
  tools: ToolsAPI;
  editor?: EditorAPI;
  vscode?: VSCodeAPI;
  worktrees?: WorktreeMetadata[];
}

export type RuntimeAPISelector<TValue> = (apis: RuntimeAPIs) => TValue;

// ============== Skills Catalog Types ==============

type SkillsCatalogSourceId = string;

type SkillsCatalogSourceType = 'github' | 'clawdhub';

export interface SkillsCatalogSource {
  id: SkillsCatalogSourceId;
  label: string;
  description?: string;
  source: string;
  defaultSubpath?: string;
  sourceType?: SkillsCatalogSourceType;
}

interface SkillsCatalogItemInstalledBadge {
  isInstalled: boolean;
  scope?: 'user' | 'project';
  source?: 'opencode' | 'agents' | 'claude';
}

interface ClawdHubSkillMetadata {
  slug: string;
  version: string;
  displayName?: string;
  owner?: string;
  downloads?: number;
  stars?: number;
  versionsCount?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface SkillsCatalogItem {
  sourceId: SkillsCatalogSourceId;
  repoSource: string;
  repoSubpath?: string;
  gitIdentityId?: string;
  skillDir: string;
  skillName: string;
  frontmatterName?: string;
  description?: string;
  installable: boolean;
  warnings?: string[];
  installed?: SkillsCatalogItemInstalledBadge;
  /** ClawdHub-specific metadata (present only for ClawdHub sources) */
  clawdhub?: ClawdHubSkillMetadata;
}

export interface SkillsCatalogResponse {
  ok: boolean;
  sources?: SkillsCatalogSource[];
  itemsBySource?: Record<SkillsCatalogSourceId, SkillsCatalogItem[]>;
  pageInfoBySource?: Record<SkillsCatalogSourceId, { nextCursor?: string | null }>;
  error?: { kind: string; message: string };
}

export interface SkillsCatalogSourceResponse {
  ok: boolean;
  items?: SkillsCatalogItem[];
  nextCursor?: string | null;
  error?: { kind: string; message: string };
}

export interface SkillsRepoScanRequest {
  source: string;
  subpath?: string;
  gitIdentityId?: string;
}

type SkillsRepoScanError =
  | { kind: 'authRequired'; message: string; sshOnly: true; identities?: Array<{ id: string; name: string }> }
  | { kind: 'invalidSource'; message: string }
  | { kind: 'gitUnavailable'; message: string }
  | { kind: 'networkError'; message: string }
  | { kind: 'unknown'; message: string };

export interface SkillsRepoScanResponse {
  ok: boolean;
  items?: SkillsCatalogItem[];
  error?: SkillsRepoScanError;
}

interface SkillsInstallSelection {
  skillDir: string;
  /** ClawdHub-specific metadata for installation */
  clawdhub?: {
    slug: string;
    version: string;
  };
}

export interface SkillsInstallRequest {
  source: string;
  subpath?: string;
  gitIdentityId?: string;
  scope: 'user' | 'project';
  targetSource?: 'opencode' | 'agents';
  selections: SkillsInstallSelection[];
  conflictPolicy?: 'prompt' | 'skipAll' | 'overwriteAll';
  conflictDecisions?: Record<string, 'skip' | 'overwrite'>;
}

export type SkillsInstallError = SkillsRepoScanError | {
  kind: 'conflicts';
  message: string;
  conflicts: Array<{ skillName: string; scope: 'user' | 'project'; source?: 'opencode' | 'agents' }>;
};

export interface SkillsInstallResponse {
  ok: boolean;
  installed?: Array<{ skillName: string; scope: 'user' | 'project'; source?: 'opencode' | 'agents' }>;
  skipped?: Array<{ skillName: string; reason: string }>;
  error?: SkillsInstallError;
  requiresReload?: boolean;
  requiresRestart?: boolean;
  restartDeferred?: boolean;
  requiresManualRestart?: boolean;
  reloadFailed?: boolean;
  warning?: string;
  message?: string;
  reloadDelayMs?: number;
}
