import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  createRoot(document.getElementById("root")!).render(
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Configuration missing</h1>
        <p style={{ fontSize: 14, opacity: 0.75 }}>
          Backend URL and key are not set. Reconnect Lovable Cloud from your project settings to restore access.
        </p>
      </div>
    </div>
  );
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
