"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toggleAccountStatusAction, deleteAccountAction } from "@/lib/actions/accounts";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

type Account = {
  id: string;
  name: string;
  code: string;
  type: string;
  is_active: boolean;
};

type Props = {
  accounts: Account[];
  canManage: boolean;
};

export function AccountsTable({ accounts, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (account: Account) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!accountToDelete) return;

    setIsDeleting(true);
    startTransition(async () => {
      try {
        await deleteAccountAction({ accountId: accountToDelete.id });
        toast.success("Account deleted");
        setDeleteDialogOpen(false);
        setAccountToDelete(null);
      } catch (error) {
        console.error(error);
        toast.error("Failed to delete account", {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setIsDeleting(false);
      }
    });
  };

  return (
    <>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{accountToDelete?.name}&quot; ({accountToDelete?.code})?
              {accountToDelete && (
                <span className="mt-2 block text-destructive">
                  This action cannot be undone. The account will be permanently removed.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setAccountToDelete(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 5 : 4} className="py-6 text-center text-sm">
                No accounts configured. Add your chart of accounts to begin posting entries.
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell className="font-mono text-sm">{account.code}</TableCell>
                <TableCell>{account.name}</TableCell>
                <TableCell className="capitalize">{account.type}</TableCell>
                <TableCell>
                  <Badge variant={account.is_active ? "secondary" : "outline"}>
                    {account.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await toggleAccountStatusAction({
                                accountId: account.id,
                                isActive: !account.is_active,
                              });
                              toast.success("Account updated");
                            } catch (error) {
                              console.error(error);
                              toast.error("Failed to update account");
                            }
                          })
                        }
                      >
                        {account.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isPending || isDeleting}
                        onClick={() => handleDeleteClick(account)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
    </>
  );
}

