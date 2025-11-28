"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateTenantProfileAction } from "@/lib/actions/tenant";
import { toast } from "sonner";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
});

type FormValues = z.infer<typeof schema>;

export function TenantProfileForm({ defaultName }: { defaultName: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: defaultName },
  });

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        await updateTenantProfileAction(values);
        toast.success("Tenant updated");
      } catch (error) {
        console.error(error);
        toast.error("Failed to update tenant", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    });
  };

  return (
    <form className="flex items-end gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="flex-1 space-y-2">
        <label className="text-sm font-medium">Tenant Name</label>
        <Input {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}

