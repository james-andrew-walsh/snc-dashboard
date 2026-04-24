// JD Link (John Deere Operations Center) API client.
//
// OAuth2 refresh_token grant + two data endpoints: organization equipment
// (builds the equipment-code → principalId map) and per-machine engine hour
// readings.
//
// IMPORTANT: JD's refresh tokens rotate on every use. The caller must persist
// the new refresh token back to the `key_value_store` row between runs or the
// next run will fail auth.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const JD_TOKEN_URL =
  'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/v1/token';

// Engine hours live on the sandbox host in production (this is JD Link's
// documented layout — "sandbox" here is the name, not the environment).
const JD_API_BASE = 'https://sandboxapi.deere.com';
// Equipment lookup is served from the main host.
const JD_ISG_BASE = 'https://api.deere.com';

const REFRESH_TOKEN_KEY = 'jdlink_refresh_token';

// PDT is UTC-7. All report dates in this system are Pacific calendar dates.
const PDT_OFFSET_HOURS = 7;

export interface JdLinkMachine {
  principalId: number;
  serialNumber: string;
  nickname: string;
}

// Reads the current refresh token, preferring the rotated value in
// key_value_store if present, else falling back to the Supabase secret seeded
// at deploy time.
export async function getJdlinkAccessToken(
  supa: SupabaseClient,
  clientId: string,
  clientSecret: string,
  seedRefreshToken: string,
): Promise<string> {
  const stored = await readStoredRefreshToken(supa);
  const refreshToken = stored ?? seedRefreshToken;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scope: 'eq1 offline_access',
  });
  const resp = await fetch(JD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`JD Link token request failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const json = await resp.json();
  if (!json.access_token) throw new Error('JD Link token response missing access_token');
  if (!json.refresh_token) throw new Error('JD Link token response missing refresh_token');

  // Persist the rotated refresh token so the next run doesn't 401.
  await writeStoredRefreshToken(supa, json.refresh_token as string);

  return json.access_token as string;
}

async function readStoredRefreshToken(supa: SupabaseClient): Promise<string | null> {
  const { data, error } = await supa
    .from('key_value_store')
    .select('value')
    .eq('key', REFRESH_TOKEN_KEY)
    .maybeSingle();
  if (error) {
    // Missing table or RLS block — fall back to the env seed and keep going.
    return null;
  }
  if (!data) return null;
  const value = (data as { value: string | null }).value;
  return value && value.length > 0 ? value : null;
}

async function writeStoredRefreshToken(supa: SupabaseClient, token: string): Promise<void> {
  const { error } = await supa
    .from('key_value_store')
    .upsert(
      { key: REFRESH_TOKEN_KEY, value: token, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  if (error) throw new Error(`failed to persist rotated JD Link refresh token: ${error.message}`);
}

// Fetches the JD Link organization's machines once per run.
export async function loadJdlinkMachines(
  orgId: string,
  token: string,
): Promise<Map<string, JdLinkMachine>> {
  const url = `${JD_ISG_BASE}/isg/equipment?organizationIds=${encodeURIComponent(orgId)}&$top=500`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`JD Link equipment fetch failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const out = new Map<string, JdLinkMachine>();
  const values = Array.isArray(data?.values) ? data.values : [];
  for (const m of values) {
    const name = String(m?.name ?? '').trim();
    const pid = Number(m?.principalId);
    if (!name || !Number.isFinite(pid)) continue;
    out.set(name, {
      principalId: pid,
      serialNumber: String(m?.serialNumber ?? ''),
      nickname: name,
    });
  }
  return out;
}

// Midnight PDT → corresponding UTC ISO strings that JD Link accepts.
function utcWindowForPdtDate(date: string): { start: string; end: string } {
  const [y, m, d] = date.split('-').map(n => parseInt(n, 10));
  // midnight PDT == hh:00:00Z the same calendar day
  const startUtc = new Date(Date.UTC(y, m - 1, d, PDT_OFFSET_HOURS, 0, 0));
  // next-day midnight PDT minus 1 second
  const endUtc = new Date(Date.UTC(y, m - 1, d + 1, PDT_OFFSET_HOURS - 1, 59, 59));
  const fmt = (dt: Date) => dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { start: fmt(startUtc), end: fmt(endUtc) };
}

// Returns true if the UTC instant falls on the Pacific calendar day `date`
// (captures readings whose UTC day is the next calendar day but whose PDT
// time is still on the target day — e.g. 23:52 PDT Apr 17 = 06:52 UTC Apr 18).
function isOnPdtDate(utcIso: string, date: string): boolean {
  const dt = new Date(utcIso);
  if (Number.isNaN(dt.getTime())) return false;
  const pdtMs = dt.getTime() - PDT_OFFSET_HOURS * 3600 * 1000;
  const pdt = new Date(pdtMs);
  const y = pdt.getUTCFullYear();
  const m = String(pdt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(pdt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}` === date;
}

export interface EngineHoursResult {
  deltaHours: number;
  readingCount: number;
}

export async function getEngineHoursForDate(
  principalId: number,
  date: string,
  token: string,
): Promise<EngineHoursResult> {
  const { start, end } = utcWindowForPdtDate(date);
  let url: string | null = `${JD_API_BASE}/platform/machines/${principalId}/engineHours?startDate=${start}&endDate=${end}`;

  interface Reading { reportTime: string; reading: { valueAsDouble: number } }
  const all: Reading[] = [];

  // JD Link paginates at 10 readings per page — must follow nextPage links.
  let safety = 200;
  while (url && safety-- > 0) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`JD Link engineHours failed (${resp.status}): ${text.slice(0, 300)}`);
    }
    const data = await resp.json();
    const values: Reading[] = Array.isArray(data?.values) ? data.values : [];
    all.push(...values);

    const nextLink = Array.isArray(data?.links)
      ? data.links.find((l: { rel?: string }) => l?.rel === 'nextPage')
      : null;
    url = nextLink?.uri ?? null;
  }

  const filtered: number[] = [];
  for (const v of all) {
    const h = Number(v?.reading?.valueAsDouble);
    if (!Number.isFinite(h)) continue;
    // Drop anomalous near-zero readings — JD sometimes reports 0.00 during
    // sensor glitches even though the machine has thousands of cumulative hrs.
    if (h <= 1) continue;
    if (!isOnPdtDate(v.reportTime, date)) continue;
    filtered.push(h);
  }

  if (filtered.length === 0) return { deltaHours: 0, readingCount: 0 };
  const delta = Math.max(...filtered) - Math.min(...filtered);
  return { deltaHours: delta, readingCount: filtered.length };
}
