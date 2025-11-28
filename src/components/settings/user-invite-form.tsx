"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteUserAction } from "@/lib/actions/users";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "accountant", "business_user", "auditor"]),
});

type FormValues = z.infer<typeof schema>;

export function UserInviteForm() {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "business_user" },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        await inviteUserAction(values);
        toast.success("Invitation created");
        form.reset({ email: "", role: values.role });
      } catch (error) {
        console.error(error);
        toast.error("Failed to create invite", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <form className="grid gap-4 md:grid-cols-3" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="md:col-span-2 space-y-2">
        <label className="text-sm font-medium">Email</label>
        <Input placeholder="user@example.com" {...form.register("email")} />
        {form.formState.errors.email ? (
          <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Role</label>
        <Select
          defaultValue={form.getValues("role")}
          onValueChange={(value) => form.setValue("role", value as FormValues["role"])}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="accountant">Accountant</SelectItem>
            <SelectItem value="business_user">Business User</SelectItem>
            <SelectItem value="auditor">Auditor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Inviting..." : "Send Invite"}
        </Button>
      </div>
    </form>
  );
}

