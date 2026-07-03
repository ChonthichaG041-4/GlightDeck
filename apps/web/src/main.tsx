import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Treat "missing" and "still the placeholder from .env.example" the same way -
// ClerkProvider throws a hard, uncatchable error for either, so we short-circuit
// before ever rendering it and show an actionable setup screen instead.
const isValidClerkKey = !!clerkPubKey && clerkPubKey.startsWith("pk_") && !clerkPubKey.includes("xxxx");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function ClerkSetupNeeded() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "ui-sans-serif, system-ui, sans-serif", padding: 24,
    }}>
      <div style={{ maxWidth: 560, border: "1px solid #e5e7eb", borderRadius: 12, padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Clerk publishable key is missing</h1>
        <p style={{ color: "#6b7280", marginBottom: 16, lineHeight: 1.6 }}>
          <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>apps/web/.env</code> is empty or still the
          placeholder value from <code>.env.example</code>.
        </p>
        <ol style={{ color: "#374151", lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Go to <a href="https://dashboard.clerk.com/last-active?path=api-keys" target="_blank" rel="noreferrer">dashboard.clerk.com → API Keys</a></li>
          <li>Copy the <b>Publishable key</b> (starts with <code>pk_test_</code> or <code>pk_live_</code>)</li>
          <li>Paste it into <code>apps/web/.env</code> as <code>VITE_CLERK_PUBLISHABLE_KEY=...</code></li>
          <li>Copy the <b>Secret key</b> into <code>apps/server/.env</code> as <code>CLERK_SECRET_KEY=...</code></li>
          <li>Restart <code>npm run dev</code> (Vite only reads .env on startup)</li>
        </ol>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isValidClerkKey ? (
      <ClerkProvider publishableKey={clerkPubKey} signInUrl="/sign-in" signUpUrl="/sign-up">
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ClerkProvider>
    ) : (
      <ClerkSetupNeeded />
    )}
  </StrictMode>
);
