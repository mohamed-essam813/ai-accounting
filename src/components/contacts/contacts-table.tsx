"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePagination } from "@/hooks/use-pagination";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactForm } from "./contact-form";
import { StatementOfAccount } from "./statement-of-account";
import { deactivateContactAction, reactivateContactAction } from "@/lib/actions/contacts";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import type { ContactListRow, ContactListFilter, ContactListSort } from "@/lib/data/contacts";
import { formatCurrency } from "@/lib/format";
import { formatDate } from "@/lib/format";
import { canManageAccounts } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";

type Props = {
  contacts: ContactListRow[];
  userRole: UserRole;
};

const FILTERS: { id: ContactListFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
  { id: "employees", label: "Employees" },
  { id: "deactivated", label: "Deactivated" },
];

export function ContactsTable({ contacts, userRole }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [editingContact, setEditingContact] = useState<ContactListRow | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [statementContact, setStatementContact] = useState<ContactListRow | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<ContactListRow | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canAdmin = canManageAccounts(userRole);

  const filter = (searchParams.get("filter") as ContactListFilter) || "all";
  const sort = (searchParams.get("sort") as ContactListSort) || "name_asc";

  const setQuery = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (value === "") p.delete(key);
    else p.set(key, value);
    router.push(`/contacts?${p.toString()}`);
  };

  const {
    currentItems: paginatedContacts,
    currentPage,
    totalPages,
    goToPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagination({ data: contacts, itemsPerPage: 20 });

  const handleDeactivate = () => {
    if (!deactivateTarget) return;
    startTransition(async () => {
      try {
        await deactivateContactAction({
          contactId: deactivateTarget.id,
          reason: deactivateReason || undefined,
          overrideReason: overrideReason || undefined,
        });
        toast.success("Contact deactivated");
        setDeactivateTarget(null);
        setDeactivateReason("");
        setOverrideReason("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const exportCsv = () => {
    const headers = [
      "code",
      "name",
      "roles",
      "email",
      "phone",
      "emirate",
      "outstanding_ar",
      "outstanding_ap",
      "last_activity",
      "active",
    ];
    const escape = (v: string | null | undefined) => {
      const s = (v ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };
    const roleStr = (c: ContactListRow) =>
      [c.is_customer && "customer", c.is_vendor && "vendor", c.is_employee && "employee"]
        .filter(Boolean)
        .join("+");
    const lines = [
      headers.join(","),
      ...contacts.map((c) =>
        [
          c.code,
          c.name,
          roleStr(c),
          c.email,
          c.phone,
          c.emirate,
          String(c.outstanding_ar),
          String(c.outstanding_ap),
          c.last_activity_at ?? "",
          c.is_active ? "yes" : "no",
        ]
          .map((v) => escape(typeof v === "string" ? v : String(v)))
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const roleBadges = (c: ContactListRow) => (
    <div className="flex flex-wrap gap-1">
      {c.is_customer ? (
        <Badge variant="default" className="text-[10px]">
          customer
        </Badge>
      ) : null}
      {c.is_vendor ? (
        <Badge variant="secondary" className="text-[10px]">
          vendor
        </Badge>
      ) : null}
      {c.is_employee ? (
        <Badge variant="outline" className="text-[10px]">
          employee
        </Badge>
      ) : null}
    </div>
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const bulkDeactivate = () => {
    if (selected.size === 0) return;
    startTransition(async () => {
      try {
        const { bulkDeactivateContactsAction } = await import("@/lib/actions/contacts");
        await bulkDeactivateContactsAction([...selected]);
        toast.success("Contacts deactivated");
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Bulk deactivate failed");
      }
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              onClick={() => setQuery("filter", f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1 min-w-[200px] flex-1">
            <Label className="text-xs">Search</Label>
            <Input
              placeholder="Name, code, email, phone, TRN…"
              defaultValue={searchParams.get("search") ?? ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value.trim();
                  setQuery("search", v);
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sort</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={sort}
              onChange={(e) => setQuery("sort", e.target.value)}
            >
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="code_asc">Code A–Z</option>
              <option value="outstanding_desc">Outstanding</option>
              <option value="last_activity_desc">Last activity</option>
              <option value="created_desc">Created</option>
            </select>
          </div>
          <div className="flex-1" />
          {contacts.length > 0 && (
            <Button type="button" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/contacts/duplicates">Duplicate pairs</Link>
          </Button>
          <Button onClick={() => { setEditingContact(null); setIsCreateMode(true); setIsDialogOpen(true); }}>
            Add Contact
          </Button>
        </div>
        {canAdmin && selected.size > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={bulkDeactivate}>
            Bulk deactivate ({selected.size})
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {canAdmin ? <TableHead className="w-10" /> : null}
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Emirate</TableHead>
              <TableHead className="text-right">AR</TableHead>
              <TableHead className="text-right">AP</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canAdmin ? 12 : 11}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  No contacts match. Click Add Contact to create one.
                </TableCell>
              </TableRow>
            ) : (
              paginatedContacts.map((contact) => (
                <TableRow key={contact.id}>
                  {canAdmin ? (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border"
                        checked={selected.has(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                        disabled={!contact.is_active}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="font-mono text-xs">{contact.code}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/contacts/${contact.id}`} className="hover:underline text-primary">
                      {contact.name}
                    </Link>
                  </TableCell>
                  <TableCell>{roleBadges(contact)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{contact.email ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{contact.phone ?? "—"}</TableCell>
                  <TableCell className="text-sm">{contact.emirate ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(contact.outstanding_ar)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(contact.outstanding_ap)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {contact.last_activity_at ? formatDate(contact.last_activity_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={contact.is_active ? "outline" : "secondary"}>
                      {contact.is_active ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStatementContact(contact);
                          setIsStatementOpen(true);
                        }}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Statement
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditingContact(contact); setIsCreateMode(false); setIsDialogOpen(true); }}>
                        Edit
                      </Button>
                      {contact.is_active ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDeactivateTarget(contact)}
                          disabled={isPending}
                        >
                          Deactivate
                        </Button>
                      ) : canAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            startTransition(async () => {
                              try {
                                await reactivateContactAction(contact.id);
                                toast.success("Reactivated");
                                router.refresh();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Failed");
                              }
                            });
                          }}
                        >
                          Reactivate
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {contacts.length > 0 && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={contacts.length}
          itemsPerPage={itemsPerPage}
          onPageChange={goToPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isCreateMode ? "Create Contact" : "Edit Contact"}</DialogTitle>
            <DialogDescription>
              {isCreateMode
                ? "Roles, VAT fields, and banking — at least one role is required."
                : "Update contact information."}
            </DialogDescription>
          </DialogHeader>
          <ContactForm
            contact={editingContact}
            onSuccess={() => {
              setIsDialogOpen(false);
              setEditingContact(null);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isStatementOpen} onOpenChange={setIsStatementOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Statement of Account</DialogTitle>
            <DialogDescription>Transaction history for {statementContact?.name}</DialogDescription>
          </DialogHeader>
          {statementContact && <StatementOfAccount contact={statementContact} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deactivateTarget} onOpenChange={() => setDeactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {deactivateTarget?.name}?</DialogTitle>
            <DialogDescription>
              They will be hidden from pickers and lists but their transaction history will remain. You can reactivate
              them later (admin).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="deact-reason">Reason (optional)</Label>
            <Input
              id="deact-reason"
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              placeholder="e.g. No longer trading with this party"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="override-reason">Admin override (required if outstanding balance)</Label>
            <Input
              id="override-reason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="If AR/AP balance exists, explain override"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={handleDeactivate} disabled={isPending}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
