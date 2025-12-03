"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useState, useTransition } from "react";

type Props = {
  initialSearch?: string;
};

export function AuditLogSearch({ initialSearch }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [isPending, startTransition] = useTransition();

  const handleSearch = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) {
        params.set("search", search.trim());
      } else {
        params.delete("search");
      }
      router.push(`/audit?${params.toString()}`);
    });
  };

  const handleClear = () => {
    setSearch("");
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("search");
      router.push(`/audit?${params.toString()}`);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by invoice number, bill number, user email, or action..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-9"
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Button onClick={handleSearch} disabled={isPending}>
        {isPending ? "Searching..." : "Search"}
      </Button>
    </div>
  );
}

