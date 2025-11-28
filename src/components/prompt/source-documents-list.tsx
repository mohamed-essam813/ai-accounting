import { formatDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SourceDocument } from "@/lib/data/documents";

type Props = {
  documents: SourceDocument[];
};

export function SourceDocumentsList({ documents }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Uploaded</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="max-w-sm">Preview</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                No OCR documents uploaded yet.
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(doc.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{doc.file_name}</span>
                    <span className="text-xs text-muted-foreground">{doc.mime_type}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-sm text-xs text-muted-foreground">
                  {doc.vision_text ? doc.vision_text.slice(0, 240) + (doc.vision_text.length > 240 ? "…" : "") : "No text detected."}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

