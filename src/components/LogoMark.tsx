import logo from "@/assets/logo-mark-sm.png";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return <img src={logo} alt="WorkPlanOS" width={288} height={288} className={cn("h-7 w-7 object-contain", className)} />;
}
