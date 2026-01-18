"use client";

import { useEffect, useState } from "react";
import { getContactStatementAction } from "@/lib/actions/contacts";
import type { StatementTransaction } from "@/lib/data/contacts";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { Database } from "@/lib/database.types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];

type Props = {
  contact: Contact;
};

export function StatementOfAccount({ contact }: Props) {
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination
  const {
    currentItems: paginatedTransactions,
    currentPage,
    totalPages,
    goToPage,
    itemsPerPage,
    setItemsPerPage,
  } = usePagination({ data: transactions, itemsPerPage: 50 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getContactStatementAction(contact.id)
      .then((data) => {
        if (!cancelled) {
          setTransactions(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load statement");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  const handleExportCSV = () => {
    // Create CSV content - export all transactions, not just current page
    const headers = ["Date", "Doc #", "Description", "Debit", "Credit", "Balance"];
    const rows = transactions.map((t) => [
      t.date,
      t.document_number || "",
      t.description,
      t.debit.toFixed(2),
      t.credit.toFixed(2),
      t.balance.toFixed(2),
    ]);
    
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Statement_${contact.code}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = async () => {
    try {
      // Dynamic import to avoid loading the library if not needed
      const XLSX = await import("xlsx");
      
      const headers = ["Date", "Doc #", "Description", "Debit", "Credit", "Balance"];
      const rows = transactions.map((t) => [
        t.date,
        t.document_number || "",
        t.description,
        t.debit,
        t.credit,
        t.balance,
      ]);
      
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");
      
      XLSX.writeFile(
        workbook,
        `Statement_${contact.code}_${new Date().toISOString().split("T")[0]}.xlsx`
      );
    } catch (error) {
      console.error(error);
      alert("Failed to export Excel. Please ensure xlsx package is installed.");
    }
  };

  const handleExportPDF = async () => {
    try {
      // Dynamic import to avoid loading the library if not needed
      const { jsPDF } = await import("jspdf");
      const { autoTable } = await import("jspdf-autotable");
      
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(16);
      doc.text(`Statement of Account - ${contact.name}`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Contact Code: ${contact.code}`, 14, 22);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
      
      // Prepare table data
      const tableData = transactions.map((t) => [
        t.date,
        t.document_number || "",
        t.description,
        t.debit.toFixed(2),
        t.credit.toFixed(2),
        t.balance.toFixed(2),
      ]);
      
      // Add total row
      const currentBalance = transactions.length > 0 
        ? transactions[transactions.length - 1].balance 
        : 0;
      tableData.push([
        "",
        "",
        "Current Balance",
        "",
        "",
        currentBalance.toFixed(2),
      ]);
      
      // Add table using autoTable function
      autoTable(doc, {
        head: [["Date", "Doc #", "Description", "Debit", "Credit", "Balance"]],
        body: tableData,
        startY: 35,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      
      // Save PDF
      doc.save(`Statement_${contact.code}_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Failed to export PDF. Please ensure jspdf and jspdf-autotable packages are installed.");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statement of Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statement of Account</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const currentBalance = transactions.length > 0 
    ? transactions[transactions.length - 1].balance 
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Statement of Account</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {contact.name} ({contact.code})
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No transactions found for this contact.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTransactions.map((transaction, idx) => {
                    // Calculate running balance for paginated items
                    const prevTransactions = transactions.slice(0, (currentPage - 1) * itemsPerPage + idx);
                    const runningBalance = prevTransactions.reduce((sum, t) => sum + t.debit - t.credit, 0) + transaction.debit - transaction.credit;
                    
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          {formatDate(transaction.date)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="text-sm">{transaction.description}</div>
                            {transaction.document_number && (
                              <div className="text-xs text-muted-foreground font-mono">
                                {transaction.document_number}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {transaction.debit > 0 ? formatCurrency(transaction.debit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {transaction.credit > 0 ? formatCurrency(transaction.credit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {formatCurrency(runningBalance)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {paginatedTransactions.length > 0 && currentPage === totalPages && (
                    <TableRow className="bg-muted font-semibold">
                      <TableCell colSpan={4} className="text-right">
                        Current Balance
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(currentBalance)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {transactions.length > 0 && (
              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={transactions.length}
                itemsPerPage={itemsPerPage}
                onPageChange={goToPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
