import { Link } from "react-router";
import { Logo } from "@/components/layout/Logo";

const processors = [
  { name: "Convex", url: "https://www.convex.dev/", what: "Hosts the database, backend functions and file storage. Everything you enter in UnSplit (accounts, groups, expenses, receipts, avatars) lives here." },
  { name: "Vercel", url: "https://vercel.com/", what: "Serves the web app. It sees your IP address and browser details in ordinary access logs." },
  { name: "Resend", url: "https://resend.com/", what: "Delivers email: invites, reminders, password-reset codes and activity notifications. It receives the recipient's address and the message." },
  { name: "Anthropic", url: "https://www.anthropic.com/", what: "Reads receipt photos when you use Scan receipt. Only the image you choose to scan is sent, and only when you press the button." },
  { name: "Google", url: "https://policies.google.com/privacy", what: "Only if you sign in with Google. Google tells us your name, email address and profile picture." },
  { name: "Frankfurter", url: "https://frankfurter.dev/", what: "Supplies exchange rates for currency conversion. It receives the currency codes and the date, nothing about you." },
];

export function Privacy() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link to="/"><Logo size={28} /></Link>
        <Link to="/" className="text-text-muted text-sm hover:underline">Back to UnSplit</Link>
      </header>
      <main className="text-text-muted mx-auto max-w-3xl px-5 pb-16 text-[15px] leading-relaxed">
        <h1 className="text-text text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-2 text-sm">Last updated 15 October 2026</p>

        <h2 className="text-text mt-10 text-lg font-semibold">What UnSplit stores</h2>
        <p className="mt-2">
          Your name, email address, password (hashed, never readable), optional avatar, and everything you add while using the app: groups, friends, expenses, payments, comments, receipt images and notification preferences. Friends you add by email before they sign up are stored as placeholder accounts with that email so the invite can reach them.
        </p>

        <h2 className="text-text mt-10 text-lg font-semibold">Why</h2>
        <p className="mt-2">
          To run the app: show you balances, keep your groups in sync, send the emails you or your friends trigger, scan receipts you ask us to scan and convert currencies. UnSplit has no ads, no tracking pixels and no analytics vendors, and it never sells or shares your data for marketing.
        </p>

        <h2 className="text-text mt-10 text-lg font-semibold">Who processes it</h2>
        <p className="mt-2">UnSplit runs on these services. Each one only receives what it needs for its job.</p>
        <ul className="mt-4 space-y-3">
          {processors.map((p) => (
            <li key={p.name} className="card p-4">
              <a href={p.url} target="_blank" rel="noreferrer" className="text-text font-semibold hover:underline">{p.name}</a>
              <p className="mt-1 text-sm">{p.what}</p>
            </li>
          ))}
        </ul>

        <h2 className="text-text mt-10 text-lg font-semibold">Who can see what you add</h2>
        <p className="mt-2">
          Members of a group see that group's expenses and comments. A friend sees the expenses the two of you share and the balance between you. Nobody else can see your data, and there is no public profile.
        </p>

        <h2 className="text-text mt-10 text-lg font-semibold">Email</h2>
        <p className="mt-2">
          You can turn every notification email off in Account → Notifications. Invites and password-reset codes are sent only when you or a friend ask for them. Reminders are rate-limited so nobody can flood you.
        </p>

        <h2 className="text-text mt-10 text-lg font-semibold">Your data is yours</h2>
        <p className="mt-2">
          Export everything as CSV or JSON from your account page at any time. Deleting your account removes your name, email, avatar, sessions and friendships straight away. Expenses you were part of stay in your groups, attributed to a deleted user, so your friends' balances still add up.
        </p>

        <h2 className="text-text mt-10 text-lg font-semibold">Cookies and local storage</h2>
        <p className="mt-2">
          UnSplit keeps your sign-in token in your browser's local storage so you stay logged in. That is the only thing it stores on your device, and there are no third-party cookies.
        </p>

        <h2 className="text-text mt-10 text-lg font-semibold">Contact</h2>
        <p className="mt-2">
          You can delete your account yourself from Account → Danger zone. For anything else about your data, contact whoever runs this UnSplit instance.
        </p>
      </main>
    </div>
  );
}
