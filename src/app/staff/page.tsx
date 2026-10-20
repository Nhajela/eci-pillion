import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { TopBar } from "@/components/topbar";
import { db } from "@/db";
import { currentUser } from "@/lib/auth";
import { balance } from "@/services/kaju";
import { isStaff } from "@/services/roles";

export const dynamic = "force-dynamic";

/** The read-only twin of /admin. */
export default async function StaffPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/staff");
  if (!isStaff(user)) redirect("/home");
  return (
    <>
      <TopBar user={user} kaju={await balance(db(), user.id)} />
      <Dashboard me={user} canEdit={false} />
    </>
  );
}
