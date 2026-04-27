import { httpRequest } from "@/lib/request";

export type AccountType = "Free" | "Plus" | "ProLite" | "Pro" | "Team";
export type AccountStatus = "正常" | "限流" | "异常" | "禁用";
export type ImageModel = "auto" | "gpt-image-1" | "gpt-image-2";
export type AuthRole = "admin" | "user";
export type ImageLinkQuotaMode = "one_time" | "daily";
export type PublicWork = {
  id: string;
  title?: string;
  prompt: string;
  revised_prompt: string;
  image_url: string;
  width: number;
  height: number;
  file_size_bytes?: number;
  created_at: string;
  is_prompt_public?: boolean;
};

type ImageRequestOptions = {
  isPublic?: boolean;
  isPromptPublic?: boolean;
};

type LoginResponse = {
  ok: boolean;
  version: string;
  role: AuthRole;
  subject_id: string;
  name: string;
  scope?: string;
  quota_limit?: number;
  quota_used?: number;
  quota_remaining?: number;
  quota_mode?: ImageLinkQuotaMode;
  public_free_limit?: number;
  public_free_used?: number;
  public_free_remaining?: number;
  quota_reset_date?: string;
  expires_at?: string | null;
};

export type Account = {
  id: string;
  access_token: string;
  type: AccountType;
  status: AccountStatus;
  quota: number;
  imageQuotaUnknown?: boolean;
  email?: string | null;
  user_id?: string | null;
  limits_progress?: Array<{
    feature_name?: string;
    remaining?: number;
    reset_after?: string;
  }>;
  default_model_slug?: string | null;
  restoreAt?: string | null;
  success: number;
  fail: number;
  lastUsedAt: string | null;
};

type AccountListResponse = {
  items: Account[];
};

type AccountMutationResponse = {
  items: Account[];
  added?: number;
  skipped?: number;
  removed?: number;
  refreshed?: number;
  errors?: Array<{ access_token: string; error: string }>;
};

type AccountRefreshResponse = {
  items: Account[];
  refreshed: number;
  errors: Array<{ access_token: string; error: string }>;
};

type AccountUpdateResponse = {
  item: Account;
  items: Account[];
};

export type SettingsConfig = {
  proxy: string;
  base_url?: string;
  refresh_account_interval_minute?: number | string;
  [key: string]: unknown;
};

export type UserKey = {
  id: string;
  name: string;
  role: "user";
  enabled: boolean;
  created_at: string | null;
  last_used_at: string | null;
};

export type ImageLink = {
  id: string;
  name: string;
  role: "user";
  scope: "image_link";
  enabled: boolean;
  quota_limit: number;
  quota_used: number;
  quota_remaining: number;
  quota_mode: ImageLinkQuotaMode;
  concurrency_limit: number;
  public_free_limit: number;
  public_free_used: number;
  public_free_remaining: number;
  quota_reset_date?: string | null;
  expires_at: string | null;
  key?: string | null;
  created_by?: string | null;
  created_at: string | null;
  last_used_at: string | null;
};

export type ImageResponseItem = {
  b64_json: string;
  revised_prompt?: string;
  title?: string;
};

export type ImageResponse = {
  created: number;
  data: ImageResponseItem[];
};

export type ImageQueueResponse = {
  queued: true;
  ticket_id: string;
  status: "queued" | "running";
  position: number;
  created_at: string;
  updated_at: string;
};

export type ImageQueueStatus = {
  ticket_id: string;
  status: "queued" | "running" | "completed" | "error";
  position: number;
  created_at: string;
  updated_at: string;
  result?: ImageResponse;
  error?: string;
};

export async function login(authKey: string) {
  const normalizedAuthKey = String(authKey || "").trim();
  return httpRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: {},
    headers: {
      Authorization: `Bearer ${normalizedAuthKey}`,
    },
    redirectOnUnauthorized: false,
  });
}

export async function fetchAccounts() {
  return httpRequest<AccountListResponse>("/api/accounts");
}

export async function createAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "POST",
    body: { tokens },
  });
}

export async function deleteAccounts(tokens: string[]) {
  return httpRequest<AccountMutationResponse>("/api/accounts", {
    method: "DELETE",
    body: { tokens },
  });
}

export async function refreshAccounts(accessTokens: string[]) {
  return httpRequest<AccountRefreshResponse>("/api/accounts/refresh", {
    method: "POST",
    body: { access_tokens: accessTokens },
  });
}

export async function updateAccount(
  accessToken: string,
  updates: {
    type?: AccountType;
    status?: AccountStatus;
    quota?: number;
  },
) {
  return httpRequest<AccountUpdateResponse>("/api/accounts/update", {
    method: "POST",
    body: {
      access_token: accessToken,
      ...updates,
    },
  });
}

export async function generateImage(prompt: string, model?: ImageModel, size?: string, options: ImageRequestOptions = {}) {
  return httpRequest<ImageResponse | ImageQueueResponse>(
    "/v1/images/generations",
    {
      method: "POST",
      body: {
        prompt,
        ...(model ? { model } : {}),
        ...(size ? { size } : {}),
        ...(options.isPublic ? { is_public: true } : {}),
        ...(options.isPromptPublic ? { is_prompt_public: true } : {}),
        n: 1,
        response_format: "b64_json",
      },
    },
  );
}

export async function editImage(files: File | File[], prompt: string, model?: ImageModel, size?: string, options: ImageRequestOptions = {}) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (size) {
    formData.append("size", size);
  }
  if (options.isPublic) {
    formData.append("is_public", "true");
  }
  if (options.isPromptPublic) {
    formData.append("is_prompt_public", "true");
  }
  formData.append("n", "1");

  return httpRequest<ImageResponse | ImageQueueResponse>(
    "/v1/images/edits",
    {
      method: "POST",
      body: formData,
    },
  );
}


export async function fetchImageQueueStatus(ticketId: string) {
  return httpRequest<ImageQueueStatus>(`/api/image-queue/${encodeURIComponent(ticketId)}`);
}

export async function fetchPublicWorks(limit = 60, options: { redirectOnUnauthorized?: boolean } = {}) {
  const search = new URLSearchParams({ limit: String(limit) });
  return httpRequest<{ items: PublicWork[] }>(`/api/public-works?${search.toString()}`, {
    redirectOnUnauthorized: options.redirectOnUnauthorized ?? false,
  });
}

export async function fetchPublicWorkById(workId: string, options: { redirectOnUnauthorized?: boolean } = {}) {
  return httpRequest<{ item: PublicWork }>(`/api/public-works/${workId}`, {
    redirectOnUnauthorized: options.redirectOnUnauthorized ?? false,
  });
}

export async function deletePublicWork(workId: string) {
  return httpRequest<{ ok: boolean }>(`/api/public-works/${workId}`, {
    method: "DELETE",
  });
}

export async function fetchSettingsConfig() {
  return httpRequest<{ config: SettingsConfig }>("/api/settings");
}

export async function updateSettingsConfig(settings: SettingsConfig) {
  return httpRequest<{ config: SettingsConfig }>("/api/settings", {
    method: "POST",
    body: settings,
  });
}

export async function fetchUserKeys() {
  return httpRequest<{ items: UserKey[] }>("/api/auth/users");
}

export async function createUserKey(name: string) {
  return httpRequest<{ item: UserKey; key: string; items: UserKey[] }>("/api/auth/users", {
    method: "POST",
    body: { name },
  });
}

export async function updateUserKey(keyId: string, updates: { enabled?: boolean; name?: string }) {
  return httpRequest<{ item: UserKey; items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteUserKey(keyId: string) {
  return httpRequest<{ items: UserKey[] }>(`/api/auth/users/${keyId}`, {
    method: "DELETE",
  });
}

export async function fetchImageLinks() {
  return httpRequest<{ items: ImageLink[] }>("/api/auth/image-links");
}

export async function createImageLink(payload: {
  name?: string;
  quota_limit: number;
  quota_mode?: ImageLinkQuotaMode;
  public_free_limit?: number;
  concurrency_limit?: number;
  expires_at?: string | null;
  count?: number;
}) {
  return httpRequest<{ item: ImageLink; items: ImageLink[]; created: ImageLink[] }>("/api/auth/image-links", {
    method: "POST",
    body: payload,
  });
}

export async function updateImageLink(
  keyId: string,
  updates: {
    enabled?: boolean;
    name?: string;
    quota_limit?: number;
    quota_used?: number;
    quota_mode?: ImageLinkQuotaMode;
    public_free_limit?: number;
    public_free_used?: number;
    concurrency_limit?: number;
    expires_at?: string | null;
  },
) {
  return httpRequest<{ item: ImageLink; items: ImageLink[] }>(`/api/auth/image-links/${keyId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteImageLink(keyId: string) {
  return httpRequest<{ items: ImageLink[] }>(`/api/auth/image-links/${keyId}`, {
    method: "DELETE",
  });
}

// ── CPA (CLIProxyAPI) ──────────────────────────────────────────────

export type CPAPool = {
  id: string;
  name: string;
  base_url: string;
  import_job?: CPAImportJob | null;
};

export type CPARemoteFile = {
  name: string;
  email: string;
};

export type CPAImportJob = {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  total: number;
  completed: number;
  added: number;
  skipped: number;
  refreshed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
};

export async function fetchCPAPools() {
  return httpRequest<{ pools: CPAPool[] }>("/api/cpa/pools");
}

export async function createCPAPool(pool: { name: string; base_url: string; secret_key: string }) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>("/api/cpa/pools", {
    method: "POST",
    body: pool,
  });
}

export async function updateCPAPool(
  poolId: string,
  updates: { name?: string; base_url?: string; secret_key?: string },
) {
  return httpRequest<{ pool: CPAPool; pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "POST",
    body: updates,
  });
}

export async function deleteCPAPool(poolId: string) {
  return httpRequest<{ pools: CPAPool[] }>(`/api/cpa/pools/${poolId}`, {
    method: "DELETE",
  });
}

export async function fetchCPAPoolFiles(poolId: string) {
  return httpRequest<{ pool_id: string; files: CPARemoteFile[] }>(`/api/cpa/pools/${poolId}/files`);
}

export async function startCPAImport(poolId: string, names: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`, {
    method: "POST",
    body: { names },
  });
}

export async function fetchCPAPoolImportJob(poolId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/cpa/pools/${poolId}/import`);
}

// ── Sub2API ────────────────────────────────────────────────────────

export type Sub2APIServer = {
  id: string;
  name: string;
  base_url: string;
  email: string;
  has_api_key: boolean;
  group_id: string;
  import_job?: CPAImportJob | null;
};

export type Sub2APIRemoteAccount = {
  id: string;
  name: string;
  email: string;
  plan_type: string;
  status: string;
  expires_at: string;
  has_refresh_token: boolean;
};

export type Sub2APIRemoteGroup = {
  id: string;
  name: string;
  description: string;
  platform: string;
  status: string;
  account_count: number;
  active_account_count: number;
};

export async function fetchSub2APIServers() {
  return httpRequest<{ servers: Sub2APIServer[] }>("/api/sub2api/servers");
}

export async function createSub2APIServer(server: {
  name: string;
  base_url: string;
  email: string;
  password: string;
  api_key: string;
  group_id: string;
}) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>("/api/sub2api/servers", {
    method: "POST",
    body: server,
  });
}

export async function updateSub2APIServer(
  serverId: string,
  updates: {
    name?: string;
    base_url?: string;
    email?: string;
    password?: string;
    api_key?: string;
    group_id?: string;
  },
) {
  return httpRequest<{ server: Sub2APIServer; servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "POST",
    body: updates,
  });
}

export async function fetchSub2APIServerGroups(serverId: string) {
  return httpRequest<{ server_id: string; groups: Sub2APIRemoteGroup[] }>(
    `/api/sub2api/servers/${serverId}/groups`,
  );
}

export async function deleteSub2APIServer(serverId: string) {
  return httpRequest<{ servers: Sub2APIServer[] }>(`/api/sub2api/servers/${serverId}`, {
    method: "DELETE",
  });
}

export async function fetchSub2APIServerAccounts(serverId: string) {
  return httpRequest<{ server_id: string; accounts: Sub2APIRemoteAccount[] }>(
    `/api/sub2api/servers/${serverId}/accounts`,
  );
}

export async function startSub2APIImport(serverId: string, accountIds: string[]) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`, {
    method: "POST",
    body: { account_ids: accountIds },
  });
}

export async function fetchSub2APIImportJob(serverId: string) {
  return httpRequest<{ import_job: CPAImportJob | null }>(`/api/sub2api/servers/${serverId}/import`);
}

// ── Upstream proxy ────────────────────────────────────────────────

export type ProxySettings = {
  enabled: boolean;
  url: string;
};

export type ProxyTestResult = {
  ok: boolean;
  status: number;
  latency_ms: number;
  error: string | null;
};

export async function fetchProxy() {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy");
}

export async function updateProxy(updates: { enabled?: boolean; url?: string }) {
  return httpRequest<{ proxy: ProxySettings }>("/api/proxy", {
    method: "POST",
    body: updates,
  });
}

export async function testProxy(url?: string) {
  return httpRequest<{ result: ProxyTestResult }>("/api/proxy/test", {
    method: "POST",
    body: { url: url ?? "" },
  });
}
