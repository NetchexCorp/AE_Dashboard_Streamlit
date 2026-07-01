import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Clock } from "lucide-react";
import { type FieldRef, listFields } from "@/api/riaas";
import { useMe } from "@/hooks/useMe";
import { cn } from "@/lib/cn";

const TIER_STYLES: Record<string, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-muted text-muted-foreground",
};

export function OrgFieldsRoute() {
  const me = useMe();
  const riaas = me.data?.features?.riaas === true;
  const { data, isLoading } = useQuery<FieldRef[]>({
    queryKey: ["riaas", "fields"],
    queryFn: listFields,
    staleTime: 30_000,
    enabled: riaas,
  });
  const [tier, setTier] = useState<string>("all");
  const [sfObject, setSfObject] = useState<string>("all");

  const objects = useMemo(
    () => Array.from(new Set((data ?? []).map((f) => f.sf_object))),
    [data],
  );
  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (f) =>
          (tier === "all" || f.tier === tier) &&
          (sfObject === "all" || f.sf_object === sfObject),
      ),
    [data, tier, sfObject],
  );

  if (me.data && !riaas) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Page not found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Field Dictionary</h1>
        <p className="text-sm text-muted-foreground">
          Read-only reference of the Salesforce fields used by
          organization-performance analyses.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Tier:</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-1 text-xs"
          >
            <option value="all">All</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-muted-foreground">Object:</span>
          <select
            value={sfObject}
            onChange={(e) => setSfObject(e.target.value)}
            className="h-7 rounded-md border border-border bg-background px-1 text-xs"
          >
            <option value="all">All</option>
            {objects.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        {data && (
          <span className="text-muted-foreground">
            {filtered.length} of {data.length} fields
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Key
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Object
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                API Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Tier
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Confirmed
              </th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No fields match the current filters.
                </td>
              </tr>
            )}
            {filtered.map((f) => (
              <tr key={f.key} className="border-t border-border/40">
                <td className="px-3 py-2 font-mono text-xs">{f.key}</td>
                <td className="px-3 py-2 text-xs">{f.sf_object}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.api_name}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                      TIER_STYLES[f.tier] ?? "bg-muted text-muted-foreground",
                    )}
                  >
                    {f.tier}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {f.confirmed ? (
                    <span className="flex items-center gap-1 text-xs text-green-700">
                      <Check className="h-3.5 w-3.5" />
                      Confirmed
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <Clock className="h-3.5 w-3.5" />
                      Pending
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {f.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
