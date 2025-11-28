"use client";

import { useTransition } from "react";
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
import { formatDate } from "@/lib/format";
import { revokeInviteAction } from "@/lib/actions/users";
import { toast } from "sonner";

type Invite = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
};

type Props = {
  invites: Invite[];
};

export function InvitesTable({ invites }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Invited</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                No pending invites.
              </TableCell>
            </TableRow>
          ) : (
            invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell>{invite.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{invite.role}</Badge>
                </TableCell>
                <TableCell>{formatDate(invite.created_at)}</TableCell>
                <TableCell>{formatDate(invite.expires_at)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await revokeInviteAction({ inviteId: invite.id });
                          toast.success("Invite revoked");
                        } catch (error) {
                          console.error(error);
                          toast.error("Failed to revoke invite");
                        }
                      })
                    }
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

