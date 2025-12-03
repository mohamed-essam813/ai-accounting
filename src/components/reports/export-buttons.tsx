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
        ...data.rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
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
      toast.success("Report exported to CSV");
    } catch (error) {
      toast.error("Failed to export CSV");
    }
  };

  const exportToPDF = () => {
    toast.info("PDF export coming soon");
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={exportToCSV}>
        <Download className="mr-2 h-4 w-4" />
        Export CSV
      </Button>
      <Button variant="outline" size="sm" onClick={exportToPDF} disabled>
        <Download className="mr-2 h-4 w-4" />
        Export PDF
      </Button>
    </div>
  );
}

