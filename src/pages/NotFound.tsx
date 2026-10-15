import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-text text-2xl font-semibold">Nothing here</h1>
      <p className="text-text-muted mt-2 text-sm">That page doesn't exist, or you don't have access to it.</p>
      <Button className="mt-6" asChild>
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
