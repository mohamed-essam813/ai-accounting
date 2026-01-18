/**
 * Prompt Workspace Wrapper
 * Handles the layout with input on left and inline draft review panel on right
 */

"use client";

import { useState } from "react";
import { UnifiedInput } from "./unified-input";
import { InlineDraftReviewPanel } from "./inline-draft-review";
import type { SourceDocument } from "@/lib/data/documents";
import type { UserRole } from "@/lib/auth";
import type { DraftPayload } from "@/lib/ai/schema";
import type { Database } from "@/lib/database.types";
import type { InventoryItem } from "@/lib/data/inventory";

type Account = Database["public"]["Tables"]["chart_of_accounts"]["Row"];

type DraftData = {
  id: string;
  intent: string;
  status: string;
  confidence: number | null;
  entities: DraftPayload["entities"];
  created_at: string;
};

type DraftResponse = {
  draft: DraftData;
  documents: SourceDocument[];
  accounts: Account[];
  inventoryItems?: InventoryItem[];
  user: {
    role: UserRole;
  };
};

export function PromptWorkspace() {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftData, setDraftData] = useState<DraftResponse | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);

  const fetchDraftData = async (id: string) => {
    setIsLoadingDraft(true);
    try {
      const response = await fetch(`/api/drafts/${id}`);
      if (response.ok) {
        const data: DraftResponse = await response.json();
        setDraftData(data);
      }
    } catch (error) {
      // Silently handle fetch errors
    } finally {
      setIsLoadingDraft(false);
    }
  };

  const handleDraftCreated = (id: string) => {
    setDraftId(id);
    fetchDraftData(id);
  };

  const handleDraftUpdated = () => {
    if (draftId) {
      fetchDraftData(draftId);
    }
  };

  const handleClosePanel = () => {
    setDraftId(null);
    setDraftData(null);
  };

  // If draft is created, show side-by-side layout
  if (draftId && draftData && !isLoadingDraft) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <UnifiedInput onDraftCreated={handleDraftCreated} />
        <div>
          <InlineDraftReviewPanel
            draftId={draftId}
            initialDraft={draftData.draft}
            documents={draftData.documents}
            accounts={draftData.accounts}
            inventoryItems={draftData.inventoryItems || []}
            userRole={draftData.user.role}
            onClose={handleClosePanel}
            onDraftUpdated={handleDraftUpdated}
          />
        </div>
      </div>
    );
  }

  // Show loading state if we have draftId but data is loading
  if (draftId && isLoadingDraft) {
    return (
      <div>
        <UnifiedInput onDraftCreated={handleDraftCreated} />
        <div className="mt-4 p-4 border rounded-md bg-muted/50">
          <p className="text-sm text-muted-foreground">Loading draft preview...</p>
        </div>
      </div>
    );
  }

  // Default: just show input
  return <UnifiedInput onDraftCreated={handleDraftCreated} />;
}

