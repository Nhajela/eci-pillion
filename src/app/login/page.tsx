import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { botEnabled } from "@/lib/env";
import { LoginButton } from "./login-button";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  if (await currentUser()) redirect("/home");
  const { expired } = await searchParams;
  return (
    <main className="narrow">
      <a href="/" className="brand">Pillion</a>
      <h1>Hop in</h1>
      {botEnabled() ? (
        <>
          <p className="lede">We use Telegram, so there are no passwords to forget. Tap the button, press <b>Start</b> in Telegram, and come back here.</p>
          {expired && <p className="warn">That link had expired. Try again?</p>}
          <LoginButton />
        </>
      ) : (
        <p className="lede">The Pillion bot is still waking up. Draw your avatar on the <a href="/#avatar">front page</a> meanwhile: it will come with you when you log in.</p>
      )}
    </main>
  );
}
