/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth-context';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarTrigger, SidebarRail, useSidebar } from '@/components/ui/sidebar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserRole } from './types';
import { VendorPortal } from './pages/VendorPortal';
import { Home, ClipboardList, Users, Settings as SettingsIcon, Bot, LogOut, Network, Briefcase, ShoppingCart, FileText, Send, Database, Menu } from 'lucide-react';
import { Dashboard } from './pages/Dashboard';
import { AgentChat } from './pages/AgentChat';
import { Suppliers } from './pages/Suppliers';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { WorkflowDesigner } from './pages/WorkflowDesigner';
import { Settings } from './pages/Settings';
import { ProcurementCatalog } from './pages/ProcurementCatalog';
import { Requisitions } from './pages/Requisitions';
import { RFQs } from './pages/RFQs';
import { RequestTracker } from './pages/RequestTracker';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppBreadcrumb } from './components/AppBreadcrumb';
import { NotificationsDropdown } from './components/NotificationsDropdown';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { DataProvider } from './lib/data-context';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';

import { KnowledgeBase } from './pages/KnowledgeBase';

function GlobalShortcuts() {
  useKeyboardShortcuts();
  return null;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function AppSidebar() {
  const { logout, user, profile, updateRole } = useAuth();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2 border-b">
        <div className="flex items-center gap-2 font-bold text-xl group-data-[collapsible=icon]:justify-center">
          <img src="/procurely-icon.svg" alt="Procurely" className="h-6 w-6 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Procurely</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="px-2 pt-4 gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Dashboard" render={<a href="/app" />}>
              <Home />
              <span>Dashboard</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="AI Agent (⌘K / Ctrl+K)" render={<a href="/app/agent" />}>
              <Bot />
              <span>AI Agent</span>
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 group-data-[collapsible=icon]:hidden">
                <span className="text-xs">⌘</span>K
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <div className="pt-4 pb-1 group-data-[collapsible=icon]:hidden">
            <p className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Employee / Requester</p>
          </div>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Procurement Catalog" render={<a href="/app/catalog" />}>
              <ShoppingCart />
              <span>Procurement Catalog</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Purchase Requisitions (⌘N / Ctrl+N for New)" render={<a href="/app/requisitions" />}>
              <FileText />
              <span>Purchase Requisitions</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <div className="pt-4 pb-1 group-data-[collapsible=icon]:hidden">
            <p className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Procurement & Sourcing</p>
          </div>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Suppliers" render={<a href="/app/suppliers" />}>
              <Users />
              <span>Supplier Directory</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="RFQs & Bids" render={<a href="/app/rfqs" />}>
              <Send />
              <span>RFQs & Bids</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Workflows" render={<a href="/app/workflows" />}>
              <Network />
              <span>Workflows</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <div className="pt-4 pb-1 group-data-[collapsible=icon]:hidden">
            <p className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">External</p>
          </div>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Vendor Portal" render={<a href="/app/vendors" />}>
              <Briefcase />
              <span>Vendor Portal</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <div className="pt-4 pb-1 group-data-[collapsible=icon]:hidden">
            <p className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">System</p>
          </div>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Knowledge Base" render={<a href="/app/knowledge-base" />}>
              <Database />
              <span>Knowledge Base</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" render={<a href="/app/settings" />}>
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 group-data-[collapsible=icon]:p-2 border-t">
        <div className="flex flex-col gap-4 group-data-[collapsible=icon]:gap-2">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shrink-0">
              {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-medium truncate">{user?.displayName || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <Select value={profile?.role || 'Requestor'} onValueChange={(val) => updateRole(val as UserRole)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Requestor">Requestor</SelectItem>
                <SelectItem value="Buyer">Buyer</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="w-full justify-start gap-2 group-data-[collapsible=icon]:hidden" onClick={logout}>
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Logout</span>
          </Button>
          <Button variant="outline" size="icon" className="hidden group-data-[collapsible=icon]:flex w-8 h-8 shrink-0" onClick={logout}>
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Logout</span>
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AppLayout() {
  const { toggleSidebar } = useSidebar();
  
  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden h-screen">
      <header className="md:hidden flex h-14 items-center justify-between border-b bg-background px-4 shrink-0">
        <div className="flex items-center gap-2 font-bold text-lg">
          <img src="/procurely-icon.svg" alt="Procurely" className="h-5 w-5" />
          <span>Procurely</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsDropdown />
          <Button variant="ghost" size="icon" onClick={() => toggleSidebar()}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle Menu</span>
          </Button>
        </div>
      </header>

      <header className="hidden md:flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6 shrink-0">
        <SidebarTrigger />
        <div className="w-px h-4 bg-border mx-2" />
        <AppBreadcrumb />
        <div className="ml-auto flex items-center gap-2">
          <NotificationsDropdown />
        </div>
      </header>
      
      <main className="flex-1 flex flex-col overflow-hidden bg-muted/20 min-h-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/catalog" element={<ProcurementCatalog />} />
          <Route path="/requisitions" element={<Requisitions />} />
          <Route path="/rfqs" element={<RFQs />} />
          <Route path="/tracker/:id" element={<RequestTracker />} />
          <Route path="/vendors" element={<VendorPortal />} />
          <Route path="/workflows" element={<WorkflowDesigner />} />
          <Route path="/knowledge-base" element={<KnowledgeBase />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <DataProvider>
          <Router>
            <GlobalShortcuts />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/app/agent" element={
                <PrivateRoute>
                  <AgentChat />
                </PrivateRoute>
              } />
              <Route path="/app/*" element={
                <PrivateRoute>
                  <SidebarProvider>
                    <AppSidebar />
                    <AppLayout />
                  </SidebarProvider>
                </PrivateRoute>
              } />
            </Routes>
            <Toaster />
          </Router>
        </DataProvider>
      </AuthProvider>
    </TooltipProvider>
  );
}
