import { PresenterHome } from "@/features/presenter/components/presenter-home";
import { useNavigate } from "react-router-dom";

export function PresenterPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <PresenterHome onOpen={(id) => navigate(`/presenter/${id}`)} />
    </div>
  );
}
