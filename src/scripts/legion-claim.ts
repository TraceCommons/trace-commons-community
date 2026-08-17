// NEAR Legion self-serve invite claim island.
//
// Runs in the browser on /legion. Reads the issuer base from a meta tag
// injected by the Astro page so the same bundle works against any deployment.
//
// Flow:
//   1. Connect a NEAR wallet (wallet-selector modal).
//   2. POST /v1/onboard/near-legion/challenge -> { challengeId, message,
//      nonce, recipient }.
//   3. Wallet signs the NEP-413 payload over that nonce.
//   4. POST /v1/onboard/near-legion/claim with the signature -> an invite
//      code redeemable a fixed number of times.
//
// The invite code comes back in exactly one response body and is never stored
// server-side. If the user navigates away without copying it, it is gone. The
// success state says so and the code is the only thing on screen.

import { setupWalletSelector } from "@near-wallet-selector/core";
import type {
  WalletSelector,
  SignedMessage,
  SignMessageParams,
} from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

/**
 * A `Buffer` stand-in that satisfies the exact contract wallet-selector checks.
 *
 * Subclassing `Uint8Array` is load-bearing, not stylistic. wallet-selector's
 * `validateSignMessageParams` runs on every `signMessage` call and rejects the
 * nonce unless BOTH hold:
 *
 *     if (!Buffer.isBuffer(nonce) || nonce.length !== 32) throw ...
 *
 * A plain object cannot satisfy `.length`, and a plain `Uint8Array` cannot
 * satisfy `toString("base64")` — its inherited `toString` returns
 * comma-separated digits, which would silently send the wallet a wrong nonce
 * rather than failing loudly. A Uint8Array subclass with an overridden
 * `toString` satisfies every consumer:
 *
 *   - `Buffer.isBuffer(nonce)`  (core, signMessage validation)
 *   - `nonce.length === 32`     (core, same check)
 *   - `Buffer.from(nonce).toString("base64")` (my-near-wallet, builds the URL)
 */
class ShimBuffer extends Uint8Array {
  toString(encoding?: string): string {
    if (encoding === "base64") {
      let binary = "";
      for (const b of this) binary += String.fromCharCode(b);
      return btoa(binary);
    }
    return new TextDecoder().decode(this);
  }
}

/**
 * Install the `Buffer` global the NEAR packages assume.
 *
 * `Buffer` is a Node global with no browser equivalent, and nothing in the
 * dependency tree provides it — there is no `buffer` package installed. The
 * ecosystem norm is `vite-plugin-node-polyfills`; this covers the three call
 * sites our flow actually reaches without adding a dependency. Installed only
 * when `Buffer` is genuinely absent, so a real polyfill always wins.
 */
function installBufferShim(): void {
  const g = globalThis as Record<string, unknown>;
  if (g.Buffer) return;
  g.Buffer = {
    from(input: ArrayBuffer | Uint8Array | number[] | string): ShimBuffer {
      if (typeof input === "string") {
        return new ShimBuffer(new TextEncoder().encode(input));
      }
      if (input instanceof Uint8Array) {
        return new ShimBuffer(input);
      }
      return new ShimBuffer(
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : Uint8Array.from(input),
      );
    },
    isBuffer(value: unknown): boolean {
      return value instanceof Uint8Array;
    },
  };
}

interface ClaimConfig {
  issuerBase: string;
  network: "mainnet" | "testnet";
}

interface ChallengeResponse {
  challengeId: string;
  message: string;
  /** Hex-encoded 32-byte server nonce. */
  nonce: string;
  recipient: string;
}

/** Wire names of the ranks that can claim, highest first. */
type Rank = "vanguard" | "ascendant";

const RANK_LABEL: Record<Rank, string> = {
  vanguard: "Vanguard",
  ascendant: "Ascendant",
};

interface ClaimResponse {
  inviteCode: string;
  /** Rank the server resolved this account to. Decides the grant size. */
  rank: Rank;
  maxUses: number;
  expiresAt: string | null;
}

interface RankStatus {
  claimed: number;
  cap: number;
  remaining: number;
  maxUses: number;
}

/** Per-rank pools. Each rank carries its own cap and grant size. */
type StatusResponse = Record<Rank, RankStatus>;

type Stage =
  | "idle"
  | "connected"
  | "signing"
  | "claiming"
  | "code_shown"
  | "error";

interface ViewState {
  stage: Stage;
  accountId?: string;
  code?: ClaimResponse;
  errorLabel?: string;
  status?: StatusResponse;
}

/**
 * Copy for each server error label.
 *
 * Every refusal the server can return gets its own sentence. Collapsing them
 * into "something went wrong" would tell a user whose wallet holds no token to
 * go and debug their signature, and would tell someone who already claimed to
 * try again forever.
 */
const ERROR_COPY: Record<string, string> = {
  AccountIdMalformed: "That does not look like a valid NEAR account ID.",
  ChallengeNonceInvalid:
    "That signing request expired or was already used. Start again — it only takes a moment.",
  SignatureInvalid:
    "The signature did not verify against the challenge we issued. Start again, and make sure you approve the request in the wallet that owns the account.",
  PublicKeyNotFullAccess:
    "The key that signed is not a full-access key on that account. Sign with the wallet that actually owns it, not a limited app key.",
  AccountHoldsNoLegionToken:
    "That account does not hold a NEAR Legion credential. If you hold one in a different account, connect that one instead.",
  AccountRankNotEligible:
    "That account holds a NEAR Legion credential, but not at a rank that can claim right now. Invites are open to Vanguard and Ascendant only.",
  AccountNotEligible:
    "That account is not eligible to claim. Treasury and contract accounts are excluded.",
  InviteCredentialAlreadyBound:
    "This account has already claimed its invite codes. Each NEAR account gets one allotment.",
  NearLegionClaimCapReached:
    "All available invite allotments have been claimed. This round is full.",
  NearRpcUnavailable:
    "We could not reach NEAR to check the account right now. This is on our side — please try again shortly.",
  ClaimBackendUnavailable:
    "The invite service is unavailable right now. Please try again shortly.",
  WalletPopupBlocked:
    "Your browser blocked the wallet popup. Allow popups for this site and click “Sign and claim” again.",
  ClaimResponseMalformed:
    "The invite service returned a response we could not read. Nothing was claimed — please try again shortly.",
};

const GENERIC_ERROR =
  "Something went wrong talking to the invite service. Please try again.";

function readConfig(): ClaimConfig {
  const issuerMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="tc-issuer-base"]',
  );
  if (!issuerMeta?.content) {
    throw new Error("Missing tc-issuer-base meta tag");
  }
  const networkMeta = document.querySelector<HTMLMetaElement>(
    'meta[name="tc-near-network"]',
  );
  const network = networkMeta?.content === "testnet" ? "testnet" : "mainnet";
  return { issuerBase: issuerMeta.content.replace(/\/$/, ""), network };
}

/** Decode the server's hex nonce into the 32 bytes the wallet signs over. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error("Malformed nonce");
  // Without this, `Number.parseInt("zz", 16)` is NaN, which a Uint8Array
  // stores as 0. A non-hex nonce would then pass the 32-byte length check,
  // get signed, and come back as SignatureInvalid — whose copy tells the user
  // to go check their wallet for what is entirely our fault.
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error("Malformed nonce");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Decode the server's hex nonce into the exact type `signMessage` demands.
 *
 * Built through whatever `Buffer` global is in scope rather than returned as a
 * bare `Uint8Array`. Under a real polyfill, `Buffer.isBuffer(uint8array)` is
 * **false** — a real Buffer is a distinct subclass — so passing raw bytes would
 * fail validation the moment anyone adds `vite-plugin-node-polyfills`. Going
 * through the global is correct under both the shim and a real Buffer.
 */
function nonceForWallet(hex: string): SignMessageParams["nonce"] {
  const bytes = hexToBytes(hex);
  if (bytes.length !== 32) {
    // wallet-selector rejects any other length; fail here with a clear cause
    // rather than as an opaque "Invalid nonce" from inside the library.
    throw new Error(`Server nonce was ${bytes.length} bytes, expected 32`);
  }
  const bufferGlobal = (globalThis as Record<string, unknown>).Buffer as
    | { from(input: Uint8Array): unknown }
    | undefined;
  const nonce = bufferGlobal ? bufferGlobal.from(bytes) : bytes;
  return nonce as SignMessageParams["nonce"];
}

/**
 * POST helper that surfaces the server's error label rather than an HTTP code.
 * Throws an `Error` whose message is the label, so callers can map it through
 * `ERROR_COPY`.
 */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  // An edge 502/503 answers with an HTML body, not JSON. An unguarded parse
  // would throw a SyntaxError whose message becomes the error label, matching
  // no ERROR_COPY key and rendering the generic message instead of the
  // "service unavailable" copy this case already has.
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (!response.ok) throw new Error("ClaimBackendUnavailable");
      throw new Error("ClaimResponseMalformed");
    }
  }
  if (!response.ok) {
    throw new Error(
      typeof parsed.error === "string"
        ? parsed.error
        : "ClaimBackendUnavailable",
    );
  }
  return parsed as T;
}

async function fetchStatus(
  config: ClaimConfig,
): Promise<StatusResponse | null> {
  try {
    const response = await fetch(
      `${config.issuerBase}/v1/onboard/near-legion/status`,
    );
    if (!response.ok) return null;
    return (await response.json()) as StatusResponse;
  } catch {
    // A missing counter must not block a claim attempt: the server is the
    // authority on the cap either way.
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

class LegionClaimApp {
  private state: ViewState = { stage: "idle" };
  private selector: WalletSelector | null = null;
  private modal: WalletSelectorModal | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly config: ClaimConfig,
  ) {}

  async start(): Promise<void> {
    installBufferShim();
    this.render();

    const status = await fetchStatus(this.config);
    this.state.status = status ?? undefined;

    try {
      this.selector = await setupWalletSelector({
        network: this.config.network,
        modules: [setupMyNearWallet()],
      });
      this.modal = setupModal(this.selector, {
        // Not a contract-scoped sign-in: this flow only ever signs a message.
        contractId: "",
      });
      const accounts = this.selector.store.getState().accounts;
      if (accounts.length > 0) {
        this.state = {
          ...this.state,
          stage: "connected",
          accountId: accounts[0].accountId,
        };
      }
      this.selector.store.observable.subscribe((s) => {
        const active = s.accounts[0]?.accountId;
        if (active && this.state.stage === "idle") {
          this.state = { ...this.state, stage: "connected", accountId: active };
          this.render();
        }
      });
    } catch {
      this.state = {
        ...this.state,
        stage: "error",
        errorLabel: "WalletUnavailable",
      };
    }
    this.render();
  }

  private async connect(): Promise<void> {
    this.modal?.show();
  }

  private async claim(): Promise<void> {
    if (!this.selector || !this.state.accountId) return;
    const accountId = this.state.accountId;

    this.setStage("signing");
    let signed: SignedMessage | void;
    let challenge: ChallengeResponse;
    try {
      challenge = await postJson<ChallengeResponse>(
        `${this.config.issuerBase}/v1/onboard/near-legion/challenge`,
        { accountId },
      );
    } catch (error) {
      return this.fail(error);
    }

    try {
      const wallet = await this.selector.wallet();
      signed = await wallet.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: nonceForWallet(challenge.nonce),
      });
    } catch (error) {
      // Cancelling in the wallet and a genuine integration fault both land
      // here. Treating everything as a cancellation would silently hide a
      // broken flow behind "nothing happened" — wallet-selector's own nonce
      // validation throws exactly like this. Anything that is not plausibly a
      // user action is surfaced as an error and logged.
      const message = error instanceof Error ? error.message : String(error);

      // The wallet throws this by name when the browser refuses the popup. It
      // is neither a cancellation nor our bug, and it is the one failure here
      // the user can actually fix — so it must not fall through to the silent
      // reset below, which would leave the button looking inert.
      if (/popup window blocked/i.test(message)) {
        this.state = {
          ...this.state,
          stage: "error",
          errorLabel: "WalletPopupBlocked",
        };
        this.render();
        return;
      }

      const looksLikeIntegrationFault =
        /invalid (nonce|message|recipient)/i.test(message) ||
        error instanceof TypeError;
      if (looksLikeIntegrationFault) {
        console.error("[legion-claim] signMessage failed", error);
        this.state = {
          ...this.state,
          stage: "error",
          errorLabel: "WalletSignatureUnsupported",
        };
      } else {
        this.state = {
          ...this.state,
          stage: "connected",
          errorLabel: undefined,
        };
      }
      this.render();
      return;
    }

    if (!signed) {
      this.state = { ...this.state, stage: "connected" };
      this.render();
      return;
    }

    this.setStage("claiming");
    try {
      const code = await postJson<ClaimResponse>(
        `${this.config.issuerBase}/v1/onboard/near-legion/claim`,
        {
          challengeId: challenge.challengeId,
          accountId,
          publicKey: signed.publicKey,
          signature: signed.signature,
        },
      );
      this.state = { ...this.state, stage: "code_shown", code };
      this.render();
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const label =
      error instanceof Error ? error.message : "ClaimBackendUnavailable";
    this.state = { ...this.state, stage: "error", errorLabel: label };
    this.render();
  }

  private setStage(stage: Stage): void {
    this.state = { ...this.state, stage };
    this.render();
  }

  private render(): void {
    this.root.innerHTML = this.view();
    this.bind();
  }

  private bind(): void {
    this.root
      .querySelector<HTMLButtonElement>("[data-action='connect']")
      ?.addEventListener("click", () => void this.connect());
    this.root
      .querySelector<HTMLButtonElement>("[data-action='claim']")
      ?.addEventListener("click", () => void this.claim());
    this.root
      .querySelector<HTMLButtonElement>("[data-action='retry']")
      ?.addEventListener("click", () => {
        this.state = {
          stage: this.state.accountId ? "connected" : "idle",
          accountId: this.state.accountId,
          status: this.state.status,
        };
        this.render();
      });
    this.root
      .querySelector<HTMLButtonElement>("[data-action='copy']")
      ?.addEventListener("click", (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        const code = this.state.code?.inviteCode;
        if (!code) return;
        void navigator.clipboard.writeText(code).then(
          () => {
            button.textContent = "Copied";
          },
          () => {
            button.textContent = "Copy failed — select it by hand";
          },
        );
      });
  }

  /**
   * One line per rank pool.
   *
   * The pools are independent, so an aggregate would be actively misleading: a
   * full Vanguard pool says nothing about whether an Ascendant can still claim.
   */
  private statusLine(): string {
    const s = this.state.status;
    if (!s) return "";

    const ranks: Rank[] = ["vanguard", "ascendant"];
    const parts = ranks
      .map((rank) => {
        const pool = s[rank];
        if (!pool) return "";
        const name = RANK_LABEL[rank];
        if (pool.remaining === 0) {
          return `${name}: all ${pool.cap} allotments claimed.`;
        }
        return `${name}: ${pool.remaining} of ${pool.cap} remaining, ${pool.maxUses} invites each.`;
      })
      .filter(Boolean);

    if (parts.length === 0) return "";
    return `<p class="muted">${parts.map(escapeHtml).join(" ")}</p>`;
  }

  private view(): string {
    const { stage, accountId, code, errorLabel } = this.state;

    if (stage === "code_shown" && code) {
      const expiry = code.expiresAt
        ? new Date(code.expiresAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : null;
      return `
        <div class="claim-panel">
          <h2>Your invite code</h2>
          <p class="claim-code"><code>${escapeHtml(code.inviteCode)}</code></p>
          <p><button data-action="copy">Copy</button></p>
          <p class="warn">
            <strong>Copy this now.</strong> It is shown once and is not stored
            anywhere we can retrieve it. If you close this page without copying
            it, it is gone.
          </p>
          <p>
            ${escapeHtml(RANK_LABEL[code.rank] ?? "Legion")} rank — redeemable
            <strong>${code.maxUses} times</strong>${
              expiry ? `, until ${escapeHtml(expiry)}` : ""
            }. Give it to people whose agent work you would want in the register.
          </p>
        </div>`;
    }

    if (stage === "error") {
      const copy =
        (errorLabel && ERROR_COPY[errorLabel]) ??
        (errorLabel === "WalletSignatureUnsupported"
          ? "Your wallet could not sign the request. This is a fault on our side, not something you did — the details are in the browser console."
          : errorLabel === "WalletUnavailable"
            ? "Could not start the NEAR wallet connection. Check that your browser is not blocking popups, then reload."
            : GENERIC_ERROR);
      const terminal =
        errorLabel === "InviteCredentialAlreadyBound" ||
        errorLabel === "NearLegionClaimCapReached";
      return `
        <div class="claim-panel">
          <p class="error">${escapeHtml(copy)}</p>
          ${terminal ? "" : `<p><button data-action="retry">Try again</button></p>`}
        </div>`;
    }

    if (stage === "signing" || stage === "claiming") {
      const label =
        stage === "signing"
          ? "Waiting for you to approve the signature in your wallet…"
          : "Checking the account on NEAR and issuing your code…";
      return `<div class="claim-panel"><p class="muted">${label}</p></div>`;
    }

    if (stage === "connected" && accountId) {
      return `
        <div class="claim-panel">
          ${this.statusLine()}
          <p>Connected as <code>${escapeHtml(accountId)}</code>.</p>
          <p>
            Signing costs nothing and authorizes no transaction. It proves you
            control this account.
          </p>
          <p><button data-action="claim">Sign and claim invite codes</button></p>
        </div>`;
    }

    return `
      <div class="claim-panel">
        ${this.statusLine()}
        <p><button data-action="connect">Connect NEAR wallet</button></p>
      </div>`;
  }
}

const root = document.querySelector<HTMLElement>("[data-legion-claim]");
if (root) {
  const app = new LegionClaimApp(root, readConfig());
  void app.start();
}
