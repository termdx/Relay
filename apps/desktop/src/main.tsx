import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import "./index.css";

// Dark-first: the product lives next to a terminal and an IDE.
document.documentElement.classList.add("dark");

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <App />
        </HashRouter>
        <Toaster theme="dark" position="bottom-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
