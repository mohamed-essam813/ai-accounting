/**
 * Accounts Tabs Component
 * Provides filtering by account type with sub-tabs for Assets and Liabilities
 */

"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AccountsTable } from "./accounts-table";

type Account = {
  id: string;
  name: string;
  code: string;
  type: string;
  category: "current" | "non_current" | null;
  is_active: boolean;
  account_classification?: string | null;
};

type Props = {
  accounts: Account[];
  canManage: boolean;
};

type TabValue = "all" | "asset" | "liability" | "equity" | "revenue" | "expense";
type SubTabValue = "current" | "non_current" | "all";

export function AccountsTabs({ accounts, canManage }: Props) {
  const [activeTab, setActiveTab] = useState<TabValue>("all");
  const [assetSubTab, setAssetSubTab] = useState<SubTabValue>("all");
  const [liabilitySubTab, setLiabilitySubTab] = useState<SubTabValue>("all");

  // Filter accounts based on selected tab
  const getFilteredAccounts = (): Account[] => {
    let filtered = accounts;

    // Filter by main type
    if (activeTab !== "all") {
      filtered = filtered.filter((acc) => acc.type === activeTab);
    }

    // Filter by category for assets and liabilities
    if (activeTab === "asset") {
      if (assetSubTab === "current") {
        filtered = filtered.filter((acc) => acc.category === "current");
      } else if (assetSubTab === "non_current") {
        filtered = filtered.filter((acc) => acc.category === "non_current");
      }
      // "all" shows both current and non-current
    }

    if (activeTab === "liability") {
      if (liabilitySubTab === "current") {
        filtered = filtered.filter((acc) => acc.category === "current");
      } else if (liabilitySubTab === "non_current") {
        filtered = filtered.filter((acc) => acc.category === "non_current");
      }
      // "all" shows both current and non-current
    }

    return filtered;
  };

  const filteredAccounts = getFilteredAccounts();

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="asset">Assets</TabsTrigger>
        <TabsTrigger value="liability">Liabilities</TabsTrigger>
        <TabsTrigger value="equity">Equity</TabsTrigger>
        <TabsTrigger value="revenue">Revenue</TabsTrigger>
        <TabsTrigger value="expense">Expenses</TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="mt-6">
        <AccountsTable accounts={filteredAccounts} canManage={canManage} showCategory={true} />
      </TabsContent>

      <TabsContent value="asset" className="mt-6">
        <div className="space-y-4">
          <Tabs value={assetSubTab} onValueChange={(v) => setAssetSubTab(v as SubTabValue)} className="w-full">
            <TabsList>
              <TabsTrigger value="all">All Assets</TabsTrigger>
              <TabsTrigger value="current">Current Assets</TabsTrigger>
              <TabsTrigger value="non_current">Non-Current Assets</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <AccountsTable accounts={getFilteredAccounts()} canManage={canManage} showCategory={true} />
            </TabsContent>
            <TabsContent value="current" className="mt-4">
              <AccountsTable accounts={getFilteredAccounts()} canManage={canManage} showCategory={true} />
            </TabsContent>
            <TabsContent value="non_current" className="mt-4">
              <AccountsTable accounts={getFilteredAccounts()} canManage={canManage} showCategory={true} />
            </TabsContent>
          </Tabs>
        </div>
      </TabsContent>

      <TabsContent value="liability" className="mt-6">
        <div className="space-y-4">
          <Tabs value={liabilitySubTab} onValueChange={(v) => setLiabilitySubTab(v as SubTabValue)} className="w-full">
            <TabsList>
              <TabsTrigger value="all">All Liabilities</TabsTrigger>
              <TabsTrigger value="current">Current Liabilities</TabsTrigger>
              <TabsTrigger value="non_current">Non-Current Liabilities</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <AccountsTable accounts={getFilteredAccounts()} canManage={canManage} showCategory={true} />
            </TabsContent>
            <TabsContent value="current" className="mt-4">
              <AccountsTable accounts={getFilteredAccounts()} canManage={canManage} showCategory={true} />
            </TabsContent>
            <TabsContent value="non_current" className="mt-4">
              <AccountsTable accounts={getFilteredAccounts()} canManage={canManage} showCategory={true} />
            </TabsContent>
          </Tabs>
        </div>
      </TabsContent>

      <TabsContent value="equity" className="mt-6">
        <AccountsTable accounts={filteredAccounts} canManage={canManage} showCategory={false} />
      </TabsContent>

      <TabsContent value="revenue" className="mt-6">
        <AccountsTable accounts={filteredAccounts} canManage={canManage} showCategory={false} />
      </TabsContent>

      <TabsContent value="expense" className="mt-6">
        <AccountsTable accounts={filteredAccounts} canManage={canManage} showCategory={false} />
      </TabsContent>
    </Tabs>
  );
}

