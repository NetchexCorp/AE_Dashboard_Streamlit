import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Clock, ExternalLink, Mail, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type RiaasReportMotion,
  type RiaasReportPeriod,
  type RiaasSchedule,
  createRiaasSchedule,
  listRiaasSchedules,
  removeRiaasSchedule,
  sendRiaasOnce,
  sendRiaasScheduleNow,
  updateRiaasSchedule,
} from "@/api/riaas";
import { ReadOnlyGate, useReadOnly } from "@/components/auth/ReadOnlyGate";
import { useMe } from "@/hooks/useMe";
import {
  DEFAULT_SCHEDULE,
  DOW_LABELS,
  type FriendlySchedule,
  type Frequency,
  describeSchedule,
  makeCron,
  parseCron,
} from "@/lib/cron";
import { formatInTz } from "@/lib/datetime";
import { cn } from "@/lib/cn";

export interface OrgReportSearch {
  period?: string;
  motion?: string;
}

const DEFAULT_PERIOD: RiaasReportPeriod = "last_4_quarters";
const DEFAULT_MOTION: RiaasReportMotion = "all";
const DEFAULT_SUBJECT = "Revenue Insights Report";

const PERIOD_OPTIONS: { value: RiaasReportPeriod; label: string }[] = [
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last_4_quarters", label: "Last 4 quarters" },
  { value: "prior_fy", label: "Prior fiscal year" },
];

const MOTION_OPTIONS: { value: RiaasReportMotion; label: string }[] = [
  { value: "all", label: "All motions" },
  { value: "nb", label: "New business" },
  { value: "exp", label: "Expansion" },
];

const route = getRouteApi("/org/report");

export function OrgReportRoute() {
  const me = useMe();

  // Server-side gating is authoritative (RIaaS APIs 404 for non-flagged
  // users); this just avoids rendering a dead page on a direct URL hit.
  if (me.data && me.data.features?.riaas !== true) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Page not found.
      </div>
    );
  }

  return (
    <ReadOnlyGate>
      <OrgReportInner />
    </ReadOnlyGate>
  );
}

function OrgReportInner() {
  const readOnly = useReadOnly();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const tz = me?.flags.scheduler_tz ?? "UTC";
  const riaas = me?.features?.riaas === true;
  const search = route.useSearch();
  const navigate = route.useNavigate();

  const period = (search.period as RiaasReportPeriod) ?? DEFAULT_PERIOD;
  const motion = (search.motion as RiaasReportMotion) ?? DEFAULT_MOTION;

  const [editing, setEditing] = useState<RiaasSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery<RiaasSchedule[]>({
    queryKey: ["riaas", "schedules"],
    queryFn: listRiaasSchedules,
    enabled: riaas,
  });

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ["riaas", "schedules"] });
  };

  const toggleActive = useMutation({
    mutationFn: (s: RiaasSchedule) =>
      updateRiaasSchedule(s.id, { is_active: !s.is_active }),
    onSuccess: (s) => {
      invalidate();
      toast.success(`${s.is_active ? "Activated" : "Paused"} "${s.name}"`);
    },
    onError: (err) => toast.error(`Update failed: ${(err as Error).message}`),
  });
  const del = useMutation({
    mutationFn: removeRiaasSchedule,
    onSuccess: (_, id) => {
      const name = data?.find((s) => s.id === id)?.name ?? "schedule";
      invalidate();
      toast.success(`Deleted "${name}"`);
    },
    onError: (err) => toast.error(`Delete failed: ${(err as Error).message}`),
  });
  const send = useMutation({
    mutationFn: sendRiaasScheduleNow,
    onSuccess: (res, id) => {
      const name = data?.find((s) => s.id === id)?.name ?? "schedule";
      if (res.ok) toast.success(`Sent "${name}"${res.message_id ? ` · ${res.message_id}` : ""}`);
      else toast.error(`Send failed: ${res.error ?? "unknown error"}`);
    },
    onError: (err) => toast.error(`Send failed: ${(err as Error).message}`),
  });

  const setSearch = (patch: Partial<OrgReportSearch>) => {
    void navigate({
      search: (prev: OrgReportSearch) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  const previewUrl = `/api/riaas/report/preview?period=${encodeURIComponent(
    period,
  )}&motion=${encodeURIComponent(motion)}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Revenue Insights Report</h1>
          <p className="text-sm text-muted-foreground">
            Scheduled email digests of the Organization Performance report.
            Times are interpreted in the scheduler timezone (
            <span className="font-medium">{tz}</span>).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Period</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={period}
              onChange={(e) =>
                setSearch({
                  period:
                    e.target.value === DEFAULT_PERIOD
                      ? undefined
                      : e.target.value,
                })
              }
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Motion</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={motion}
              onChange={(e) =>
                setSearch({
                  motion:
                    e.target.value === DEFAULT_MOTION
                      ? undefined
                      : e.target.value,
                })
              }
            >
              {MOTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open report preview
          </a>
        </div>
      </header>

      {!readOnly && !creating && !editing && (
        <div className="flex items-center justify-end gap-2">
          <SendOncePanel readOnly={readOnly} period={period} motion={motion} />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> New schedule
          </button>
        </div>
      )}

      {creating && (
        <RiaasScheduleForm onClose={() => setCreating(false)} />
      )}
      {editing && (
        <RiaasScheduleForm initial={editing} onClose={() => setEditing(null)} />
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Cron
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Recipients
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Last run
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {data?.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No schedules yet — create one to email this report on a cadence.
                </td>
              </tr>
            )}
            {data?.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.subject}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {periodLabel(s.filters.period)} · {motionLabel(s.filters.motion)}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>{describeSchedule(parseCron(s.cron), tz)}</div>
                  <code className="font-mono text-[10px] text-muted-foreground">
                    {s.cron}
                  </code>
                </td>
                <td className="px-3 py-2 text-xs">
                  {s.recipients.slice(0, 2).join(", ")}
                  {s.recipients.length > 2 && ` +${s.recipients.length - 2}`}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatInTz(s.last_run_at, tz)}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleActive.mutate(s)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      s.is_active
                        ? "bg-green-100 text-green-900"
                        : "bg-muted text-muted-foreground",
                      readOnly && "opacity-60",
                    )}
                  >
                    {s.is_active ? "active" : "paused"}
                  </button>
                  {s.last_run_status && s.last_run_status !== "ok" && (
                    <div className="mt-1 text-[10px] text-red-700">
                      {s.last_run_status}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => send.mutate(s.id)}
                        disabled={send.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        <Send className="h-3 w-3" /> Send now
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setEditing(s)}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                      >
                        Edit
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete schedule "${s.name}"?`)) {
                            del.mutate(s.id);
                          }
                        }}
                        className="text-muted-foreground hover:text-red-700"
                        aria-label="Delete schedule"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function periodLabel(value: RiaasReportPeriod | undefined): string {
  return (
    PERIOD_OPTIONS.find((o) => o.value === (value ?? DEFAULT_PERIOD))?.label ??
    DEFAULT_PERIOD
  );
}

function motionLabel(value: RiaasReportMotion | undefined): string {
  return (
    MOTION_OPTIONS.find((o) => o.value === (value ?? DEFAULT_MOTION))?.label ??
    DEFAULT_MOTION
  );
}

interface FormProps {
  initial?: RiaasSchedule;
  onClose: () => void;
}

function RiaasScheduleForm({ initial, onClose }: FormProps) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const tz = me?.flags.scheduler_tz ?? "UTC";

  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? DEFAULT_SUBJECT);
  const [recipientsText, setRecipientsText] = useState(
    initial ? initial.recipients.join(", ") : "",
  );
  const [schedule, setSchedule] = useState<FriendlySchedule>(
    initial ? parseCron(initial.cron) : DEFAULT_SCHEDULE,
  );
  const [period, setPeriod] = useState<RiaasReportPeriod>(
    initial?.filters.period ?? DEFAULT_PERIOD,
  );
  const [motion, setMotion] = useState<RiaasReportMotion>(
    initial?.filters.motion ?? DEFAULT_MOTION,
  );

  // Keep the raw cron field in sync with the friendly inputs unless the
  // user is in custom mode.
  useEffect(() => {
    if (schedule.frequency !== "custom") {
      const next = makeCron(schedule);
      if (next !== schedule.raw) {
        setSchedule((s) => ({ ...s, raw: next }));
      }
    }
  }, [schedule.frequency, schedule.hour, schedule.minute, schedule.daysOfWeek, schedule.dayOfMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const finalCron = makeCron(schedule);

  const create = useMutation({
    mutationFn: () =>
      createRiaasSchedule({
        name,
        cron: finalCron,
        subject,
        recipients: parseRecipients(recipientsText),
        filters: { period, motion },
        is_active: true,
      }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["riaas", "schedules"] });
      onClose();
      toast.success(`Created schedule "${s.name}"`);
    },
    onError: (err) => toast.error(`Create failed: ${(err as Error).message}`),
  });

  const update = useMutation({
    mutationFn: () =>
      updateRiaasSchedule(initial!.id, {
        name,
        cron: finalCron,
        subject,
        recipients: parseRecipients(recipientsText),
        filters: { period, motion },
      }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["riaas", "schedules"] });
      onClose();
      toast.success(`Saved schedule "${s.name}"`);
    },
    onError: (err) => toast.error(`Save failed: ${(err as Error).message}`),
  });

  const m = initial ? update : create;
  const summary = describeSchedule(schedule, tz);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="space-y-4 rounded-md border border-border bg-muted/20 p-4"
    >
      <h4 className="font-medium">
        {initial ? "Edit schedule" : "New schedule"}
      </h4>

      <label className="block text-sm">
        <span className="text-muted-foreground">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 block h-8 w-full rounded-md border border-border bg-background px-2"
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted-foreground">Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 block h-8 w-full rounded-md border border-border bg-background px-2"
        />
      </label>

      <fieldset className="space-y-2 text-sm">
        <legend className="text-muted-foreground">Report filters</legend>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Period</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={period}
              onChange={(e) => setPeriod(e.target.value as RiaasReportPeriod)}
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Motion</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={motion}
              onChange={(e) => setMotion(e.target.value as RiaasReportMotion)}
            >
              {MOTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-2 text-sm">
        <legend className="text-muted-foreground">Cadence</legend>

        {/* Frequency picker */}
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["daily", "weekdays", "weekly", "monthly", "custom"] as Frequency[]).map(
            (f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSchedule((s) => ({ ...s, frequency: f }))}
                className={cn(
                  "px-2.5 py-1 text-xs capitalize",
                  schedule.frequency === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                {f}
              </button>
            ),
          )}
        </div>

        {/* Time picker — always shown except for custom */}
        {schedule.frequency !== "custom" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">At</span>
            <input
              type="time"
              value={`${String(schedule.hour).padStart(2, "0")}:${String(
                schedule.minute,
              ).padStart(2, "0")}`}
              onChange={(e) => {
                const [hh, mm] = e.target.value.split(":");
                setSchedule((s) => ({
                  ...s,
                  hour: Number(hh) || 0,
                  minute: Number(mm) || 0,
                }));
              }}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Times are interpreted in <strong className="font-medium">{tz}</strong>
            </span>
          </div>
        )}

        {/* Frequency-specific extras */}
        {schedule.frequency === "weekly" && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground">On</span>
            {DOW_LABELS.map((label, idx) => {
              const checked = schedule.daysOfWeek.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() =>
                    setSchedule((s) => {
                      const next = checked
                        ? s.daysOfWeek.filter((d) => d !== idx)
                        : [...s.daysOfWeek, idx];
                      return { ...s, daysOfWeek: next };
                    })
                  }
                  className={cn(
                    "h-7 w-9 rounded-md border text-xs",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {schedule.frequency === "monthly" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">On day</span>
            <input
              type="number"
              min={1}
              max={28}
              value={schedule.dayOfMonth}
              onChange={(e) =>
                setSchedule((s) => ({
                  ...s,
                  dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value) || 1)),
                }))
              }
              className="h-8 w-16 rounded-md border border-border bg-background px-2 text-xs"
            />
            <span className="text-xs text-muted-foreground">of the month (1–28)</span>
          </div>
        )}

        {schedule.frequency === "custom" && (
          <div className="space-y-1">
            <input
              value={schedule.raw}
              onChange={(e) =>
                setSchedule((s) => ({ ...s, raw: e.target.value }))
              }
              required
              className="block h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs"
              placeholder="0 9 * * 1-5"
            />
            <p className="text-[11px] text-muted-foreground">
              5-field cron (minute hour day-of-month month day-of-week).
            </p>
          </div>
        )}

        <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
          <div className="font-medium text-foreground">{summary}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            cron: <code>{finalCron}</code>
          </div>
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="text-muted-foreground">
          Recipients (comma-separated)
        </span>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          required
          rows={2}
          className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1"
          placeholder="cro@example.com, sales-ops@example.com"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={m.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : initial ? "Save" : "Create"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
        >
          Cancel
        </button>
        {m.isError && (
          <span className="text-xs text-red-700">{(m.error as Error).message}</span>
        )}
      </div>
    </form>
  );
}

interface SendOnceProps {
  readOnly?: boolean;
  period: RiaasReportPeriod;
  motion: RiaasReportMotion;
}

function SendOncePanel({ readOnly = false, period, motion }: SendOnceProps) {
  const [open, setOpen] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);

  const send = useMutation({
    mutationFn: () =>
      sendRiaasOnce({
        recipients: parseRecipients(recipientsText),
        subject,
        filters: { period, motion },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        const n = parseRecipients(recipientsText).length;
        setRecipientsText("");
        setOpen(false);
        toast.success(`Sent to ${n} recipient${n === 1 ? "" : "s"}${res.message_id ? ` · ${res.message_id}` : ""}`);
      } else {
        toast.error(`Send failed: ${res.error ?? "unknown error"}`);
      }
    },
    onError: (err) => toast.error(`Send failed: ${(err as Error).message}`),
  });

  if (readOnly) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
      >
        <Mail className="h-3.5 w-3.5" />
        Send immediately
      </button>
    );
  }

  const recipientCount = parseRecipients(recipientsText).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
      className="flex-1 space-y-3 rounded-md border border-border bg-muted/20 p-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Send the report now</h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Renders the Revenue Insights Report using the current filters (
        {periodLabel(period)}, {motionLabel(motion)}) and emails it to the
        recipients below. Nothing is saved — this is a one-off send.
      </p>

      <label className="block text-sm">
        <span className="text-muted-foreground">Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 block h-8 w-full rounded-md border border-border bg-background px-2"
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted-foreground">
          Recipients (comma-separated)
        </span>
        <textarea
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          required
          rows={2}
          autoFocus
          className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1"
          placeholder="cro@example.com, sales-ops@example.com"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={send.isPending || recipientCount === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {send.isPending
            ? "Sending…"
            : `Send to ${recipientCount || "0"} recipient${recipientCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}

function parseRecipients(s: string): string[] {
  return s
    .split(/[,\n;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
