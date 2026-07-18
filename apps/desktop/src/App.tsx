import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { RuntimeWorkspaceProvider } from "@/lib/runtime-workspace";
import { ClientDetailPage } from "@/pages/client-detail";
import { ClientsPage } from "@/pages/clients";
import { MeetingDetailPage } from "@/pages/meeting-detail";
import { MeetingsPage } from "@/pages/meetings";
import { NewMeetingPage } from "@/pages/new-meeting";
import { ProjectDetailPage } from "@/pages/project-detail";
import { RuntimeAgentsPage } from "@/pages/runtime/agents";
import { RuntimeAiPage } from "@/pages/runtime/ai";
import { RuntimeIntegrationsPage } from "@/pages/runtime/integrations";
import { RuntimeLayout } from "@/pages/runtime/layout";
import { RuntimeModulesPage } from "@/pages/runtime/modules";
import { RuntimeOverviewPage } from "@/pages/runtime/overview";

export default function App() {
  return (
    <AuthGate>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/meetings/new" element={<NewMeetingPage />} />
          <Route path="/meetings/:id" element={<MeetingDetailPage />} />
          <Route
            path="/runtime"
            element={
              <RuntimeWorkspaceProvider>
                <RuntimeLayout />
              </RuntimeWorkspaceProvider>
            }
          >
            <Route index element={<RuntimeOverviewPage />} />
            <Route path="ai" element={<RuntimeAiPage />} />
            <Route path="modules" element={<RuntimeModulesPage />} />
            <Route path="integrations" element={<RuntimeIntegrationsPage />} />
            <Route path="agents" element={<RuntimeAgentsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/clients" replace />} />
        </Routes>
      </AppShell>
    </AuthGate>
  );
}
