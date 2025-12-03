import {
  Banknote,
  Bot,
  ChartArea,
  ClipboardList,
  FileText,
  Layers,
  Settings,
  Waypoints,
  BookOpen,
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
    title: "Prompt Workspace",
    href: "/prompt",
    icon: Bot,
    description: "Capture natural language prompts and generate drafts.",
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
    title: "Journals",
    href: "/journals",
    icon: BookOpen,
    description: "Create manual journal entries for accruals, depreciation, and adjustments.",
  },
  {
    title: "Bank Reconciliation",
    href: "/bank",
    icon: Banknote,
    description: "Upload bank CSV files and match transactions.",
  },
  {
    title: "Reports",
    href: "/reports/pnl",
    icon: FileText,
    description: "Profit & Loss and Balance Sheet analytics.",
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

