import type { WorkflowInput } from "./types";

// Mirrors the backend's input-options.util: a dropdown whose choices depend on other variables (a state's
// districts). Parent values are matched ignoring case and extra spaces.
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const SEPARATOR = "||";

export function isDependent(input: Pick<WorkflowInput, "dependsOn" | "optionsByParent">): boolean {
  return !!input.dependsOn?.length && !!input.optionsByParent;
}

/**
 * What a variable's box should be, given the values entered so far:
 *   - "text"    — free text (no choices defined, or no list for the chosen parent value)
 *   - "waiting" — a dependent dropdown whose parent isn't chosen yet (shown disabled: "Choose the state first")
 *   - "select"  — a dropdown, with these choices
 */
export type FieldMode =
  | { mode: "text" }
  | { mode: "waiting"; waitingFor: string[] }
  | { mode: "select"; options: string[] };

export function fieldMode(
  input: WorkflowInput,
  values: Record<string, string | undefined>,
  inputs: WorkflowInput[],
): FieldMode {
  if (isDependent(input)) {
    const parents = input.dependsOn!;
    const unset = parents.filter((k) => !squash(values[k] ?? ""));
    if (unset.length > 0) {
      const label = (k: string) => inputs.find((i) => i.key === k)?.label || k;
      return { mode: "waiting", waitingFor: unset.map(label) };
    }
    const wanted = parents.map((k) => squash(values[k] ?? "")).join(SEPARATOR);
    const entry = Object.entries(input.optionsByParent!).find(
      ([key]) => key.split(SEPARATOR).map(squash).join(SEPARATOR) === wanted,
    );
    return entry ? { mode: "select", options: entry[1] } : { mode: "text" };
  }
  if (input.options && input.options.length > 0) return { mode: "select", options: input.options };
  return { mode: "text" };
}

/**
 * Whether a question is being asked, given the answers so far — a copy of the backend's inputConditionHolds
 * (same forms as a step's onlyIfInput): "have_plant=Yes", "have_plant=Yes|Maybe", "x!=No", "x" (filled), "!x"
 * (blank), "a|b" (one of them filled), "p && !q". No condition, or one that can't be read, = asked.
 */
export function conditionHolds(condition: string | undefined, values: Record<string, string | undefined>): boolean {
  if (!condition || !condition.trim()) return true;
  if (condition.includes("&&")) return condition.split("&&").every((part) => conditionHolds(part, values));
  if (/^[a-zA-Z0-9_\s|]+$/.test(condition) && condition.includes("|")) {
    return condition.split("|").some((k) => (values[k.trim()] ?? "").trim() !== "");
  }
  const m = /^\s*(!?)\s*([a-zA-Z0-9_]+)\s*(?:(!=|=)\s*(.*))?$/.exec(condition);
  if (!m) return true;
  const [, bang, key, op, rest] = m;
  const actual = (values[key] ?? "").trim().toLowerCase();
  if (!op) return bang ? actual === "" : actual !== "";
  const equal = (rest ?? "").split("|").map((s) => s.trim().toLowerCase()).includes(actual);
  return op === "=" ? equal : !equal;
}
