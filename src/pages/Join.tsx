import { Authenticated, Unauthenticated, useMutation, useQuery } from "@/lib/convex";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { GroupAvatar, GROUP_TYPE_LABELS } from "@/components/common/Avatars";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { errorMessage, pluralize } from "@/lib/format";

export function Join() {
  const { code = "" } = useParams();
  const info = useQuery(api.groups.inviteInfo, { code });
  const join = useMutation(api.groups.joinByCode);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo size={30} />
      </Link>
      <div className="card w-full max-w-sm p-6 text-center">
        {info === undefined ? (
          <p className="text-text-muted text-sm">Checking this invite…</p>
        ) : info === null ? (
          <>
            <h1 className="text-text text-lg font-semibold">This link doesn't work</h1>
            <p className="text-text-muted mt-2 text-sm">The invite may have been reset or the group deleted. Ask whoever sent it for a new link.</p>
            <Button className="mt-5" asChild>
              <Link to="/dashboard">Go to UnSplit</Link>
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
              <p className="text-text-muted mt-4 text-sm">Log in with Google to join.</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button asChild>
                  <Link to="/login" state={{ from: `/join/${code}` }}>
                    Continue with Google
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
