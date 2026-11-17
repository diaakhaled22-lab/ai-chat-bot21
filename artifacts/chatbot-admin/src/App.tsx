import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import { useEffect, lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ThemeProvider } from "@/hooks/use-theme";
import { LanguageProvider } from "@/hooks/use-language";

import NotFound from "@/pages/not-found";
import AdminLogin from "@/pages/auth/AdminLogin";
import ClientLogin from "@/pages/auth/ClientLogin";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

// Lazy-loaded Admin Pages
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminClients = lazy(() => import("@/pages/admin/AdminClients"));
const AdminCompanies = lazy(() => import("@/pages/admin/AdminCompanies"));
const AdminChatLogs = lazy(() => import("@/pages/admin/AdminChatLogs"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminSecurity = lazy(() => import("@/pages/admin/AdminSecurity"));
const AdminAuditLogs = lazy(() => import("@/pages/admin/AdminAuditLogs"));
const AdminAttackMonitoring = lazy(() => import("@/pages/admin/AdminAttackMonitoring"));
const AdminTickets = lazy(() => import("@/pages/admin/AdminTickets"));
const AdminBroadcast = lazy(() => import("@/pages/admin/AdminBroadcast"));
const AdminAITester = lazy(() => import("@/pages/admin/AdminAITester"));
const AdminWebhookMessenger = lazy(() => import("@/pages/admin/AdminWebhookMessenger"));
const AdminMalfunctions = lazy(() => import("@/pages/admin/AdminMalfunctions"));
const AdminAiQuota = lazy(() => import("@/pages/admin/AdminAiQuota"));
const AdminPackages = lazy(() => import("@/pages/admin/AdminPackages"));
const AdminBills = lazy(() => import("@/pages/admin/AdminBills"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));

// Lazy-loaded Client Pages
const ClientCompany = lazy(() => import("./pages/client/ClientCompany"));
const ClientPackages = lazy(() => import("./pages/client/ClientPackages"));
const ClientAiModel = lazy(() => import("./pages/client/ClientAiModel"));
const ClientPrompts = lazy(() => import("./pages/client/ClientPrompts"));
const ClientKnowledge = lazy(() => import("@/pages/client/ClientKnowledge"));
const ClientChatLogs = lazy(() => import("@/pages/client/ClientChatLogs"));
const ClientLeads = lazy(() => import("@/pages/client/ClientLeads"));
const ClientSettings = lazy(() => import("@/pages/client/ClientSettings"));
const ClientUsage = lazy(() => import("@/pages/client/ClientUsage"));
const ClientApiTokens = lazy(() => import("@/pages/client/ClientApiTokens"));
const ClientSupport = lazy(() => import("@/pages/client/ClientSupport"));
const ClientMalfunctions = lazy(() => import("@/pages/client/ClientMalfunctions"));
const ClientAIChat = lazy(() => import("@/pages/client/ClientAIChat"));
const ClientUniversalChat = lazy(() => import("@/pages/client/ClientUniversalChat"));
const ClientWebhookHistory = lazy(() => import("@/pages/client/ClientWebhookHistory"));
const ClientWidgetPreview = lazy(() => import("@/pages/client/ClientWidgetPreview"));
const ClientChannels = lazy(() => import("@/pages/client/ClientChannels"));
const ClientDashboard = lazy(() => import("@/pages/client/ClientDashboard"));
const ClientQuickReplies = lazy(() => import("@/pages/client/ClientQuickReplies"));
const ClientTools = lazy(() => import("@/pages/client/ClientTools"));
const ClientNotifications = lazy(() => import("@/pages/client/ClientNotifications"));

function PageLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-muted-foreground animate-in fade-in duration-200">
      <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 3;
      },
    },
  },
});

function ProtectedRoute({ component: Component, allowedRole, ...rest }: any) {
  const { data: user, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if (allowedRole && user.role !== allowedRole) {
        setLocation(user.role === "admin" ? "/admin/dashboard" : "/client/dashboard");
      }
    }
  }, [user, isLoading, allowedRole, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (allowedRole && user.role !== allowedRole)) {
    return null;
  }

  return (
    <DashboardLayout role={user.role}>
      <Suspense fallback={<PageLoadingFallback />}>
        <Component {...rest} />
      </Suspense>
    </DashboardLayout>
  );
}

function RootRedirect() {
  const { data: user, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        setLocation(user.role === "admin" ? "/admin/dashboard" : "/client/dashboard");
      } else {
        setLocation("/login");
      }
    }
  }, [user, isLoading, setLocation]);

  return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={AdminLogin} />
      <Route path="/client-login" component={ClientLogin} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      {/* Admin Routes */}
      <Route path="/admin/dashboard">
        {() => <ProtectedRoute component={AdminDashboard} allowedRole="admin" />}
      </Route>
      <Route path="/admin/clients">
        {() => <ProtectedRoute component={AdminClients} allowedRole="admin" />}
      </Route>
      <Route path="/admin/companies">
        {() => <ProtectedRoute component={AdminCompanies} allowedRole="admin" />}
      </Route>
      <Route path="/admin/packages">
        {() => <ProtectedRoute component={AdminPackages} allowedRole="admin" />}
      </Route>
      <Route path="/admin/bills">
        {() => <ProtectedRoute component={AdminBills} allowedRole="admin" />}
      </Route>
      <Route path="/admin/chat-logs">
        {() => <ProtectedRoute component={AdminChatLogs} allowedRole="admin" />}
      </Route>
      <Route path="/admin/tickets">
        {() => <ProtectedRoute component={AdminTickets} allowedRole="admin" />}
      </Route>
      <Route path="/admin/security">
        {() => <ProtectedRoute component={AdminSecurity} allowedRole="admin" />}
      </Route>
      <Route path="/admin/audit-logs">
        {() => <ProtectedRoute component={AdminAuditLogs} allowedRole="admin" />}
      </Route>
      <Route path="/admin/attack-monitoring">
        {() => <ProtectedRoute component={AdminAttackMonitoring} allowedRole="admin" />}
      </Route>
      <Route path="/admin/settings">
        {() => <ProtectedRoute component={AdminSettings} allowedRole="admin" />}
      </Route>
      <Route path="/admin/broadcast">
        {() => <ProtectedRoute component={AdminBroadcast} allowedRole="admin" />}
      </Route>
      <Route path="/admin/ai-tester">
        {() => <ProtectedRoute component={AdminAITester} allowedRole="admin" />}
      </Route>
      <Route path="/admin/webhook-messenger">
        {() => <ProtectedRoute component={AdminWebhookMessenger} allowedRole="admin" />}
      </Route>
      <Route path="/admin/tools">
        {() => <ProtectedRoute component={ClientTools} allowedRole="admin" />}
      </Route>
      <Route path="/admin/tools/calendar">
        {() => <ProtectedRoute component={ClientTools} allowedRole="admin" />}
      </Route>
      <Route path="/admin/tools/sheets">
        {() => <ProtectedRoute component={ClientTools} allowedRole="admin" />}
      </Route>
      <Route path="/admin/malfunctions">
        {() => <ProtectedRoute component={AdminMalfunctions} allowedRole="admin" />}
      </Route>
      <Route path="/admin/ai-quota">
        {() => <ProtectedRoute component={AdminAiQuota} allowedRole="admin" />}
      </Route>
      <Route path="/admin/notifications">
        {() => <ProtectedRoute component={AdminNotifications} allowedRole="admin" />}
      </Route>

      {/* Client Routes */}
              <Route path="/client">
          {() => <ProtectedRoute component={ClientDashboard} allowedRole="client" />}
        </Route>
        <Route path="/client/dashboard">
          {() => <ProtectedRoute component={ClientDashboard} allowedRole="client" />}
        </Route>
        <Route path="/client/notifications">
          {() => <ProtectedRoute component={ClientNotifications} allowedRole="client" />}
        </Route>
              <Route path="/client/company">
          {() => <ProtectedRoute component={ClientCompany} allowedRole="client" />}
        </Route>
        <Route path="/client/packages">
          {() => <ProtectedRoute component={ClientPackages} allowedRole="client" />}
        </Route>
        <Route path="/client/ai-model">
          {() => <ProtectedRoute component={ClientAiModel} allowedRole="client" />}
        </Route>
        <Route path="/client/prompts">
          {() => <ProtectedRoute component={ClientPrompts} allowedRole="client" />}
        </Route>
      <Route path="/client/knowledge">
        {() => <ProtectedRoute component={ClientKnowledge} allowedRole="client" />}
      </Route>
      <Route path="/client/tools">
        {() => <ProtectedRoute component={ClientTools} allowedRole="client" />}
      </Route>
      <Route path="/client/tools/calendar">
        {() => <ProtectedRoute component={ClientTools} allowedRole="client" />}
      </Route>
      <Route path="/client/tools/sheets">
        {() => <ProtectedRoute component={ClientTools} allowedRole="client" />}
      </Route>
      <Route path="/client/channels">
        {() => <ProtectedRoute component={ClientChannels} allowedRole="client" />}
      </Route>
      <Route path="/client/chat-logs">
        {() => <ProtectedRoute component={ClientChatLogs} allowedRole="client" />}
      </Route>
      <Route path="/client/leads">
        {() => <ProtectedRoute component={ClientLeads} allowedRole="client" />}
      </Route>
      <Route path="/client/support">
        {() => <ProtectedRoute component={ClientSupport} allowedRole="client" />}
      </Route>
      <Route path="/client/api-tokens">
        {() => <ProtectedRoute component={ClientApiTokens} allowedRole="client" />}
      </Route>
      <Route path="/client/usage">
        {() => <ProtectedRoute component={ClientUsage} allowedRole="client" />}
      </Route>
      <Route path="/client/quota">
        {() => <ProtectedRoute component={ClientUsage} allowedRole="client" />}
      </Route>
      <Route path="/client/settings">
        {() => <ProtectedRoute component={ClientSettings} allowedRole="client" />}
      </Route>
      <Route path="/client/ai-chat">
        {() => <ProtectedRoute component={ClientAIChat} allowedRole="client" />}
      </Route>
      <Route path="/client/webhook-history">
        {() => <ProtectedRoute component={ClientWebhookHistory} allowedRole="client" />}
      </Route>
      <Route path="/client/widget-preview">
        {() => <ProtectedRoute component={ClientWidgetPreview} allowedRole="client" />}
      </Route>
      <Route path="/client/universal-chat">
        {() => <ProtectedRoute component={ClientUniversalChat} allowedRole="client" />}
      </Route>
      <Route path="/client/malfunctions">
        {() => <ProtectedRoute component={ClientMalfunctions} allowedRole="client" />}
      </Route>
      <Route path="/client/quick-replies">
        {() => <ProtectedRoute component={ClientQuickReplies} allowedRole="client" />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;

