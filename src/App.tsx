import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import PublicProfile from "./pages/PublicProfile";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import GeminiTest from "./test/GeminiTest";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/v1/callback" element={<AuthCallback />} />
            <Route path="/auth/v1/callback/*" element={<AuthCallback />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/u/:username" element={<PublicProfile />} />
            <Route path="/test/gemini" element={<GeminiTest />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
