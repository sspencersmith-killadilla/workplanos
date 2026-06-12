import { createFileRoute } from "@tanstack/react-router";
import { BoardCanvas } from "@/components/board/board-canvas";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/b/$boardId/")({
  component: BoardIndexPage,
});

function BoardIndexPage() {
  const { workspaceId, boardId } = Route.useParams();

  return <BoardCanvas workspaceId={workspaceId} boardId={boardId} />;
}