// Dispatch PDF text parser.
//
// Converts the raw text produced by `pdf-parse` on an SNC Daily Schedule Report
// into a structured representation: a report date and a list of jobs, each with
// foremen, equipment, operators, and laborers.
//
// The PDF is a deterministic database export — no AI inference needed.

export type EquipmentEntry = {
  kind: 'equipment';
  foremanCode: string | null;
  equipmentCode: string;
  description: string;
  typePrefix: string;
  altCode: string;
  schedStart: string;
  schedEnd: string;
};

export type PersonnelEntry = {
  kind: 'operator' | 'laborer';
  foremanCode: string | null;
  code: string;
  name: string;
  role: string;
  schedStart: string;
  schedEnd: string;
};

export type Foreman = {
  code: string;
  name: string;
  role: string;
  schedStart: string;
  schedEnd: string;
};

export type Job = {
  jobCode: string;
  jobName: string;
  dailyNotes: string;
  foremen: Foreman[];
  items: Array<EquipmentEntry | PersonnelEntry>;
};

export type ParsedReport = {
  reportDate: string; // YYYY-MM-DD
  jobs: Job[];
};

// Equipment type prefixes. Ordered longest-first so "AT-BK" matches before "AT",
// "ATTACH" before "AT", and "TKH" before "TK".
const EQUIPMENT_PREFIXES = [
  'AT-BK', 'AT-FK', 'AT-CP',
  'ATTACH',
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9',
  'TKH',
  'SUB',
  'BL', 'BX', 'DZ', 'EX', 'LD', 'MS', 'PV', 'RL', 'TK', 'TR',
  'AT',
];

const OPERATOR_ROLES = new Set(['OPERATOR', 'OE', 'OE-4MAN']);

// Status column values that pdf-parse concatenates onto the end of resource
// lines when present. In dispatched assignments the cell is blank and these
// don't appear.
const STATUS_SUFFIXES = ['DISPATCHED', 'AVAIL', 'DOWN', 'STAND'];

function stripStatus(s: string): { value: string; status: string | null } {
  const trimmed = s.replace(/\s+$/, '');
  for (const suf of STATUS_SUFFIXES) {
    if (trimmed.endsWith(suf)) {
      return { value: trimmed.slice(0, -suf.length).replace(/\s+$/, ''), status: suf };
    }
  }
  return { value: trimmed, status: null };
}

function splitEquipment(
  raw: string,
): { code: string; description: string; typePrefix: string } | null {
  // Find the earliest occurrence of any prefix followed by ", ".
  let best: { code: string; description: string; typePrefix: string } | null = null;
  for (const prefix of EQUIPMENT_PREFIXES) {
    const token = prefix + ',';
    let idx = raw.indexOf(token);
    while (idx !== -1) {
      if (idx >= 1) {
        if (!best || idx < best.code.length) {
          best = {
            code: raw.slice(0, idx),
            description: raw.slice(idx),
            typePrefix: prefix,
          };
        }
        break; // found earliest for this prefix
      }
      idx = raw.indexOf(token, idx + 1);
    }
  }
  return best;
}

function splitPersonnel(
  raw: string,
): { code: string; name: string; role: string } | null {
  // Format: "CODESURNAME, FIRSTNAME[, MIDDLE]- ROLE"
  // The code is 3 chars of surname + 3 chars of firstname (+ optional digit).
  // We find the repeat of the first 3 chars at or after position 4.
  const dashIdx = raw.lastIndexOf('- ');
  if (dashIdx === -1) return null;
  const before = raw.slice(0, dashIdx).replace(/\s+$/, '');
  const role = raw.slice(dashIdx + 2).trim();

  if (!before.includes(',')) return null;
  const first3 = before.slice(0, 3);
  for (let i = 4; i <= before.length - 3; i++) {
    if (before.slice(i, i + 3) === first3) {
      return {
        code: before.slice(0, i),
        name: before.slice(i).trim(),
        role,
      };
    }
  }
  return null;
}

function parseResourceLine(
  line: string,
): { startTime: string; endTime: string; depth: number; rest: string } | null {
  const m = line.match(/^(\d{2}:\d{2})\s+(AM|PM)\s+(\d{2}:\d{2})\s+(AM|PM)(.*)$/);
  if (!m) return null;
  const [, startT, startAP, endT, endAP, tailInit] = m;
  let depth = 0;
  let t = tailInit;
  while (true) {
    const nested = t.match(/^\s*\|__\s*(.*)$/);
    if (!nested) break;
    depth++;
    t = nested[1];
  }
  t = t.replace(/^\s+/, '');
  return {
    startTime: `${startT} ${startAP}`,
    endTime: `${endT} ${endAP}`,
    depth,
    rest: t,
  };
}

function timeToISO(reportDate: string, timeStr: string): string {
  // reportDate YYYY-MM-DD, timeStr "HH:MM AM/PM" → ISO timestamp at Pacific time.
  // Northern-Nevada dispatch — April is PDT (-07:00). Simple offset is good enough
  // for scheduling context; actual reconciliation uses telematics timestamps.
  const [hhmm, ap] = timeStr.split(' ');
  const parts = hhmm.split(':').map((n) => parseInt(n, 10));
  let h = parts[0];
  const m = parts[1];
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${reportDate}T${pad(h)}:${pad(m)}:00-07:00`;
}

export function parseDispatchText(text: string): ParsedReport {
  const lines = text.split('\n');

  let reportDate: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'Daily Schedule Report') {
      const dateLine = (lines[i + 1] ?? '').trim();
      const m = dateLine.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) {
        reportDate = `${m[3]}-${m[1]}-${m[2]}`;
        break;
      }
    }
  }
  if (!reportDate) throw new Error('Could not find report date in PDF text');

  const jobsMap = new Map<string, Job>();
  let currentJob: Job | null = null;
  let currentForeman: Foreman | null = null;
  let inRentals = false;
  let inDailyNotes = false;
  let dailyNotesBuffer: string[] = [];

  const jobHeaderRE = /^([A-Z0-9_&]+):\s+(.+?)(?:\s*\(cont\.\))?\s+\1:\s+(?:.+?)(?:\s*\(cont\.\))?\s*$/;
  const pageHeaderRE = /^(Sierra Nevada Construction|Daily Schedule Report|Resource|\d{2}\/\d{2}\/\d{4}|[A-Z]+Printed on:|Page\s+\d+)/;

  const flushDailyNotes = () => {
    if (currentJob && dailyNotesBuffer.length > 0) {
      const notes = dailyNotesBuffer.join('\n').trim();
      if (notes) {
        currentJob.dailyNotes = currentJob.dailyNotes
          ? currentJob.dailyNotes + '\n' + notes
          : notes;
      }
    }
    dailyNotesBuffer = [];
    inDailyNotes = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');
    const trimmed = line.trim();

    const hm = line.match(jobHeaderRE);
    if (hm) {
      flushDailyNotes();
      const jobCode = hm[1];
      const jobName = hm[2].replace(/\s*\(cont\.\)\s*$/, '').trim();

      const existing = jobsMap.get(jobCode);
      if (existing) {
        currentJob = existing;
      } else {
        currentJob = {
          jobCode,
          jobName,
          dailyNotes: '',
          foremen: [],
          items: [],
        };
        jobsMap.set(jobCode, currentJob);
      }
      currentForeman = null;
      inRentals = false;
      inDailyNotes = false;
      continue;
    }

    if (trimmed === 'Rentals') {
      flushDailyNotes();
      inRentals = true;
      currentForeman = null;
      continue;
    }

    if (inRentals) continue;

    const dn = line.match(/^Daily Location Notes:\s*(.*)$/);
    if (dn && currentJob) {
      inDailyNotes = true;
      dailyNotesBuffer = [];
      const rest = dn[1].trim();
      if (rest) dailyNotesBuffer.push(rest);
      continue;
    }

    const res = parseResourceLine(line);
    if (res && currentJob) {
      flushDailyNotes();
      const { value: cleanRest } = stripStatus(res.rest);

      const eq = splitEquipment(cleanRest);
      if (eq) {
        const altCode = `${eq.typePrefix} ${eq.code}`;
        currentJob.items.push({
          kind: 'equipment',
          foremanCode: currentForeman ? currentForeman.code : null,
          equipmentCode: eq.code,
          description: eq.description.trim(),
          typePrefix: eq.typePrefix,
          altCode,
          schedStart: timeToISO(reportDate, res.startTime),
          schedEnd: timeToISO(reportDate, res.endTime),
        });
        continue;
      }

      const p = splitPersonnel(cleanRest);
      if (p) {
        if (res.depth === 0) {
          const foreman: Foreman = {
            code: p.code,
            name: p.name,
            role: p.role,
            schedStart: timeToISO(reportDate, res.startTime),
            schedEnd: timeToISO(reportDate, res.endTime),
          };
          currentJob.foremen.push(foreman);
          currentForeman = foreman;
        } else {
          const isOperator = OPERATOR_ROLES.has(p.role);
          currentJob.items.push({
            kind: isOperator ? 'operator' : 'laborer',
            foremanCode: currentForeman ? currentForeman.code : null,
            code: p.code,
            name: p.name,
            role: p.role,
            schedStart: timeToISO(reportDate, res.startTime),
            schedEnd: timeToISO(reportDate, res.endTime),
          });
        }
        continue;
      }
      continue;
    }

    if (inDailyNotes && currentJob) {
      if (pageHeaderRE.test(trimmed)) {
        flushDailyNotes();
        continue;
      }
      if (trimmed === '') {
        if (dailyNotesBuffer.length > 0) dailyNotesBuffer.push('');
        continue;
      }
      dailyNotesBuffer.push(trimmed);
      continue;
    }
  }
  flushDailyNotes();

  return { reportDate, jobs: Array.from(jobsMap.values()) };
}
