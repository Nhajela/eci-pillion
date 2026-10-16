import { redirect } from "next/navigation";
import { AvatarMaker } from "@/components/avatar-maker";
import { TopBar } from "@/components/topbar";
import { db } from "@/db";
import { currentUser } from "@/lib/auth";
import { balance } from "@/services/kaju";

export const dynamic = "force-dynamic";

export default async function AvatarPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <TopBar user={user} kaju={await balance(db(), user.id)} />
      <main className="app">
        <h1>Draw yourself (badly is fine)</h1>
        <p className="lede">This is you on the village map and next to your rides. Change it whenever you like.</p>
        <AvatarMaker account={{ name: user.name, drawing: user.avatar ?? undefined, scooty: user.scooty }} />
      </main>
    </>
  );
}
