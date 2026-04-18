"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getDraftJournalPreview } from "@/lib/actions/drafts";

export type DraftJournalPreviewState = Awaited<ReturnType<typeof getDraftJournalPreview>>;

type DraftEditStoreValue = {
  draftId: string | null;
  journalPreview: DraftJournalPreviewState | null;
  previewLoading: boolean;
  previewError: string | null;
  refreshJournalPreview: () => Promise<void>;
};

const DraftEditStoreContext = createContext<DraftEditStoreValue | null>(null);

/**
 * Single projection surface for the Edit Draft modal: server-built journal preview is loaded once
 * and shared so Edit Details and Journal Preview stay aligned (no duplicate fetch sources of truth).
 */
export function DraftEditStoreProvider({
  draftId,
  open,
  children,
}: {
  draftId: string | null;
  open: boolean;
  children: ReactNode;
}) {
  const [journalPreview, setJournalPreview] = useState<DraftJournalPreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const refreshJournalPreview = useCallback(async () => {
    if (!draftId) {
      setJournalPreview(null);
      setPreviewError(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await getDraftJournalPreview(draftId);
      setJournalPreview(data);
    } catch (e) {
      setJournalPreview(null);
      setPreviewError(e instanceof Error ? e.message : "Failed to load journal preview");
    } finally {
      setPreviewLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    if (!open || !draftId) {
      setJournalPreview(null);
      setPreviewError(null);
      return;
    }
    void refreshJournalPreview();
  }, [open, draftId, refreshJournalPreview]);

  const value = useMemo(
    () =>
      ({
        draftId,
        journalPreview,
        previewLoading,
        previewError,
        refreshJournalPreview,
      }) satisfies DraftEditStoreValue,
    [draftId, journalPreview, previewLoading, previewError, refreshJournalPreview],
  );

  return <DraftEditStoreContext.Provider value={value}>{children}</DraftEditStoreContext.Provider>;
}

export function useDraftEditStore(): DraftEditStoreValue | null {
  return useContext(DraftEditStoreContext);
}
