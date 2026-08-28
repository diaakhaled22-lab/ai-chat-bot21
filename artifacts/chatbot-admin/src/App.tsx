import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import { useEffect } from "react";
import { ThemeProvider } from "@/hooks/use-theme";
import { LanguageProvider } from "@/hooks/use-language";

import NotFound from "@/pages/not-found";
import AdminLogin from "@/pages/auth/AdminLogin";
import ClientLogin from "@/pages/auth/ClientLogin";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminClients from "@/pages/admin/AdminClients";
import AdminCompanies from "@/pages/admin/AdminCompanies";
import AdminChatLogs from "@/pages/admin/AdminChatLogs";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminSecurity from "@/pages/admin/AdminSecurity";
import AdminTickets from "@/pages/admin/AdminTickets";
import AdminBroadcast from "@/pages/admin/AdminBroadcast";
import AdminAITester from "@/pages/admin/AdminAITester";
import AdminWebhookMessenger from "@/pages/admin/AdminWebhookMessenger";

import ClientCompany from "@/pages/client/ClientCompany";
import ClientChatLogs from "@/pages/client/ClientChatLogs";
import ClientSettings from "@/pages/client/ClientSettings";
import ClientUsage from "@/pages/client/ClientUsage";
import ClientSupport from "@/pages/client/ClientSupport";
import ClientAIChat from "@/pages/client/ClientAIChat";
import ClientUniversalChat from "@/pages/client/ClientUniversalChat";
import ClientWebhookHistory from "@/pages/client/ClientWebhookHistory";
import ClientWidgetPreview from "@/pages/client/ClientWidgetPreview";
import ClientWordPress from "@/pages/client/ClientWordPress";
import ClientChannels from "@/pages/client/ClientChannels";

import { DashboardLayout } from "@/components/layout/DashboardLayout";

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
        setLocation(user.role === "admin" ? "/admin/dashboard" : "/client/company");
      }
    }
  }, [user, isLoading, allowedRole, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }

  if (!user || (allowedRole && user.role !== allowedRole)) {
    return null;
  }

  return (
    <DashboardLayout role={user.role}>
      <Component {...rest} />
    </DashboardLayout>
  );
}

function RootRedirect() {
  const { data: user, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        setLocation(user.role === "admin" ? "/admin/dashboard" : "/client/company");
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
      <Route path="/admin/chat-logs">
        {() => <ProtectedRoute component={AdminChatLogs} allowedRole="admin" />}
      </Route>
      <Route path="/admin/tickets">
        {() => <ProtectedRoute component={AdminTickets} allowedRole="admin" />}
      </Route>
      <Route path="/admin/security">
        {() => <ProtectedRoute component={AdminSecurity} allowedRole="admin" />}
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

      {/* Client Routes */}
      <Route path="/client/company">
        {() => <ProtectedRoute component={ClientCompany} allowedRole="client" />}
      </Route>
      <Route path="/client/wordpress">
        {() => <ProtectedRoute component={ClientWordPress} allowedRole="client" />}
      </Route>
      <Route path="/client/channels">
        {() => <ProtectedRoute component={ClientChannels} allowedRole="client" />}
      </Route>
      <Route path="/client/chat-logs">
        {() => <ProtectedRoute component={ClientChatLogs} allowedRole="client" />}
      </Route>
      <Route path="/client/support">
        {() => <ProtectedRoute component={ClientSupport} allowedRole="client" />}
      </Route>
      <Route path="/client/usage">
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
