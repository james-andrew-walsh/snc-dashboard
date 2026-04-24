// run-reconciliation — Supabase Edge Function
//
// For a given report date:
//   1. Loads the dispatch report + its equipment assignments from Supabase.
//   2. Authenticates with HCSS HeavyJob and JD Link.
//   3. For each job: resolves the HCSS job UUID, pulls that day's timecards,
//      and sums billed hours per equipment.
//   4. For each equipment: looks up the JD Link principalId, fetches engine
//      hour readings for the PDT day, and classifies the result.
//   5. Replaces reconciliation_results for this report and flips the report
//      status to 'reconciled'.
//
// Invocation: POST { "reportDate": "2026-04-17" }
//
// Idempotent: re-running produces the same rows (given the same external
// state), because existing reconciliation_results for the report are deleted
// before insertion.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  foremanDisplay,
  getHcssJobs,
  getHcssTimecardDetail,
  getHcssTimecardsForJobOnDate,
  getHcssToken,
  isEquipmentCode,
  sumBilledHours,
  type HcssTimecardDetail,
} from './hcss.ts';
import {
  getEngineHoursForDate,
  getJdlinkAccessToken,
  loadJdlinkMachines,
} from './jdlink.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  });
}

interface DispatchEquipmentRow {
  id: string;
  job_id: string;
  foreman_code: string | null;
  equipment_code: string;
  description: string | null;
  alt_code: string | null;
  sched_start: string | null;
  sched_end: string | null;
}

interface DispatchJobRow {
  id: string;
  job_code: string;
  job_name: string;
}

interface DispatchForemanRow {
  id: string;
  job_id: string;
  foreman_code: string;
  foreman_name: string;
}

interface ReconResultInsert {
  report_id: string;
  job_id: string;
  foreman_id: string | null;
  foreman_code: string | null;
  equipment_code: string;
  description: string | null;
  alt_code: string | null;
  provider: string | null;
  sched_hours: number | null;
  billed_hours: number | null;
  actual_hours: number | null;
  variance: number | null;
  status: string;
  reading_count: number | null;
  notes: string | null;
}

function schedHours(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.round(((e - s) / 3_600_000) * 100) / 100;
}

async function reconcile(reportDate: string) {
  // ── Load report + dispatch rows ────────────────────────────────────────
  const { data: reportRow, error: repErr } = await supa
    .from('dispatch_reports')
    .select('id, status')
    .eq('report_date', reportDate)
    .maybeSingle();
  if (repErr) throw new Error(`load dispatch_reports failed: ${repErr.message}`);
  if (!reportRow) throw new Error(`no dispatch_reports row for ${reportDate}`);
  const reportId = (reportRow as { id: string }).id;

  const { data: jobRows, error: jobErr } = await supa
    .from('dispatch_jobs')
    .select('id, job_code, job_name')
    .eq('report_id', reportId);
  if (jobErr) throw new Error(`load dispatch_jobs failed: ${jobErr.message}`);
  const jobsById = new Map<string, DispatchJobRow>();
  for (const j of (jobRows ?? []) as DispatchJobRow[]) jobsById.set(j.id, j);

  const { data: foremanRows, error: fErr } = await supa
    .from('dispatch_foremen')
    .select('id, job_id, foreman_code, foreman_name')
    .eq('report_id', reportId);
  if (fErr) throw new Error(`load dispatch_foremen failed: ${fErr.message}`);
  const foremanIdByJobCode = new Map<string, string>();
  for (const f of (foremanRows ?? []) as DispatchForemanRow[]) {
    foremanIdByJobCode.set(`${f.job_id}::${f.foreman_code.trim()}`, f.id);
  }

  const { data: eqRows, error: eqErr } = await supa
    .from('dispatch_equipment_assignments')
    .select('id, job_id, foreman_code, equipment_code, description, alt_code, sched_start, sched_end')
    .eq('report_id', reportId);
  if (eqErr) throw new Error(`load dispatch_equipment_assignments failed: ${eqErr.message}`);
  const dispatchByJob = new Map<string, DispatchEquipmentRow[]>();
  for (const row of (eqRows ?? []) as DispatchEquipmentRow[]) {
    if (!dispatchByJob.has(row.job_id)) dispatchByJob.set(row.job_id, []);
    dispatchByJob.get(row.job_id)!.push(row);
  }

  // ── Auth ───────────────────────────────────────────────────────────────
  const hcssClientId = Deno.env.get('HCSS_CLIENT_ID');
  const hcssClientSecret = Deno.env.get('HCSS_CLIENT_SECRET');
  const hcssBuId = Deno.env.get('HCSS_BU_ID');
  if (!hcssClientId || !hcssClientSecret || !hcssBuId) {
    throw new Error('Missing HCSS_CLIENT_ID / HCSS_CLIENT_SECRET / HCSS_BU_ID');
  }

  const jdClientId = Deno.env.get('JDLINK_CLIENT_ID') ?? Deno.env.get('JDLINK_APP_ID');
  const jdClientSecret = Deno.env.get('JDLINK_CLIENT_SECRET') ?? Deno.env.get('JDLINK_SECRET');
  const jdOrgId = Deno.env.get('JDLINK_ORG_ID');
  const jdSeedRefresh = Deno.env.get('JDLINK_REFRESH_TOKEN');
  if (!jdClientId || !jdClientSecret || !jdOrgId || !jdSeedRefresh) {
    throw new Error('Missing JDLINK_CLIENT_ID / JDLINK_CLIENT_SECRET / JDLINK_ORG_ID / JDLINK_REFRESH_TOKEN');
  }

  const [hcssToken, jdToken] = await Promise.all([
    getHcssToken(hcssClientId, hcssClientSecret),
    getJdlinkAccessToken(supa, jdClientId, jdClientSecret, jdSeedRefresh),
  ]);

  // ── Bulk lookups (one fetch per run) ───────────────────────────────────
  const [hcssJobs, jdMachines] = await Promise.all([
    getHcssJobs(hcssBuId, hcssToken),
    loadJdlinkMachines(jdOrgId, jdToken),
  ]);
  const hcssJobByCode = new Map<string, string>();
  for (const j of hcssJobs) {
    if (j.code) hcssJobByCode.set(String(j.code).trim(), j.id);
  }

  // ── Per-equipment reconciliation ───────────────────────────────────────
  const inserts: ReconResultInsert[] = [];
  // Cache engine-hours results by principalId — the same equipment may appear
  // on multiple jobs/timecards in a single report.
  const engineHoursCache = new Map<number, { deltaHours: number; readingCount: number }>();

  for (const [jobId, dispatchEquipment] of dispatchByJob) {
    const job = jobsById.get(jobId);
    if (!job) continue;

    const jobUuid = hcssJobByCode.get(job.job_code.trim()) ?? null;

    if (!jobUuid) {
      // HCSS doesn't know about this job — mark everything skipped.
      for (const eq of dispatchEquipment) {
        inserts.push(makeRow(reportId, job, eq, foremanIdByJobCode, {
          billed: null, actual: null, readingCount: null,
          status: 'skipped', notes: 'no HeavyJob job match',
          provider: jdMachines.has(eq.equipment_code) ? 'JDLink' : null,
        }));
      }
      continue;
    }

    const timecards = await getHcssTimecardsForJobOnDate(jobUuid, reportDate, hcssToken);
    const details: HcssTimecardDetail[] = [];
    for (const tc of timecards) {
      details.push(await getHcssTimecardDetail(tc.id, hcssToken));
    }

    // Build maps across all timecards for this job:
    //   billed: eq_code -> summed hours
    //   foremanByEq: eq_code -> display label + code (from the first tc it
    //     appears on — HCSS usually has one foreman per equipment per day)
    //   allTcEqCodes: everything billed on any timecard (for BILLED-NOT-
    //     DISPATCHED detection)
    const billedByEq = new Map<string, number>();
    const tcEqInfo = new Map<string, { description: string; foremanCode: string | null; foremanName: string | null }>();
    const allTcEqCodes = new Set<string>();
    for (const d of details) {
      const fd = foremanDisplay(d);
      for (const eq of d.equipment ?? []) {
        const code = (eq.equipmentCode ?? '').trim();
        if (!code || !isEquipmentCode(code)) continue;
        allTcEqCodes.add(code);
        const hrs = sumBilledHours(d, code);
        if (hrs != null) {
          billedByEq.set(code, (billedByEq.get(code) ?? 0) + hrs);
        }
        if (!tcEqInfo.has(code)) {
          tcEqInfo.set(code, {
            description: eq.equipmentDescription ?? '',
            foremanCode: fd.code,
            foremanName: fd.name,
          });
        }
      }
    }

    const dispatchEqCodes = new Set(dispatchEquipment.map(e => e.equipment_code.trim()));

    // Dispatch equipment rows.
    for (const eq of dispatchEquipment) {
      const code = eq.equipment_code.trim();
      const machine = jdMachines.get(code);
      const billed = billedByEq.get(code) ?? null;
      const provider = machine ? 'JDLink' : null;

      if (!machine) {
        inserts.push(makeRow(reportId, job, eq, foremanIdByJobCode, {
          billed, actual: null, readingCount: null,
          status: 'skipped', notes: 'no JD Link',
          provider: null,
        }));
        continue;
      }

      let engineHours = engineHoursCache.get(machine.principalId);
      if (!engineHours) {
        engineHours = await getEngineHoursForDate(machine.principalId, reportDate, jdToken);
        engineHoursCache.set(machine.principalId, engineHours);
      }
      const actual = engineHours.readingCount > 0
        ? Math.round(engineHours.deltaHours * 100) / 100
        : null;
      const readingCount = engineHours.readingCount;

      let status: string;
      let notes: string | null = null;
      let variance: number | null = null;

      if (readingCount === 0) {
        status = 'no-data';
        notes = 'no JD Link readings';
      } else if (billed == null) {
        status = 'skipped';
        notes = 'no HeavyJob billed hours';
      } else if (actual === 0 && billed > 0) {
        status = 'idle';
        variance = Math.round((billed - 0) * 100) / 100;
      } else if (Math.abs(billed - (actual ?? 0)) <= 0.5) {
        status = 'ok';
        variance = Math.round((billed - (actual ?? 0)) * 100) / 100;
      } else {
        variance = Math.round((billed - (actual ?? 0)) * 100) / 100;
        status = variance > 0 ? 'over' : 'under';
      }

      inserts.push(makeRow(reportId, job, eq, foremanIdByJobCode, {
        billed, actual, readingCount,
        status, notes, variance,
        provider,
      }));
    }

    // Timecard equipment not on the dispatch → billed-not-dispatched.
    for (const code of allTcEqCodes) {
      if (dispatchEqCodes.has(code)) continue;
      const info = tcEqInfo.get(code);
      const billed = billedByEq.get(code) ?? null;
      const machine = jdMachines.get(code);
      const foremanId = info?.foremanCode
        ? foremanIdByJobCode.get(`${jobId}::${info.foremanCode.trim()}`) ?? null
        : null;
      inserts.push({
        report_id: reportId,
        job_id: jobId,
        foreman_id: foremanId,
        foreman_code: info?.foremanCode ?? null,
        equipment_code: code,
        description: info?.description ?? null,
        alt_code: null,
        provider: machine ? 'JDLink' : null,
        sched_hours: null,
        billed_hours: billed,
        actual_hours: null,
        variance: null,
        status: 'billed-not-dispatched',
        reading_count: null,
        notes: 'on HeavyJob timecard but not dispatched',
      });
    }
  }

  // ── Replace prior results for this report ─────────────────────────────
  const { error: delErr } = await supa
    .from('reconciliation_results')
    .delete()
    .eq('report_id', reportId);
  if (delErr) throw new Error(`delete existing reconciliation_results failed: ${delErr.message}`);

  const CHUNK = 500;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const { error } = await supa.from('reconciliation_results').insert(chunk);
    if (error) throw new Error(`insert reconciliation_results failed: ${error.message}`);
  }

  const { error: upErr } = await supa
    .from('dispatch_reports')
    .update({ status: 'reconciled', updated_at: new Date().toISOString() })
    .eq('id', reportId);
  if (upErr) throw new Error(`update dispatch_reports status failed: ${upErr.message}`);

  // Summary counts.
  const counts = inserts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    reportDate,
    reportId,
    inserted: inserts.length,
    counts,
  };
}

function makeRow(
  reportId: string,
  job: DispatchJobRow,
  eq: DispatchEquipmentRow,
  foremanIdByJobCode: Map<string, string>,
  r: {
    billed: number | null;
    actual: number | null;
    readingCount: number | null;
    status: string;
    notes: string | null;
    variance?: number | null;
    provider: string | null;
  },
): ReconResultInsert {
  const foremanId = eq.foreman_code
    ? foremanIdByJobCode.get(`${eq.job_id}::${eq.foreman_code.trim()}`) ?? null
    : null;
  const variance =
    r.variance != null ? r.variance
    : r.billed != null && r.actual != null ? Math.round((r.billed - r.actual) * 100) / 100
    : null;
  return {
    report_id: reportId,
    job_id: job.id,
    foreman_id: foremanId,
    foreman_code: eq.foreman_code,
    equipment_code: eq.equipment_code,
    description: eq.description,
    alt_code: eq.alt_code,
    provider: r.provider,
    sched_hours: schedHours(eq.sched_start, eq.sched_end),
    billed_hours: r.billed,
    actual_hours: r.actual,
    variance,
    status: r.status,
    reading_count: r.readingCount,
    notes: r.notes,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
        'access-control-allow-methods': 'POST, GET, OPTIONS',
      },
    });
  }

  try {
    let body: { reportDate?: string } = {};
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.trim()) {
        try { body = JSON.parse(text); } catch {
          return jsonResponse({ error: 'invalid JSON body' }, 400);
        }
      }
    }
    const reportDate = body.reportDate;
    if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      return jsonResponse({ error: 'reportDate (YYYY-MM-DD) required' }, 400);
    }

    const result = await reconcile(reportDate);
    return jsonResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[run-reconciliation] error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
