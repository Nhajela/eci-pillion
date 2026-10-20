import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { TopBar } from "@/components/topbar";
import { db } from "@/db";
import { currentUser } from "@/lib/auth";
import { balance } from "@/services/kaju";
import { isAdmin, isStaff } from "@/services/roles";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin(user)) redirect(isStaff(user) ? "/staff" : "/home");
  return (
    <>
      <TopBar user={user} kaju={await balance(db(), user.id)} />
      <Dashboard me={user} canEdit />
    </>
  );
}
