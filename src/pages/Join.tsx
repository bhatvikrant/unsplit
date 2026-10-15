import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { GroupAvatar, GROUP_TYPE_LABELS } from "@/components/common/Avatars";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { errorMessage, pluralize } from "@/lib/format";

export function Join() {
  const { code = "" } = useParams();
  const [params] = useSearchParams();
  const info = useQuery(api.groups.inviteInfo, { code });
  const join = useMutation(api.groups.joinByCode);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const email = params.get("email");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo size={30} />
      </Link>
      <div className="bg-bg w-full max-w-sm rounded-lg border p-6 text-center shadow-card">
        {info === undefined ? (
          <p className="text-text-muted text-sm">Checking this invite…</p>
        ) : info === null ? (
          <>
            <h1 className="text-text text-lg font-semibold">This link doesn't work</h1>
            <p className="text-text-muted mt-2 text-sm">The invite may have been reset or the group deleted. Ask whoever sent it for a new link.</p>
            <Button className="mt-5" asChild>
              <Link to="/dashboard">Go to Unsplit</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="mb-3 flex justify-center">
              <GroupAvatar group={info} size="xl" />
            </div>
            <h1 className="text-text text-lg font-semibold">{info.name}</h1>
            <p className="text-text-muted mt-1 text-sm">
              {GROUP_TYPE_LABELS[info.type]} · {pluralize(info.memberCount, "member")} · started by {info.createdByName}
            </p>
            <Authenticated>
              {info.alreadyMember ? (
                <Button className="mt-5 w-full" onClick={() => navigate(`/groups/${info.groupId}`)}>
                  Open group
                </Button>
              ) : (
                <Button
                  className="mt-5 w-full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const id = await join({ code });
                      navigate(`/groups/${id}`);
                    } catch (e) {
                      toast.error(errorMessage(e));
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Joining…" : "Join this group"}
                </Button>
              )}
            </Authenticated>
            <Unauthenticated>
              <p className="text-text-muted mt-4 text-sm">Sign up or log in to join.</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button asChild>
                  <Link to={`/signup?redirect=${encodeURIComponent(`/join/${code}`)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}>Sign up</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/login" state={{ from: `/join/${code}` }}>
                    Log in
                  </Link>
                </Button>
              </div>
            </Unauthenticated>
          </>
        )}
      </div>
    </div>
  );
}
