import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard.tsx";
import Auth from "./pages/Auth.tsx";
import Attendance from "./pages/Attendance.tsx";
import Team from "./pages/Team.tsx";
import Reports from "./pages/Reports.tsx";
import StudentProfile from "./pages/StudentProfile.tsx";
import ParentDashboard from "./pages/ParentDashboard.tsx";
import Fees from "./pages/Fees.tsx";
import Notifications from "./pages/Notifications.tsx";
import Subjects from "./pages/Subjects.tsx";
import Exams from "./pages/Exams.tsx";
import Marks from "./pages/Marks.tsx";
import Results from "./pages/Results.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/features/auth/AuthProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/team" element={<Team />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/student/:id" element={<StudentProfile />} />
            <Route path="/parent" element={<ParentDashboard />} />
            <Route path="/fees" element={<Fees />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/marks/:id" element={<Marks />} />
            <Route path="/results" element={<Results />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
