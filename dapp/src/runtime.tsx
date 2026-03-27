import { QueryClient } from "@tanstack/react-query";
import { EveFrontierProvider } from "@evefrontier/dapp-kit";
import App from "./App.tsx";

const queryClient = new QueryClient();

export function RuntimeRoot() {
  return (
    <EveFrontierProvider queryClient={queryClient}>
      <App />
    </EveFrontierProvider>
  );
}
