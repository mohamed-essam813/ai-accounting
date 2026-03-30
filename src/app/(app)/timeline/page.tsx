import Link from "next/link";
import { format } from "date-fns";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/users";
import { listTimelineEvents } from "@/lib/data/timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const revalidate = 30;

export default async function TimelinePage() {
  const user = await getCurrentUser();
  if (!user?.tenant) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Financial Timeline</h2>
        <p className="text-sm text-muted-foreground">Sign in to view activity.</p>
      </div>
    );
  }

  const supabase = await createServerSupabaseClient();
  const events = await listTimelineEvents(supabase, user.tenant.id, 200);

  const grouped = new Map<string, typeof events>();
  for (const ev of events) {
    const key = ev.event_date;
    const list = grouped.get(key) ?? [];
    list.push(ev);
    grouped.set(key, list);
  }
  const sortedDates = [...grouped.keys()].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Financial Timeline</h2>
        <p className="text-sm text-muted-foreground">
          Chronological business activity linked to the ledger (PRD Financial Timeline).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Newest first. Open a row to view the underlying journal entry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {sortedDates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No timeline events yet. Post an approved draft or approve a manual journal to populate this feed.
            </p>
          ) : (
            sortedDates.map((dateKey) => {
              const dayEvents = grouped.get(dateKey) ?? [];
              let label = dateKey;
              try {
                label = format(new Date(`${dateKey}T12:00:00`), "EEEE, MMM d, yyyy");
              } catch {
                /* keep ISO */
              }
              return (
                <section key={dateKey} className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground border-b pb-1">{label}</h3>
                  <ul className="space-y-3">
                    {dayEvents.map((ev) => {
                      const href = `/journals?entryId=${ev.reference_id}`;
                      return (
                        <li key={ev.id} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-0.5">
                            <p className="text-sm">{ev.description}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {ev.event_type.replace(/_/g, " ")}
                            </p>
                          </div>
                          <Link
                            href={href}
                            className="text-xs font-medium text-primary hover:underline shrink-0"
                          >
                            View entry
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
