import { Outlet } from "react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DialogProvider } from "@/components/dialogs/DialogProvider";

export function AppShell() {
  return (
    <DialogProvider>
      <div className="min-h-dvh">
        <TopBar />
        <div className="mx-auto flex w-full max-w-[1200px]">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8" id="main">
            <Outlet />
          </main>
        </div>
      </div>
    </DialogProvider>
  );
}
