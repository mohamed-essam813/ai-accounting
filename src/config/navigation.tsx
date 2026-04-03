import {
  Banknote,
  Bot,
  ChartArea,
  ClipboardList,
  FileText,
  History,
  Layers,
  Settings,
  Waypoints,
  BookOpen,
  Users,
  Package,
  Factory,
  Receipt,
  ScrollText,
  Wallet,
} from "lucide-react";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
};

export const mainNavigation: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: ChartArea,
    description: "KPIs across drafts, approvals, and ledger balances.",
  },
  {
    title: "Timeline",
    href: "/timeline",
    icon: History,
    description: "Chronological business activity linked to the ledger.",
  },
  {
    title: "Record activity",
    href: "/prompt",
    icon: Bot,
    description: "Log sales, bills, and payments with simple forms.",
  },
  {
    title: "Drafts & Approvals",
    href: "/drafts",
    icon: ClipboardList,
    description: "Review, edit, and approve AI-generated entries.",
  },
  {
    title: "Chart of Accounts",
    href: "/accounts",
    icon: Layers,
    description: "Maintain accounts and control double-entry mapping.",
  },
  {
    title: "Contacts",
    href: "/contacts",
    icon: Users,
    description: "Manage customers, vendors, and other contacts with auto-generated codes.",
  },
  {
    title: "Invoices",
    href: "/invoices",
    icon: Receipt,
    description: "Posted invoices and PDF download (BRD).",
  },
  {
    title: "Bills",
    href: "/bills",
    icon: ScrollText,
    description: "Posted supplier bills and PDF download.",
  },
  {
    title: "Payments",
    href: "/payments",
    icon: Wallet,
    description: "Posted supplier payments (bank/cash).",
  },
  {
    title: "Receipts",
    href: "/receipts",
    icon: Wallet,
    description: "Posted customer receipts (bank/cash).",
  },
  {
    title: "Inventory",
    href: "/inventory",
    icon: Package,
    description: "Track inventory items with FIFO or Weighted Average valuation.",
  },
  {
    title: "Fixed Assets",
    href: "/fixed-assets",
    icon: Factory,
    description: "Asset register, depreciation, and disposal (PPE).",
  },
  {
    title: "Journals",
    href: "/journals",
    icon: BookOpen,
    description: "Create manual journal entries for accruals, depreciation, and adjustments.",
  },
  {
    title: "Bank Reconciliation",
    href: "/bank",
    icon: Banknote,
    description: "Upload bank statement PDFs and match transactions.",
  },
  {
    title: "Reports",
    href: "/reports/pnl",
    icon: FileText,
    description: "Profit & Loss and Balance Sheet analytics.",
  },
  {
    title: "General Ledger",
    href: "/ledger",
    icon: BookOpen,
    description: "View all transactions by account. Trace numbers to source.",
  },
  {
    title: "Audit Log",
    href: "/audit",
    icon: Waypoints,
    description: "Trace every action for compliance.",
  },
  {
    title: "Tenant Settings",
    href: "/settings/tenant",
    icon: Settings,
    description: "Manage tenant profile and user roles.",
  },
];

export type { NavItem };

