import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { TelemetryProvider } from "./contexts/TelemetryContext";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./pages/Layout";
import Overview from "./pages/Overview";
import Devices from "./pages/Devices";
import Captures from "./pages/Captures";
import Events from "./pages/Events";
import Login from "./pages/Login";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <AuthProvider>
      <TelemetryProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Overview />} />
              <Route path="devices" element={<Devices />} />
              <Route path="captures" element={<Captures />} />
              <Route path="events" element={<Events />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster theme="dark" richColors />
      </TelemetryProvider>
    </AuthProvider>
  );
}
