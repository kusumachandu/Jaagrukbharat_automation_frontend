export enum StepType {
  NAVIGATE = "navigate",
  CLICK = "click",
  TYPE = "type",
  WAIT = "wait",
  EXTRACT = "extract",
  CONDITION = "condition",
  AWAIT_INPUT = "await_input",
  // Reads the page and turns it into a result ("Eligible" / "Not eligible").
  DECIDE = "decide",
}

export enum StepOnFail {
  SKIP = "skip",
  RETRY = "retry",
  ABORT = "abort",
}

export enum TriggerType {
  MANUAL = "manual",
  CRON = "cron",
  WEBHOOK = "webhook",
}

export enum RunStatus {
  QUEUED = "queued",
  RUNNING = "running",
  PAUSED = "paused",
  SUCCESS = "success",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum ActionResult {
  OK = "ok",
  FALLBACK_USED = "fallback_used",
  ERROR = "error",
  MANUAL_INPUT = "manual_input",
  MANUAL_FIX = "manual_fix",
  MANUAL_SKIP = "manual_skip",
}

export interface RetryPolicy {
  retries: number;
  onFail: StepOnFail;
}

export type ResultTone = "positive" | "negative" | "neutral";

export interface DecisionOutcome {
  // Ends the run with this as its result — omit when this outcome only
  // steers the run down a branch (setBranch) rather than concluding it.
  // At least one of the two must be set.
  label?: string;
  tone: ResultTone;
  // Makes this outcome the run's active branch — later steps tagged
  // Step.branch with a *different* value are skipped this run.
  setBranch?: string;
}

// DECIDE only: look for `text` on the page; found -> ifFound, else ifNotFound.
export interface Decision {
  text: string;
  isRegex?: boolean;
  // CSS selector to look inside; whole page when empty.
  scope?: string;
  // How long to keep looking before concluding the text isn't there.
  settleMs?: number;
  ifFound: DecisionOutcome;
  ifNotFound: DecisionOutcome;
}

// The verdict a run ended with (set by a DECIDE step).
export interface RunResult {
  label: string;
  tone: ResultTone;
}

export interface Step {
  order: number;
  type: StepType;
  selector: string;
  fallbackIntent: string;
  value?: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  interventionTimeoutMs: number;
  // AWAIT_INPUT only: when set, a single operator-supplied value (e.g. an
  // OTP) is split one character per selector, in order, instead of being
  // filled whole into `selector`.
  selectors?: string[];
  // false = disconnected: stays on the canvas, skipped when the workflow runs.
  enabled?: boolean;
  // Only needed to sign in to the target website; skipped once the workflow
  // has a saved sign-in (see Workflow.keepSignedIn).
  signInOnly?: boolean;
  decision?: Decision;
  // Only runs while this is the run's active branch (set by an earlier
  // decide step's outcome — see DecisionOutcome.setBranch). No tag = always runs.
  branch?: string;
}

export interface Trigger {
  type: TriggerType;
  cronExpr?: string;
  webhookSecret?: string;
}

export interface WorkflowInput {
  key: string;
  label: string;
  sensitive?: boolean;
  required?: boolean;
  // Regex the value must satisfy when a run is triggered, e.g. "^\\d{12}$".
  pattern?: string;
}

export interface Workflow {
  _id: string;
  name: string;
  description?: string;
  ownerId: string;
  trigger: Trigger;
  steps: Step[];
  inputs?: WorkflowInput[];
  // Reuse the target website's sign-in between runs (not this app's login).
  keepSignedIn?: boolean;
  isActive: boolean;
  version: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function emptyWorkflowInput(): WorkflowInput {
  return { key: "", label: "", sensitive: false, required: true };
}

export interface Run {
  _id: string;
  workflowId: string;
  workflowVersion: number;
  sessionId?: string;
  status: RunStatus;
  triggerSource: string;
  startedAt?: string;
  finishedAt?: string;
  pausedAt?: string;
  interventionsCount: number;
  fallbacksUsed: number;
  captchasSolved: number;
  errorMessage?: string;
  createdAt: string;
  artifacts?: RunArtifact[];
  result?: RunResult;
  usedSavedSignIn?: boolean;
  // Which path a decide step's setBranch sent this run down, if any.
  activeBranch?: string;
  // A screen recording of the whole run, when one was saved (best-effort;
  // absent on runs from before this existed). GET /runs/:id/recording.
  recording?: { sizeBytes: number; savedAt: string };
  // Secret in the end-user window link; only ever returned to the owner.
  sessionKey?: string | null;
}

// A file the run downloaded (e.g. the ABHA card).
export interface RunArtifact {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  stepOrder?: number;
  savedAt?: string;
}

// One row of the Sessions tab (GET /runs).
export interface RunListItem extends Run {
  workflowName: string;
  // What (if anything) the run is waiting on someone for.
  awaiting: InterventionType | null;
  fileCount: number;
}

export type SummaryStepState =
  | "done"
  | "skipped"
  | "failed"
  | "current"
  | "pending"
  | "disconnected";

export interface RunSummary {
  outcome: "success" | "failed" | "cancelled" | "in_progress";
  headline: string;
  detail: string;
  result?: RunResult;
  durationMs?: number;
  stepsDone: number;
  stepsTotal: number;
  steps: Array<{
    order: number;
    label: string;
    state: SummaryStepState;
    note?: string;
  }>;
  highlights: Array<{ label: string; value: string }>;
  files: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  handledByPeople: { valuesEntered: number; fixesApplied: number };
  failure?: {
    stepOrder: number | null;
    stepLabel: string;
    reason: string;
    suggestion: string;
    technicalDetail?: string; // owner view only
  };
}

// What the end-user session window is told (GET /public/sessions/:runId/:key).
export interface PublicAwaiting {
  kind: "captcha" | "otp" | "text" | "operator";
  prompt: string;
  length?: number;
  hasImage: boolean;
  canAnswer: boolean;
}

export type PublicPhaseState = "done" | "active" | "waiting" | "pending" | "failed";

export interface PublicPhase {
  key: "connect" | "details" | "verify" | "result";
  title: string;
  detail: string;
  state: PublicPhaseState;
  stepFrom: number;
  stepTo: number;
}

export interface PublicSessionView {
  runId: string;
  workflowName: string;
  status: RunStatus;
  summary: RunSummary;
  awaiting: PublicAwaiting | null;
  // Optional: an older backend doesn't send these, and the page copes without them.
  siteHost?: string;
  startedAt?: string;
  finishedAt?: string;
  typicalDurationMs?: { lowMs: number; highMs: number; medianMs: number } | null;
  phases?: PublicPhase[];
  codes?: { captcha: number; otp: number; other: number; answered: number };
  updatedAt: string;
}

export interface ActionLog {
  _id: string;
  runId: string;
  stepOrder: number;
  result: ActionResult;
  selectorUsed?: string;
  screenshotUrl?: string;
  errorMessage?: string;
  extractedValue?: string;
  timestamp: string;
}

export enum InterventionType {
  MANUAL_TAKEOVER = "manual_takeover",
  INPUT_REQUIRED = "input_required",
}

export enum ResolutionAction {
  PROVIDE_VALUE = "provide_value",
  PROVIDE_SELECTOR = "provide_selector",
  SKIP = "skip",
  ABORT = "abort",
}

export interface Intervention {
  _id: string;
  runId: string;
  type: InterventionType;
  stepOrder: number;
  prompt: string;
  resolvedAt?: string;
  createdAt: string;
}

export const STEP_TYPE_ACCENT: Record<StepType, string> = {
  [StepType.NAVIGATE]: "#5B9BD5",
  [StepType.CLICK]: "#E8A33D",
  [StepType.TYPE]: "#B085E0",
  [StepType.WAIT]: "#7C8B9B",
  [StepType.EXTRACT]: "#4FB286",
  [StepType.CONDITION]: "#E2604F",
  [StepType.AWAIT_INPUT]: "#E2B94F",
  [StepType.DECIDE]: "#4FB2B2",
};

export function emptyStep(order: number): Step {
  return {
    order,
    enabled: true,
    type: StepType.CLICK,
    selector: "",
    fallbackIntent: "",
    value: "",
    timeoutMs: 15000,
    retryPolicy: { retries: 1, onFail: StepOnFail.ABORT },
    interventionTimeoutMs: 15 * 60 * 1000,
  };
}

export enum RecordedEventType {
  NAVIGATE = "navigate",
  CLICK = "click",
  TYPE = "type",
}

export enum RecordingSessionStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface RecordingStartResponse {
  workflowId: string;
  recordingId: string;
  status: "recording";
}

export interface RecordedEvent {
  type: RecordedEventType;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  timestamp: string;
}

export interface RecordingStatusResponse {
  id: string;
  workflowId: string;
  status: RecordingSessionStatus;
  eventCount: number;
  events: RecordedEvent[];
}

export interface RecordingStopResponse {
  workflowId: string;
  stepsCreated: number;
  status: "completed";
}

export const STEP_TYPE_LABEL: Record<StepType, string> = {
  [StepType.NAVIGATE]: "Navigate",
  [StepType.CLICK]: "Click",
  [StepType.TYPE]: "Type",
  [StepType.WAIT]: "Wait",
  [StepType.EXTRACT]: "Extract",
  [StepType.CONDITION]: "Condition",
  [StepType.AWAIT_INPUT]: "Await input",
  [StepType.DECIDE]: "Result rule",
};

// GET /workflows/:id/sign-in — whether a saved sign-in exists (never its contents).
export interface SavedSignInStatus {
  saved: boolean;
  savedAt?: string;
  lastUsedAt?: string;
}
