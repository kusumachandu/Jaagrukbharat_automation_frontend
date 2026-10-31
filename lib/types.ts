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
  // The website said no: end the run as FAILED with the label as the reason (so it can be
  // edited and retried), instead of as a successful run with a negative answer. Set by scripts.
  fail?: boolean;
}

// DECIDE only: look for `text` on the page; found -> ifFound, else ifNotFound.
export interface Decision {
  text: string;
  isRegex?: boolean;
  // CSS selector to look inside; whole page when empty.
  scope?: string;
  // How long to keep looking before concluding the text isn't there.
  settleMs?: number;
  // Not editable in the UI (set by scripts) but must survive a save from the builder.
  elseText?: string;
  dismissDialogs?: boolean;
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
  // EXTRACT only: "table" reads whole tables (e.g. a vehicle's challans).
  extractAs?: "text" | "table";
  // On a step that submits something the website may reject (a CAPTCHA): watch
  // for the rejection and let the person try again. Not editable in the UI yet —
  // set by scripts — but must survive a save from the builder.
  rejection?: Rejection;
  // The fields below are set by scripts, not editable in the builder — but saving from the
  // builder must carry them through, or it silently strips them from the workflow.
  // A step that must end with a downloaded file (the ABHA card).
  expectDownload?: boolean;
  // A clean-up step (log out), run once after the last step however the run ended.
  cleanup?: boolean;
  // Optional step: runs only if this text shows up within onlyIfWaitMs (a dialog that opens sometimes).
  onlyIfText?: string;
  onlyIfElseText?: string;
  onlyIfWaitMs?: number;
  // Runs only when the run's inputs satisfy this, e.g. "have_plant=Yes", "dic", "!dic".
  onlyIfInput?: string;
  // WAIT only: a visible line matching this regex (the website saying no) fails the run at once with it.
  failIfText?: string;
  // Shown to the person on their private link while this step is running.
  customerNote?: string;
  // WAIT only: known refusals watched for while waiting — the first whose text shows ends the run with its message.
  failCases?: Array<{ text: string; message: string; suggestion?: string }>;
  // After the step, wait until this text (a "Please wait…" overlay) is gone.
  waitGoneText?: string;
}

export interface Rejection {
  text?: string;
  maxAttempts?: number;
  retryFromOrder?: number;
  dismissSelector?: string;
  refreshSelector?: string;
  settleMs?: number;
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
  // Makes the variable a dropdown: the value must be one of these.
  options?: string[];
  // Editor only (never sent): what was typed in the "choices" box, so a trailing comma isn't eaten while typing.
  optionsText?: string;
}

/** One variable of a finished run, for the edit-and-retry form (GET /runs/:id/inputs). */
export interface RunInputField extends WorkflowInput {
  // Whether the run had a value for it — the value itself is only sent for non-sensitive ones.
  hasValue: boolean;
  value?: string;
}

/** "Male, Female, Others" -> ["Male","Female","Others"]; blank -> undefined (free text). */
export function parseOptions(text: string | undefined): string[] | undefined {
  const list = (text ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? Array.from(new Set(list)) : undefined;
}

// What makes an application a success, apart from the automation having run (e.g. the Udyam number was read).
export interface ApplicationRule {
  referencePattern: string;
  referenceLabel?: string;
}

// The application's own outcome (success only once its reference is in hand), separate from the task status.
export interface ApplicationStatus {
  status: "success" | "failed" | "cancelled" | "in_progress";
  reference?: string;
  referenceLabel?: string;
  reason?: string;
}

export interface Workflow {
  _id: string;
  applicationRule?: ApplicationRule;
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
  // The application's own outcome (set when the workflow has an application rule, e.g. the Udyam number must be
  // read): separate from `status`, which is only whether the automation ran to the end.
  application?: ApplicationStatus;
  // A screen recording of the whole run, when one was saved (best-effort;
  // absent on runs from before this existed). GET /runs/:id/recording.
  recording?: { sizeBytes: number; savedAt: string };
  // Screenshots taken after each action and at the result (the default
  // instead of a full recording). GET /runs/:id/snapshots/:n.
  snapshots?: RunSnapshot[];
  // Secret in the end-user window link; only ever returned to the owner.
  sessionKey?: string | null;
}

// Run-from-a-sheet (GET /batches, GET /batches/:id).
export interface BatchSummary {
  _id: string;
  fileName: string;
  workflowId: string;
  createdAt: string;
  rows: number;
}

export interface BatchRowProgress {
  rowNo: number;
  ref: string;
  shown: Record<string, string>;
  carry: Record<string, string>;
  runId: string | null;
  // a RunStatus, or "skipped" when no run was started for the row
  status: string;
  verdict: string | null;
  tone: ResultTone | null;
  // From the finished run's challan table; null until a run has finished.
  challans: number | null;
  totalAmount: number | null;
  // This customer's own pending challans, the fee on them and what they would
  // pay (pending + fee). null until the run has finished.
  payableCount: number | null;
  payableAmount: number | null;
  fee: number | null;
  toPay: number | null;
  // Status of the payment link, once the customer has been sent one.
  paymentStatus: "active" | "paid" | "partial" | "expired" | "cancelled" | null;
  note: string | null;
}

export interface BatchProgress {
  _id: string;
  fileName: string;
  workflowId: string;
  // The extra sheet columns carried into each row (e.g. Customer Name).
  carryColumns: string[];
  total: number;
  done: number;
  failed: number;
  skipped: number;
  finished: boolean;
  rows: BatchRowProgress[];
}

export interface RunSnapshot {
  n: number;
  label: string;
  stepOrder?: number;
  at: string;
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

export interface ResultTable {
  label: string;
  caption?: string;
  columns: string[];
  rows: string[][];
}

export interface RunSummary {
  // Optional: an older backend doesn't send it.
  application?: ApplicationStatus;
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
  // Tables read off the results page (e.g. a vehicle's challans). Optional: older backends don't send it.
  tables?: ResultTable[];
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
    // What the official website itself was showing when the run stopped (its error popup / validation
    // lines, with PANs, Aadhaar and phone numbers masked).
    websiteSaid?: string[];
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
  // Said to the person while the step now running is in progress ("this can take 5–10 minutes").
  note?: string;
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
  // A person asked to take over the browser; the run waits for them to hand it back.
  HUMAN_CONTROL = "human_control",
}

export enum ResolutionAction {
  PROVIDE_VALUE = "provide_value",
  PROVIDE_SELECTOR = "provide_selector",
  SKIP = "skip",
  ABORT = "abort",
  // "I did it by hand — carry on"; value = the step order to continue from.
  RESUME = "resume",
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
