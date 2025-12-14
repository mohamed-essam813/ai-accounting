"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

type ExportData = {
  headers: string[];
  rows: (string | number)[][];
  title: string;
};

export function ExportButtons({ data }: { data: ExportData }) {
  const exportToCSV = () => {
    try {
      const csvContent = [
        data.headers.join(","),
        ...data.rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `${data.title}-${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Report exported to CSV");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export CSV");
    }
  };

  const exportToExcel = async () => {
    try {
      // Dynamic import to avoid loading the library if not needed
      const XLSX = await import("xlsx");
      
      // Create workbook and worksheet
      const worksheet = XLSX.utils.aoa_to_sheet([
        data.headers,
        ...data.rows.map((row) => row.map((cell) => cell)),
      ]);
      
      // Set column widths
      const maxWidths = data.headers.map((_, colIndex) => {
        const columnData = [
          data.headers[colIndex],
          ...data.rows.map((row) => String(row[colIndex] ?? "")),
        ];
        return Math.max(...columnData.map((cell) => String(cell).length), 10);
      });
      
      worksheet["!cols"] = maxWidths.map((w) => ({ wch: Math.min(w + 2, 50) }));
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
      
      // Generate Excel file
      XLSX.writeFile(workbook, `${data.title}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Report exported to Excel");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export Excel", {
        description: "Please install xlsx package: npm install xlsx",
      });
    }
  };

  const exportToPDF = async () => {
    try {
      // Dynamic import to avoid loading the library if not needed
      const { jsPDF } = await import("jspdf");
      const { autoTable } = await import("jspdf-autotable");
      
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(16);
      doc.text(data.title.replace(/-/g, " "), 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
      
      // Prepare table data
      const tableData = data.rows.map((row) => 
        row.map((cell) => {
          if (typeof cell === "number") {
            return cell.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
          return String(cell);
        })
      );
      
      // Add table using autoTable function
      autoTable(doc, {
        head: [data.headers],
        body: tableData,
        startY: 28,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      
      // Save PDF
      doc.save(`${data.title}-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Report exported to PDF");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export PDF", {
        description: error instanceof Error ? error.message : "Please install jspdf and jspdf-autotable packages",
      });
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={exportToCSV}>
        <Download className="mr-2 h-4 w-4" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={exportToExcel}>
        <Download className="mr-2 h-4 w-4" />
        Excel
      </Button>
      <Button variant="outline" size="sm" onClick={exportToPDF}>
        <Download className="mr-2 h-4 w-4" />
        PDF
      </Button>
    </div>
  );
}

