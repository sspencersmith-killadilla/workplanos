import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/b/$boardId")({
  component: BoardLayout,
});

function BoardLayout() {
  return <Outlet />;
}