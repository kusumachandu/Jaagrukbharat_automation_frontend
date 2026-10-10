"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { FileDropzone } from "@/components/FileDropzone";
import { API_BASE, ApiError, api, downloadFile, getToken } from "@/lib/api";
import type { BatchProgress, BatchSummary, Workflow } from "@/lib/types";

const FINISHED = new Set(["success", "failed", "cancelled", "skipped"]);

export default function BatchesPage() {
  const { user, loading } = useRequireAuth();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowId, setWorkflowId] = useState("");
  const [refColumn, setRefColumn] = useState("Service Request ID");
  const [carryColumns, setCarryColumns] = useState("Customer Name, Customer Contact");
  const [allowManual, setAllowManual] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [recent, setRecent] = useState<BatchSummary[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await api.get<BatchSummary[]>("/batches"));
    } catch {
      // the list is a convenience
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    api
      .get<Workflow[]>("/workflows")
      .then((w) => {
        setWorkflows(w);
        setWorkflowId((cur) => cur || w[0]?._id || "");
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load workflows"));
    void loadRecent();
  }, [user, loadRecent]);

  // Follow the open batch until every row has finished.
  const batchId = batch?._id;
  const done = batch?.finished;
  useEffect(() => {
    if (!batchId || done) return;
    const t = setInterval(async () => {
      try {
        setBatch(await api.get<BatchProgress>(`/batches/${batchId}`));
      } catch {
        // try again next tick
      }
    }, 4000);
    return () => clearInterval(t);
  }, [batchId, done]);

  async function retryRow(runId: string) {
    try {
      await api.post(`/runs/${runId}/retry`);
      if (batch) setBatch(await api.get<BatchProgress>(`/batches/${batch._id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not retry that row");
    }
  }

  async function start() {
    if (!file || !workflowId) return;
    setStarting(true);
    setError(null);
    try {
      // multipart, so the JSON-only api helper can't be used
      const form = new FormData();
      form.append("file", file);
      if (refColumn.trim()) form.append("refColumn", refColumn.trim());
      if (carryColumns.trim()) form.append("carryColumns", carryColumns.trim());
      if (allowManual) form.append("allowManualCaptcha", "true");
      const token = getToken();
      const res = await fetch(`${API_BASE}/workflows/${workflowId}/batches`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
        throw new Error(msg || res.statusText);
      }
      setBatch((await res.json()) as BatchProgress);
      setFile(null);
      void loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the batch");
    } finally {
      setStarting(false);
    }
  }

  if (loading || !user) return null;

  return (
    <div>
      <PageHeader eyebrow="Batches" title="Run from a sheet" />
      <div className="p-8 max-w-5xl">
        <p className="text-sm text-text-muted max-w-2xl mb-5">
          Upload an .xlsx and every row becomes a run of the chosen workflow — its columns fill the
          workflow&apos;s inputs (matched by name, e.g. a &quot;Vehicle Number&quot; column). When
          the runs finish, download the results as another sheet.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 mb-3">
          <label className="text-xs font-mono text-text-muted">
            Workflow
            <select
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              className="input mt-1 w-full"
            >
              {workflows.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-mono text-text-muted">
            Column that identifies each row (shown in the results)
            <input
              value={refColumn}
              onChange={(e) => setRefColumn(e.target.value)}
              placeholder="e.g. Service Request ID"
              className="input mt-1 w-full"
            />
          </label>
        </div>
        <label className="block text-xs font-mono text-text-muted mb-3">
          Other columns to copy into the results (comma-separated)
          <input
            value={carryColumns}
            onChange={(e) => setCarryColumns(e.target.value)}
            placeholder="e.g. Customer Name, Customer Contact"
            className="input mt-1 w-full"
          />
        </label>
        <div className="mb-3">
          <FileDropzone
            file={file}
            onFile={setFile}
            accept=".xlsx"
            maxBytes={5 * 1024 * 1024}
            hint=".xlsx spreadsheet · up to 5 MB · first row = column names"
            testId="batch-file"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={allowManual} onChange={(e) => setAllowManual(e.target.checked)} />
            Start even if captchas have to be typed by a person
          </label>
          <button
            onClick={start}
            disabled={!file || !workflowId || starting}
            data-testid="batch-start"
            className="bg-signal text-ink font-semibold rounded-md px-5 py-2 text-sm disabled:opacity-40"
          >
            {starting ? "Reading sheet…" : "Start batch"}
          </button>
        </div>
        {error && <p className="text-danger text-sm mb-4">{error}</p>}

        {batch && (
          <section className="mb-8" data-testid="batch-progress">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="text-sm">
                <span className="font-mono text-text-primary">{batch.fileName}</span>
                <span className="text-text-muted">
                  {" "}
                  — {batch.done} of {batch.total} done
                  {batch.failed > 0 && `, ${batch.failed} failed`}
                  {batch.skipped > 0 && `, ${batch.skipped} skipped`}
                </span>
              </div>
              <button
                onClick={() => downloadFile(`/batches/${batch._id}/results.xlsx`, "results.xlsx")}
                className="btn-ghost"
              >
                Download results (.xlsx)
              </button>
            </div>
            <div className="h-1.5 rounded bg-ink-raised mb-3 overflow-hidden">
              <div
                className="h-full bg-signal transition-all"
                style={{ width: `${batch.total ? (batch.done / batch.total) * 100 : 0}%` }}
              />
            </div>
            <div className="border border-ink-line rounded-md overflow-auto max-h-[28rem]">
              <table className="w-full text-xs font-mono">
                <thead className="bg-ink-panel text-text-muted text-left">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Reference</th>
                    {batch.carryColumns.map((c) => (
                      <th key={c} className="px-3 py-2">
                        {c}
                      </th>
                    ))}
                    <th className="px-3 py-2">Input</th>
                    <th className="px-3 py-2 text-right">Challans</th>
                    <th className="px-3 py-2 text-right">Total amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.rows.map((r) => (
                    <tr key={r.rowNo} className="border-t border-ink-line">
                      <td className="px-3 py-1.5">{r.rowNo}</td>
                      <td className="px-3 py-1.5">{r.ref}</td>
                      {batch.carryColumns.map((c) => (
                        <td key={c} className="px-3 py-1.5">
                          {r.carry?.[c] ?? ""}
                        </td>
                      ))}
                      <td className="px-3 py-1.5">{Object.values(r.shown).join(" ")}</td>
                      <td className="px-3 py-1.5 text-right">{r.challans ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right">
                        {r.totalAmount === null
                          ? "—"
                          : r.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={
                            r.status === "failed"
                              ? "text-danger"
                              : r.status === "paused"
                                ? "text-warn"
                                : FINISHED.has(r.status)
                                  ? "text-ok"
                                  : "text-text-muted"
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        {r.runId ? (
                          <span className="flex items-center gap-2">
                            <Link href={`/runs/${r.runId}`} className="hover:text-signal">
                              {r.verdict ?? r.note ?? "open"}
                            </Link>
                            {(r.status === "failed" || r.status === "cancelled") && (
                              <button
                                onClick={() => retryRow(r.runId!)}
                                className="rounded border border-ink-line px-2 py-0.5 text-text-muted hover:text-signal hover:border-signal/40"
                              >
                                Retry
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="text-text-muted">{r.note}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="font-mono text-xs uppercase tracking-widest text-text-muted mb-2">
              Recent batches
            </h2>
            <ul className="flex flex-col gap-1">
              {recent.map((b) => (
                <li key={b._id}>
                  <button
                    onClick={async () => setBatch(await api.get<BatchProgress>(`/batches/${b._id}`))}
                    className="text-sm text-text-muted hover:text-signal text-left"
                  >
                    {b.fileName} · {b.rows} rows · {new Date(b.createdAt).toLocaleString()}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
