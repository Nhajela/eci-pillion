import { redirect } from "next/navigation";
import { AvatarMaker } from "@/components/avatar-maker";
import { TopBar } from "@/components/topbar";
import { db } from "@/db";
import { currentUser } from "@/lib/auth";
import { balance } from "@/services/kaju";

export const dynamic = "force-dynamic";

export default async function AvatarPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const welcome = Boolean((await searchParams).welcome);
  return (
    <>
      <TopBar user={user} kaju={await balance(db(), user.id)} />
      <main className="app">
        {welcome && <p className="eyebrow onboard-step">Step 2 of 2</p>}
        <h1>Draw yourself (badly is fine)</h1>
        <p className="lede">A face, a blob, a cat: whatever rides the scooty is you, on the village map and next to your rides. Change it whenever you like.</p>
        <AvatarMaker account={{ name: user.name, drawing: user.avatar ?? undefined, scooty: user.scooty }} />
        {welcome && (
          <p className="onboard-next">
            <a className="btn" href="/home">Done: show me the rides →</a>
            <a className="linkish" href="/home">Skip for now</a>
          </p>
        )}
      </main>
    </>
  );
}
