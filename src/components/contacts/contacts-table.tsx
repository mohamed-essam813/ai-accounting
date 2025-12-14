"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { deleteContactAction } from "@/lib/actions/contacts";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import type { Database } from "@/lib/database.types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

type Props = {
  contacts: Contact[];
};

export function ContactsTable({ contacts }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [statementContact, setStatementContact] = useState<Contact | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    setIsCreateMode(false);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingContact(null);
    setIsCreateMode(true);
    setIsDialogOpen(true);
  };

  const handleDelete = (contactId: string, contactName: string) => {
    if (!confirm(`Are you sure you want to delete ${contactName}?`)) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteContactAction(contactId);
        toast.success("Contact deleted");
      } catch (error) {
        console.error(error);
        toast.error("Failed to delete contact", {
          description: error instanceof Error ? error.message : "Unknown error occurred.",
        });
      }
    });
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case "customer":
        return "default";
      case "vendor":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={handleCreate}>Add Contact</Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  No contacts yet. Click "Add Contact" to create one.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-mono text-xs">{contact.code}</TableCell>
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell>
                    <Badge variant={getTypeBadgeVariant(contact.type)}>
                      {contact.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {contact.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {contact.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(contact)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(contact.id, contact.name)}
                        disabled={isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isCreateMode ? "Create Contact" : "Edit Contact"}</DialogTitle>
            <DialogDescription>
              {isCreateMode
                ? "Add a new customer, vendor, or other contact. Contact code will be auto-generated."
                : "Update contact information."}
            </DialogDescription>
          </DialogHeader>
          <ContactForm
            contact={editingContact}
            onSuccess={() => {
              setIsDialogOpen(false);
              setEditingContact(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isStatementOpen} onOpenChange={setIsStatementOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Statement of Account</DialogTitle>
            <DialogDescription>
              Transaction history and running balance for {statementContact?.name}
            </DialogDescription>
          </DialogHeader>
          {statementContact && (
            <StatementOfAccount contact={statementContact} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
