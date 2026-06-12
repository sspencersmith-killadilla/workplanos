import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/")({
  component: WorkspaceHome,
});

function WorkspaceHome() {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center max-w-md">
        <div className="mx-auto h-12 w-12 grid place-items-center rounded-xl bg-muted">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-lg font-medium tracking-tight">Pick a board</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a board from the sidebar, or create a new one to get started.
        </p>
      </div>
    </div>
  );
}