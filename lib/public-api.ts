import { API_BASE, ApiError } from "./api";
import { PublicSessionView } from "./types";

// Client for the end-user session window. Deliberately NOT the `api` wrapper:
// that one attaches the operator's login token and hard-redirects to /login on
// a 401 — the person opening a private link has no account, and the only
// credential is the key in the URL.

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/public/sessions${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(", ") : body.message ?? message;
    } catch {
      // no JSON body
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

const p = (runId: string, key: string) =>
  `/${encodeURIComponent(runId)}/${encodeURIComponent(key)}`;

export const publicSession = {
  view: (runId: string, key: string) => request<PublicSessionView>(p(runId, key)),

  // Values only: the server refuses anything that isn't an answer to a prompt.
  answer: (runId: string, key: string, value: string) =>
    request<{ accepted: boolean }>(`${p(runId, key)}/answer`, {
      method: "POST",
      body: JSON.stringify({ value }),
    }),

  promptImage: (runId: string, key: string) =>
    request<{ dataUrl: string; cropped: boolean }>(`${p(runId, key)}/prompt-image`),

  fileUrl: (runId: string, key: string, fileId: string) =>
    `${API_BASE}/public/sessions${p(runId, key)}/files/${encodeURIComponent(fileId)}`,
};
