import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/users";
import { loadAllDataIntegritySections } from "@/lib/data/data-integrity-reports";
import { getInventorySummary } from "@/lib/data/inventory";
import { getTrialBalance } from "@/lib/data/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataIntegrityExport } from "@/components/admin/data-integrity-export";
import { can, type UserRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

function canViewDataIntegrity(role: UserRole): boolean {
  return can(role, "view_audit_log");
}

export default async function DataIntegrityPage() {
  const user = await getCurrentUser();
  if (!user?.tenant) redirect("/dashboard");
  if (!canViewDataIntegrity(user.role as UserRole)) redirect("/dashboard");

  const sections = await loadAllDataIntegritySections();
  const [invSummary, tb] = await Promise.all([getInventorySummary(), getTrialBalance()]);
  const invSum = invSummary.reduce((s, r) => s + Number(r.total_value ?? 0), 0);
  const row1200 = tb.find((r) => r.code === "1200");
  const gl1200 =
    row1200 != null
      ? Number(row1200.total_debit ?? 0) - Number(row1200.total_credit ?? 0)
      : null;
  const variance1200 = gl1200 != null ? Math.round((invSum - gl1200) * 100) / 100 : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Data integrity (read-only)</h2>
        <p className="text-sm text-muted-foreground">
          Review-only reports for cleanup candidates. No automatic changes are applied from this page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory (1200) vs stock summary</CardTitle>
          <CardDescription>
            Sum of displayed inventory values compared to trial balance account 1200 (debit − credit). A non-zero variance
            warrants review.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-1 font-mono tabular-nums">
          <p>Sum of inventory summary total value: {invSum.toFixed(2)}</p>
          <p>GL 1200 net balance: {gl1200 != null ? gl1200.toFixed(2) : "—"}</p>
          <p className={variance1200 != null && Math.abs(variance1200) > 0.1 ? "text-amber-700" : ""}>
            Variance: {variance1200 != null ? variance1200.toFixed(2) : "—"}
          </p>
        </CardContent>
      </Card>

      <DataIntegrityExport payload={{ ...sections, inventoryVsGl: { invSum, gl1200, variance1200 } }} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chart of accounts — review codes / names</CardTitle>
          <CardDescription>{sections.coaSuspects.length} candidate(s)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {sections.coaSuspects.length === 0 ? (
            <p>None flagged by current rules.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {sections.coaSuspects.map((r) => (
                <li key={r.code}>
                  {r.code} — {r.name} ({r.journalLineCount} lines) — {r.reason}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact name similarity (≥85%)</CardTitle>
          <CardDescription>{sections.contactPairs.length} pair(s)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {sections.contactPairs.length === 0 ? (
            <p>No pairs in this band.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {sections.contactPairs.map((p, i) => (
                <li key={`${p.idA}-${p.idB}-${i}`}>
                  {p.similarity}% — {p.nameA} ({p.codeA}) vs {p.nameB} ({p.codeB})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fixed assets — possible duplicates (same normalized name, cost, date)</CardTitle>
          <CardDescription>{sections.fixedDupes.length} group(s)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {sections.fixedDupes.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {sections.fixedDupes.map((g) => (
                <li key={g.assetIds.join("-")}>
                  {g.names.join(" / ")} — {g.cost} on {g.purchaseDate} — ids: {g.assetIds.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fixed assets — non–PPE capitalization account</CardTitle>
          <CardDescription>{sections.faCapAudit.length} row(s)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {sections.faCapAudit.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {sections.faCapAudit.map((r) => (
                <li key={r.assetId}>
                  {r.assetName} — account {r.accountCode ?? "?"} ({r.accountDetailType ?? r.accountType})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory — possible service / misclassified rows</CardTitle>
          <CardDescription>{sections.invCandidates.length} candidate(s)</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {sections.invCandidates.length === 0 ? (
            <p>None flagged.</p>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {sections.invCandidates.map((r) => (
                <li key={r.id}>
                  {r.name} — {r.reason}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
