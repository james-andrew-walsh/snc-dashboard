// dispatch-extract — Supabase Edge Function
//
// Downloads a dispatch PDF from the `dispatcher_reports` storage bucket, extracts
// text with pdf-parse, parses it into jobs/foremen/equipment, and writes the
// result into the dispatch_* tables. Idempotent: re-running on the same PDF
// produces identical rows.
//
// Invocation modes:
//   POST {} or GET          → scan bucket, process every PDF that isn't yet
//                             linked to an `extracted` report.
//   POST { filename: "X" }  → process just that file.

import { createClient } from 'npm:@supabase/supabase-js@2';
// deno-types path for pdf-parse; the default export is the parser fn.
// @ts-ignore — pdf-parse ships CJS, Deno runs it via npm compat.
import pdfParse from 'npm:pdf-parse@1.1.1/lib/pdf-parse.js';

import { parseDispatchText, type ParsedReport } from './parser.ts';

const BUCKET = 'dispatcher_reports';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type FileProcessResult = {
  filename: string;
  reportDate?: string;
  reportId?: string;
  jobCount?: number;
  foremenCount?: number;
  equipmentCount?: number;
  operatorCount?: number;
  laborerCount?: number;
  status: 'extracted' | 'error' | 'skipped';
  error?: string;
};

async function downloadPdf(filename: string): Promise<Uint8Array> {
  const { data, error } = await supa.storage.from(BUCKET).download(filename);
  if (error || !data) throw new Error(`storage download failed: ${error?.message ?? 'no data'}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function listBucketPdfs(): Promise<string[]> {
  const { data, error } = await supa.storage.from(BUCKET).list('', {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw new Error(`storage list failed: ${error.message}`);
  return (data ?? []).filter((o) => /\.pdf$/i.test(o.name)).map((o) => o.name);
}

async function writeReport(
  parsed: ParsedReport,
  filename: string,
): Promise<FileProcessResult> {
  const pdfPath = `${BUCKET}/${filename}`;

  // Upsert dispatch_reports row by report_date (unique).
  const { data: reportRow, error: repErr } = await supa
    .from('dispatch_reports')
    .upsert(
      {
        report_date: parsed.reportDate,
        source_file: filename,
        pdf_path: pdfPath,
        status: 'extracted',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'report_date' },
    )
    .select('id')
    .single();

  if (repErr || !reportRow) {
    throw new Error(`upsert dispatch_reports failed: ${repErr?.message}`);
  }
  const reportId = reportRow.id as string;

  // Clear existing children for this report (these don't cascade to
  // reconciliation_results, which is owned by the reconciliation step).
  for (const table of [
    'dispatch_foremen',
    'dispatch_operators',
    'dispatch_laborers',
    'dispatch_equipment_assignments',
  ]) {
    const { error } = await supa.from(table).delete().eq('report_id', reportId);
    if (error) throw new Error(`delete ${table} failed: ${error.message}`);
  }

  // Upsert dispatch_jobs, preserving existing ids (so reconciliation_results
  // referencing these jobs stay valid).
  const jobRows = parsed.jobs.map((j) => ({
    report_id: reportId,
    job_code: j.jobCode,
    job_name: j.jobName,
    daily_notes: j.dailyNotes || null,
    updated_at: new Date().toISOString(),
  }));

  const { data: upsertedJobs, error: jobErr } = await supa
    .from('dispatch_jobs')
    .upsert(jobRows, { onConflict: 'report_id,job_code' })
    .select('id,job_code');

  if (jobErr || !upsertedJobs) {
    throw new Error(`upsert dispatch_jobs failed: ${jobErr?.message}`);
  }

  const jobIdByCode = new Map<string, string>();
  for (const j of upsertedJobs) jobIdByCode.set(j.job_code as string, j.id as string);

  // Drop any dispatch_jobs in this report that are no longer in the parse.
  // Cascades to reconciliation_results for those removed jobs — which is
  // correct, since those results no longer reference a valid job.
  const currentCodes = new Set(parsed.jobs.map((j) => j.jobCode));
  const { data: allReportJobs } = await supa
    .from('dispatch_jobs')
    .select('id,job_code')
    .eq('report_id', reportId);
  if (allReportJobs) {
    const staleIds = allReportJobs
      .filter((j) => !currentCodes.has(j.job_code as string))
      .map((j) => j.id as string);
    if (staleIds.length > 0) {
      const { error } = await supa.from('dispatch_jobs').delete().in('id', staleIds);
      if (error) throw new Error(`delete stale dispatch_jobs failed: ${error.message}`);
    }
  }

  // Build child rows.
  const foremenRows: Record<string, unknown>[] = [];
  const equipmentRows: Record<string, unknown>[] = [];
  const operatorRows: Record<string, unknown>[] = [];
  const laborerRows: Record<string, unknown>[] = [];

  for (const job of parsed.jobs) {
    const jobId = jobIdByCode.get(job.jobCode);
    if (!jobId) continue;

    for (const f of job.foremen) {
      foremenRows.push({
        report_id: reportId,
        job_id: jobId,
        foreman_code: f.code,
        foreman_name: f.name,
      });
    }

    for (const item of job.items) {
      if (item.kind === 'equipment') {
        equipmentRows.push({
          report_id: reportId,
          job_id: jobId,
          foreman_code: item.foremanCode,
          equipment_code: item.equipmentCode,
          description: item.description,
          alt_code: item.altCode,
          sched_start: item.schedStart,
          sched_end: item.schedEnd,
        });
      } else if (item.kind === 'operator') {
        operatorRows.push({
          report_id: reportId,
          job_id: jobId,
          operator_code: item.code,
          operator_name: item.name,
        });
      } else {
        laborerRows.push({
          report_id: reportId,
          job_id: jobId,
          laborer_code: item.code,
          laborer_name: item.name,
        });
      }
    }
  }

  // Chunked insert helper — avoid 1MB body cap.
  const insertChunked = async (table: string, rows: Record<string, unknown>[]) => {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supa.from(table).insert(chunk);
      if (error) throw new Error(`insert ${table} failed: ${error.message}`);
    }
  };

  await insertChunked('dispatch_foremen', foremenRows);
  await insertChunked('dispatch_equipment_assignments', equipmentRows);
  await insertChunked('dispatch_operators', operatorRows);
  await insertChunked('dispatch_laborers', laborerRows);

  return {
    filename,
    reportDate: parsed.reportDate,
    reportId,
    jobCount: parsed.jobs.length,
    foremenCount: foremenRows.length,
    equipmentCount: equipmentRows.length,
    operatorCount: operatorRows.length,
    laborerCount: laborerRows.length,
    status: 'extracted',
  };
}

async function processOne(filename: string): Promise<FileProcessResult> {
  try {
    const bytes = await downloadPdf(filename);
    // pdf-parse accepts a Buffer; Deno's Node compat gives us Buffer from Uint8Array.
    const { Buffer } = await import('node:buffer');
    const result = await pdfParse(Buffer.from(bytes));
    const parsed = parseDispatchText(result.text);
    return await writeReport(parsed, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { filename, status: 'error', error: message };
  }
}

async function processAllUnprocessed(): Promise<FileProcessResult[]> {
  const filenames = await listBucketPdfs();
  const results: FileProcessResult[] = [];
  for (const filename of filenames) {
    results.push(await processOne(filename));
  }
  return results;
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
    let body: { filename?: string } = {};
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          return jsonResponse({ error: 'invalid JSON body' }, 400);
        }
      }
    }

    if (body.filename) {
      const result = await processOne(body.filename);
      return jsonResponse({ mode: 'single', results: [result] });
    }

    const results = await processAllUnprocessed();
    return jsonResponse({ mode: 'scan', count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
