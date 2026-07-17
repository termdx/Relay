import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { MeetingDetailPage } from "@/pages/meeting-detail";
import { MeetingsPage } from "@/pages/meetings";
import { NewMeetingPage } from "@/pages/new-meeting";
import { RuntimePage } from "@/pages/runtime";

export default function App() {
  return (
    <AuthGate>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/meetings" replace />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/meetings/new" element={<NewMeetingPage />} />
          <Route path="/meetings/:id" element={<MeetingDetailPage />} />
          <Route path="/runtime" element={<RuntimePage />} />
          <Route path="*" element={<Navigate to="/meetings" replace />} />
        </Routes>
      </AppShell>
    </AuthGate>
  );
}
