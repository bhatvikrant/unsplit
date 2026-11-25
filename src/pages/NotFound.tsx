import { Link, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/format";

export function NotFound({ title = "Nothing here", description = "That page doesn't exist, or you don't have access to it." }: { title?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h1 className="text-text text-2xl font-semibold">{title}</h1>
      <p className="text-text-muted mt-2 text-sm">{description}</p>
      <Button className="mt-6" asChild>
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

/** A page whose data failed to load (a stale link, no access): the server's reason, and a way back. */
export function RouteError() {
  return <NotFound title="Couldn't open this" description={errorMessage(useRouteError())} />;
}
