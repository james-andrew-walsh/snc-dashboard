// HCSS HeavyJob API client.
//
// OAuth2 client_credentials grant + the three endpoints we use during a
// reconciliation run: jobs list (by business unit), timecard summaries
// (filtered to a date by the caller), and full timecard detail.

const HCSS_TOKEN_URL = 'https://api.hcssapps.com/identity/connect/token';
const HCSS_BASE = 'https://api.hcssapps.com/heavyjob/api/v1';

// The HCSS gateway rejects requests without a User-Agent, and has historically
// been picky about the value — this exact string is what works in production.
const USER_AGENT = 'SNC-Equipment-Tracking/1.0';

function baseHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
}

// Retry wrapper for transient 502/503 errors from HCSS load balancer.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, init);
    if (resp.ok || (resp.status !== 502 && resp.status !== 503)) return resp;
    console.warn(`[${label}] attempt ${attempt}/${maxRetries} got ${resp.status}, retrying...`);
    if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000 * attempt));
    else return resp; // return the last failed response
  }
  throw new Error('unreachable');
}

export async function getHcssToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const basic = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'heavyjob:read timecards:read',
  });
  const resp = await fetch(HCSS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HCSS token request failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const json = await resp.json();
  if (!json.access_token) throw new Error('HCSS token response missing access_token');
  return json.access_token as string;
}

export interface HcssJob {
  id: string;
  code: string;
  description?: string;
}

export async function getHcssJobs(buId: string, token: string): Promise<HcssJob[]> {
  const url = `${HCSS_BASE}/jobs?businessUnitId=${encodeURIComponent(buId)}&$top=9999`;
  const resp = await fetchWithRetry(url, { headers: baseHeaders(token) }, 'HCSS jobs');
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HCSS jobs failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  // Endpoint returns a raw array, not wrapped in {results}.
  if (!Array.isArray(data)) return [];
  return data as HcssJob[];
}

export interface HcssTimecardSummary {
  id: string;
  date: string;
  revision?: number;
}

export async function getHcssTimecardsForJobOnDate(
  jobUuid: string,
  date: string,
  token: string,
): Promise<HcssTimecardSummary[]> {
  const url = `${HCSS_BASE}/timeCardInfo?jobId=${encodeURIComponent(jobUuid)}`;
  const resp = await fetchWithRetry(url, { headers: baseHeaders(token) }, 'HCSS timeCardInfo');
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HCSS timeCardInfo failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const results: HcssTimecardSummary[] = Array.isArray(data?.results) ? data.results : [];
  return results.filter(tc => typeof tc.date === 'string' && tc.date.startsWith(date));
}

export interface HcssTimecardEquipment {
  equipmentCode: string;
  equipmentDescription?: string;
  totalHours?: Array<{ hours: number | string }>;
}

export interface HcssEmployee {
  employeeId?: string;
  employeeCode?: string;
  employeeDescription?: string;
}

export interface HcssTimecardDetail {
  id: string;
  foremanId?: string;
  foremanCode?: string;
  foremanDescription?: string;
  equipment?: HcssTimecardEquipment[];
  employees?: HcssEmployee[];
}

export async function getHcssTimecardDetail(
  timecardId: string,
  token: string,
): Promise<HcssTimecardDetail> {
  const url = `${HCSS_BASE}/timecards/${encodeURIComponent(timecardId)}`;
  const resp = await fetchWithRetry(url, { headers: baseHeaders(token) }, 'HCSS timecard detail');
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HCSS timecard detail failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as HcssTimecardDetail;
}

// Sum the totalHours[].hours entries for one equipment on a detail payload.
export function sumBilledHours(detail: HcssTimecardDetail, equipmentCode: string): number | null {
  let total = 0;
  let found = false;
  const target = equipmentCode.trim();
  for (const eq of detail.equipment ?? []) {
    if ((eq.equipmentCode ?? '').trim() !== target) continue;
    found = true;
    for (const h of eq.totalHours ?? []) {
      const n = typeof h.hours === 'number' ? h.hours : parseFloat(String(h.hours ?? '0'));
      if (!Number.isNaN(n)) total += n;
    }
  }
  if (!found) return null;
  return total > 0 ? total : null;
}

// Equipment codes are either all digits ("9830") or "R" + digits ("R21089").
// Anything else is a personnel code (e.g. "ACTROB", "JAUJOR) and should be
// excluded from the reconciliation equipment set.
export function isEquipmentCode(code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  if (/^\d/.test(c)) return true;
  if (/^R\d/.test(c)) return true;
  return false;
}

// Pick a human-readable foreman label from a timecard detail, matching the
// Python implementation's strategy (top-level fields → employees lookup →
// truncated foremanId).
export function foremanDisplay(detail: HcssTimecardDetail): {
  code: string | null;
  name: string | null;
  display: string;
} {
  const code = (detail.foremanCode ?? '').trim();
  const desc = (detail.foremanDescription ?? '').trim();
  if (code && desc) return { code, name: desc, display: `${desc} (${code})` };
  if (code) return { code, name: null, display: code };

  const fid = detail.foremanId ?? '';
  if (fid) {
    for (const emp of detail.employees ?? []) {
      if ((emp.employeeId ?? '') === fid) {
        const eCode = (emp.employeeCode ?? '').trim();
        const eDesc = (emp.employeeDescription ?? '').trim();
        if (eDesc && eCode) return { code: eCode, name: eDesc, display: `${eDesc} (${eCode})` };
        if (eDesc) return { code: null, name: eDesc, display: eDesc };
        if (eCode) return { code: eCode, name: null, display: eCode };
      }
    }
    return { code: null, name: null, display: fid.slice(0, 8) };
  }
  return { code: null, name: null, display: '?' };
}
