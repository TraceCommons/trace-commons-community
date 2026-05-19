// Profile management SPA island.
//
// Runs in the browser on /profile. Reads TC_API_BASE from a meta tag
// injected by the Astro page so the same bundle works against any
// deployment.
//
// Auth model for the pilot:
//   1. Contributor pastes their operator-minted workload JWT into a
//      one-time form. Stays in sessionStorage; never persists across
//      tab close.
//   2. SPA POSTs the JWT to <issuer>/v1/trace-upload-claim with
//      consent_scopes=["public_attribution"] to mint a short-lived
//      upload-claim. The upload-claim is the actual Bearer for
//      /v1/community/profile.
//   3. Upload-claim TTL is the session. When it expires, the SPA
//      surfaces "session expired" and the contributor pastes the
//      workload JWT again.
//
// A real OAuth-style redirect flow lands when the issuer grows
// `GET /authorize` + `POST /token` endpoints. The wire-shape of the
// upload-claim doesn't change; only the way the SPA acquires it.

interface CommunityConfig {
  ingestBase: string;
  issuerBase: string;
}

interface UploadClaimResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  expires_in: number;
}

interface CommunityProfileResponse {
  display_handle: string;
  handle_normalized: string;
  bio: string | null;
  public_since: string;
  last_updated_at: string;
  update_count: number;
}

interface ApiErrorResponse {
  error: string;
}

interface SessionState {
  uploadClaim: string;
  expiresAt: number; // epoch ms
  tenantId: string;
  principalRef: string;
}

const SESSION_STORAGE_KEY = "trace-commons-community.session.v1";
const UPLOAD_CLAIM_SCHEMA_VERSION = "ironclaw.trace_upload_claim_request.v1";

function readConfig(): CommunityConfig {
  const ingestMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="tc-ingest-base"]',
  );
  const issuerMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="tc-issuer-base"]',
  );
  if (!ingestMeta?.content || !issuerMeta?.content) {
    throw new Error("Missing tc-ingest-base / tc-issuer-base meta tags");
  }
  return {
    ingestBase: ingestMeta.content.replace(/\/$/, ""),
    issuerBase: issuerMeta.content.replace(/\/$/, ""),
  };
}

function loadSession(): SessionState | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionState;
    if (parsed.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(s: SessionState): void {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s));
}

function clearSession(): void {
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Decode the unverified JWT payload so the SPA can show the
 * contributor which tenant + principal_ref the session is bound to.
 * Server-side verification is what actually matters; this is for
 * display only.
 */
function unsafeDecodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Not a JWT");
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

async function exchangeWorkloadForUploadClaim(
  config: CommunityConfig,
  workloadJwt: string,
  tenantId: string,
): Promise<SessionState> {
  const body = {
    schema_version: UPLOAD_CLAIM_SCHEMA_VERSION,
    tenant_id: tenantId,
    consent_scopes: ["public_attribution"],
    allowed_uses: [] as string[],
    requested_at: new Date().toISOString(),
  };
  const response = await fetch(`${config.issuerBase}/v1/trace-upload-claim`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workloadJwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiErrorResponse;
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(`Issuer refused upload-claim: ${detail}`);
  }
  const minted = (await response.json()) as UploadClaimResponse;
  const claimPayload = unsafeDecodeJwtPayload(minted.access_token);
  return {
    uploadClaim: minted.access_token,
    expiresAt: new Date(minted.expires_at).getTime(),
    tenantId: String(claimPayload.tenant_id ?? tenantId),
    principalRef: String(claimPayload.principal_ref ?? ""),
  };
}

async function putProfile(
  config: CommunityConfig,
  session: SessionState,
  body: { display_handle: string; bio?: string },
): Promise<CommunityProfileResponse> {
  const response = await fetch(`${config.ingestBase}/v1/community/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.uploadClaim}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiErrorResponse;
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await response.json()) as CommunityProfileResponse;
}

async function deleteProfile(
  config: CommunityConfig,
  session: SessionState,
): Promise<void> {
  const response = await fetch(`${config.ingestBase}/v1/community/profile`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.uploadClaim}` },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = (await response.json()) as ApiErrorResponse;
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
}

function render(): void {
  const container = document.querySelector<HTMLElement>("[data-profile-app]");
  if (!container) return;
  let config: CommunityConfig;
  try {
    config = readConfig();
  } catch (e) {
    container.innerHTML = `<p class="muted">Configuration error: ${(e as Error).message}</p>`;
    return;
  }
  const session = loadSession();
  if (!session) {
    renderLogin(container, config);
  } else {
    renderProfile(container, config, session);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLogin(container: HTMLElement, config: CommunityConfig): void {
  container.innerHTML = `
    <h2>Sign in</h2>
    <p>
      Paste the workload JWT the operator handed you (the same one you set
      as <code>IRONCLAW_TRACE_WORKLOAD_TOKEN</code> in your shell). The SPA
      exchanges it for a short-lived upload-claim with the
      <code>public_attribution</code> scope and uses that for profile
      changes. The workload JWT never leaves your browser; the
      upload-claim lives in <code>sessionStorage</code> and expires when
      the operator-configured TTL runs out.
    </p>
    <form data-form="login">
      <label>
        Tenant ID
        <input name="tenant_id" required placeholder="tenant-zaki-pilot" autocomplete="off" />
      </label>
      <label>
        Workload JWT
        <textarea name="workload_jwt" required rows="5" placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSI..." autocomplete="off"></textarea>
      </label>
      <button type="submit">Sign in</button>
    </form>
    <p data-message class="muted"></p>
  `;
  const form = container.querySelector<HTMLFormElement>('[data-form="login"]')!;
  const messageEl = container.querySelector<HTMLElement>("[data-message]")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageEl.textContent = "Exchanging for upload-claim...";
    messageEl.className = "muted";
    const data = new FormData(form);
    const tenantId = String(data.get("tenant_id") ?? "").trim();
    const workloadJwt = String(data.get("workload_jwt") ?? "").trim();
    try {
      const session = await exchangeWorkloadForUploadClaim(config, workloadJwt, tenantId);
      saveSession(session);
      render();
    } catch (e) {
      messageEl.textContent = (e as Error).message;
      messageEl.className = "error";
    }
  });
}

function renderProfile(container: HTMLElement, config: CommunityConfig, session: SessionState): void {
  const expiresIn = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
  container.innerHTML = `
    <h2>Profile</h2>
    <p class="muted">
      Tenant <code>${escapeHtml(session.tenantId)}</code> · principal
      <code>${escapeHtml(session.principalRef.slice(0, 40))}…</code> ·
      session expires in ${expiresIn}s. <a href="#" data-action="sign-out">Sign out</a>
    </p>
    <form data-form="put">
      <label>
        Display handle
        <input name="display_handle" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_-]*[A-Za-z0-9]" autocomplete="off" />
      </label>
      <label>
        Bio (optional, max 280 chars)
        <textarea name="bio" rows="3" maxlength="280" autocomplete="off"></textarea>
      </label>
      <button type="submit">Save profile</button>
    </form>
    <form data-form="delete">
      <p class="muted">
        Withdrawing removes your handle from the public leaderboard at
        the next snapshot. The audit row stays in the DB; only the
        public display is removed.
      </p>
      <button type="submit">Withdraw public attribution</button>
    </form>
    <p data-message></p>
  `;
  const messageEl = container.querySelector<HTMLElement>("[data-message]")!;
  const putForm = container.querySelector<HTMLFormElement>('[data-form="put"]')!;
  const deleteForm = container.querySelector<HTMLFormElement>('[data-form="delete"]')!;
  const signOutLink = container.querySelector<HTMLAnchorElement>('[data-action="sign-out"]')!;

  signOutLink.addEventListener("click", (event) => {
    event.preventDefault();
    clearSession();
    render();
  });

  putForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    messageEl.textContent = "Saving...";
    messageEl.className = "muted";
    const data = new FormData(putForm);
    const display_handle = String(data.get("display_handle") ?? "").trim();
    const bio = String(data.get("bio") ?? "").trim();
    try {
      const profile = await putProfile(config, session, {
        display_handle,
        bio: bio.length > 0 ? bio : undefined,
      });
      messageEl.textContent =
        `Saved. @${profile.display_handle} (updated ${profile.update_count} times).`;
      messageEl.className = "success";
    } catch (e) {
      messageEl.textContent = (e as Error).message;
      messageEl.className = "error";
    }
  });

  deleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.confirm("Withdraw public attribution? This removes your handle from the leaderboard at the next snapshot.")) {
      return;
    }
    messageEl.textContent = "Withdrawing...";
    messageEl.className = "muted";
    try {
      await deleteProfile(config, session);
      messageEl.textContent = "Withdrawn. You'll disappear from the leaderboard at the next snapshot.";
      messageEl.className = "success";
    } catch (e) {
      messageEl.textContent = (e as Error).message;
      messageEl.className = "error";
    }
  });
}

document.addEventListener("DOMContentLoaded", render);
