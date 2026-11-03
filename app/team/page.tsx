"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/PageHeader";
import { api, ApiError } from "@/lib/api";
import { ROLE_LABEL, Role, useAuth } from "@/lib/auth-context";

type AccountStatus = "pending" | "approved" | "rejected" | "disabled";

interface Person {
  _id: string;
  email: string;
  name?: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
}

const ROLE_HELP: Record<Role, string> = {
  super_admin: "Everything, including approving people.",
  user: "Runs and resolves work. Customer details show only the last 4 digits.",
  observer: "Sees everything, including full customer details. Cannot change anything.",
};

const STATUS_STYLE: Record<AccountStatus, string> = {
  pending: "text-warn",
  approved: "text-ok",
  rejected: "text-danger",
  disabled: "text-text-muted",
};

const ROLES: Role[] = ["user", "observer", "super_admin"];

function when(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TeamPage() {
  const { user, loading } = useRequireAuth();
  const { isSuperAdmin } = useAuth();
  const router = useRouter();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"requests" | "everyone">("requests");
  const [choice, setChoice] = useState<Record<string, Role>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && !isSuperAdmin) router.replace("/workflows");
  }, [loading, user, isSuperAdmin, router]);

  const load = useCallback(async () => {
    try {
      setPeople(await api.get<Person[]>("/users"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load people");
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [isSuperAdmin, load]);

  async function act(id: string, run: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await run();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That did not work");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !user || !isSuperAdmin) return null;

  const pending = (people ?? []).filter((p) => p.status === "pending");
  const everyone = (people ?? []).filter((p) => p.status !== "pending");

  return (
    <div>
      <PageHeader eyebrow="Access" title="Team" />
      <div className="p-8 max-w-5xl">
        <div className="flex gap-1 mb-5">
          <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>
            Requests
            {pending.length > 0 && (
              <span className="ml-2 rounded-full bg-signal text-ink text-[10px] font-semibold px-1.5 py-0.5">
                {pending.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "everyone"} onClick={() => setTab("everyone")}>
            Everyone <span className="ml-2 text-text-dim">{everyone.length}</span>
          </TabButton>
        </div>

        {error && (
          <p className="text-danger text-sm bg-danger/10 border border-danger/30 rounded-md px-3 py-2 mb-4">{error}</p>
        )}

        {people === null ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : tab === "requests" ? (
          pending.length === 0 ? (
            <div className="border border-dashed border-ink-line rounded-lg p-10 text-center text-text-muted text-sm">
              No one is waiting for approval.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {pending.map((p) => {
                const role = choice[p._id] ?? "user";
                return (
                  <li
                    key={p._id}
                    className="bg-ink-panel border border-ink-line rounded-lg shadow-panel p-4 flex flex-wrap items-center gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-text-primary text-sm font-medium truncate">{p.email}</div>
                      <div className="text-text-dim text-xs font-mono mt-0.5">Asked {when(p.createdAt)}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <select
                        className="input"
                        value={role}
                        onChange={(e) => setChoice({ ...choice, [p._id]: e.target.value as Role })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] text-text-dim max-w-[230px]">{ROLE_HELP[role]}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={busy === p._id}
                        onClick={() => act(p._id, () => api.post(`/users/${p._id}/approve`, { role }))}
                        className="rounded-md bg-signal text-ink font-semibold px-4 py-2 text-sm hover:bg-signal-glow transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy === p._id}
                        onClick={() => act(p._id, () => api.post(`/users/${p._id}/reject`))}
                        className="btn-ghost hover:!text-danger disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <div className="bg-ink-panel border border-ink-line rounded-lg shadow-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-mono uppercase tracking-wider text-text-dim border-b border-ink-line">
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {everyone.map((p) => {
                  const self = p._id === user.userId;
                  return (
                    <tr key={p._id} className="border-b border-ink-line last:border-0">
                      <td className="px-4 py-3 text-text-primary">
                        {p.email}
                        {self && <span className="ml-2 text-[10px] font-mono text-text-dim">YOU</span>}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="input !py-1"
                          value={p.role}
                          disabled={self || busy === p._id || p.status !== "approved"}
                          title={ROLE_HELP[p.role]}
                          onChange={(e) =>
                            act(p._id, () => api.patch(`/users/${p._id}/role`, { role: e.target.value }))
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={`px-4 py-3 font-mono text-xs uppercase ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs font-mono">{when(p.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {!self &&
                          (p.status === "approved" ? (
                            <button
                              disabled={busy === p._id}
                              onClick={() => act(p._id, () => api.post(`/users/${p._id}/disable`))}
                              className="btn-ghost hover:!text-danger disabled:opacity-50"
                            >
                              Switch off
                            </button>
                          ) : (
                            <button
                              disabled={busy === p._id}
                              onClick={() => act(p._id, () => api.post(`/users/${p._id}/enable`))}
                              className="btn-ghost disabled:opacity-50"
                            >
                              {p.status === "rejected" ? "Approve" : "Switch on"}
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm border transition-colors ${
        active
          ? "bg-signal/15 text-signal border-signal/30"
          : "text-text-muted hover:text-text-primary hover:bg-ink-raised border-transparent"
      }`}
    >
      {children}
    </button>
  );
}
