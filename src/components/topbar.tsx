import Link from "next/link";
import type { User } from "@/db/schema";
import { Logout } from "./logout";

export function TopBar({ user, kaju }: { user: User; kaju: number }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">Pillion <span className="beta-pill">beta</span></Link>
      <nav>
        {(user.role === "admin" || user.role === "staff") && <Link href={user.role === "admin" ? "/admin" : "/staff"} aria-label="Dashboard">📊</Link>}
        <Link href="/home">Rides</Link>
        <Link href="/today">Today</Link>
        <Link href="/avatar" className="me">
          {user.avatar ? <img src={user.avatar} alt="" width={32} height={32} /> : <span className="dot" style={{ background: user.scooty }} />}
          <span className="kaju-pill">🥜 {kaju}</span>
        </Link>
        <Logout />
      </nav>
    </header>
  );
}
