import { ApplicationStatus } from "@/lib/types";

const STYLES: Record<ApplicationStatus["status"], { dot: string; text: string; label: string; pulse?: boolean }> = {
  success: { dot: "bg-ok", text: "text-ok", label: "Success" },
  failed: { dot: "bg-danger", text: "text-danger", label: "Failed" },
  in_progress: { dot: "bg-signal", text: "text-signal", label: "In progress", pulse: true },
  cancelled: { dot: "bg-text-dim", text: "text-text-muted", label: "Cancelled" },
};

// The application's own outcome (e.g. a Udyam registration is a success only once its number is in hand) — kept apart
// from the task status, which is only whether the automation ran to the end. Shows the reference when there is one.
export function ApplicationBadge({
  application,
  showReference = true,
}: {
  application: Pick<ApplicationStatus, "status" | "reference">;
  showReference?: boolean;
}) {
  const s = STYLES[application.status] ?? STYLES.in_progress;
  return (
    <span
      data-testid="application-badge"
      data-status={application.status}
      className={`inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse ? "pulse-soft" : ""}`} />
      {s.label}
      {showReference && application.status === "success" && application.reference && (
        <span className="normal-case tracking-normal text-text-primary">{application.reference}</span>
      )}
    </span>
  );
}
