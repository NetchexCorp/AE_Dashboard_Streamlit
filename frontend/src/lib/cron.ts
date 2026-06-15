export type Frequency =
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "custom";

export interface FriendlySchedule {
  frequency: Frequency;
  hour: number; // 0–23
  minute: number; // 0–59
  daysOfWeek: number[]; // 0=Sun … 6=Sat — used when frequency=weekly
  dayOfMonth: number; // 1–28 — used when frequency=monthly
  raw: string; // the actual cron string, source of truth in custom mode
}

export const DEFAULT_SCHEDULE: FriendlySchedule = {
  frequency: "daily",
  hour: 9,
  minute: 0,
  daysOfWeek: [1],
  dayOfMonth: 1,
  raw: "0 9 * * *",
};

export function makeCron(s: FriendlySchedule): string {
  const m = clamp(s.minute, 0, 59);
  const h = clamp(s.hour, 0, 23);
  switch (s.frequency) {
    case "daily":
      return `${m} ${h} * * *`;
    case "weekdays":
      return `${m} ${h} * * mon-fri`;
    case "weekly": {
      const dows = (s.daysOfWeek.length ? s.daysOfWeek : [1])
        .slice()
        .sort()
        .map((d) => DOW_TEXT[clamp(d, 0, 6)])
        .join(",");
      return `${m} ${h} * * ${dows}`;
    }
    case "monthly":
      return `${m} ${h} ${clamp(s.dayOfMonth, 1, 28)} * *`;
    case "custom":
      return s.raw.trim();
  }
}

export function parseCron(raw: string): FriendlySchedule {
  const fallback: FriendlySchedule = { ...DEFAULT_SCHEDULE, raw, frequency: "custom" };
  const parts = raw.trim().split(/\s+/);
  if (parts.length !== 5) return fallback;
  const [min, hr, dom, mon, dow] = parts;
  const minute = parseSingleInt(min);
  const hour = parseSingleInt(hr);
  if (minute === null || hour === null) return fallback;
  if (mon !== "*") return fallback;

  // Daily
  if (dom === "*" && dow === "*") {
    return {
      frequency: "daily",
      hour,
      minute,
      daysOfWeek: [],
      dayOfMonth: 1,
      raw,
    };
  }
  // Weekdays (Mon-Fri)
  if (dom === "*" && /^(1-5|mon-fri|MON-FRI)$/i.test(dow)) {
    return {
      frequency: "weekdays",
      hour,
      minute,
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth: 1,
      raw,
    };
  }
  // Weekly (specific days) — accept numeric (legacy) or text day names
  const dowTextRe = /^(sun|mon|tue|wed|thu|fri|sat)(,(sun|mon|tue|wed|thu|fri|sat))*$/i;
  if (dom === "*" && (dowTextRe.test(dow) || /^[0-6](,[0-6])*$/.test(dow))) {
    const daysOfWeek = dow.split(",").map((d) => {
      const idx = DOW_TEXT.indexOf(d.toLowerCase() as typeof DOW_TEXT[number]);
      return idx !== -1 ? idx : parseInt(d, 10);
    });
    return {
      frequency: "weekly",
      hour,
      minute,
      daysOfWeek,
      dayOfMonth: 1,
      raw,
    };
  }
  // Monthly
  if (dow === "*" && /^[1-9]\d?$/.test(dom)) {
    const n = parseInt(dom, 10);
    if (n >= 1 && n <= 28) {
      return {
        frequency: "monthly",
        hour,
        minute,
        daysOfWeek: [],
        dayOfMonth: n,
        raw,
      };
    }
  }
  return fallback;
}

export function describeSchedule(s: FriendlySchedule, tz: string): string {
  if (s.frequency === "custom") return `Custom (${s.raw}) — ${tz}`;
  const time = formatTime(s.hour, s.minute);
  const tzSuffix = tz ? ` (${tz})` : "";
  switch (s.frequency) {
    case "daily":
      return `Daily at ${time}${tzSuffix}`;
    case "weekdays":
      return `Weekdays at ${time}${tzSuffix}`;
    case "weekly": {
      const names = s.daysOfWeek.length ? s.daysOfWeek.map(dowName).join(", ") : "Monday";
      return `${names} at ${time}${tzSuffix}`;
    }
    case "monthly":
      return `Monthly on the ${ordinal(s.dayOfMonth)} at ${time}${tzSuffix}`;
  }
}

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// APScheduler's CronTrigger interprets numeric day_of_week with 0=Monday (not standard
// cron's 0=Sunday). Using text names avoids the ambiguity — APScheduler handles them correctly.
const DOW_TEXT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function dowName(n: number): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return names[clamp(n, 0, 6)];
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (k >= 11 && k <= 13) return `${n}th`;
  if (j === 1) return `${n}st`;
  if (j === 2) return `${n}nd`;
  if (j === 3) return `${n}rd`;
  return `${n}th`;
}

function formatTime(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function parseSingleInt(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
