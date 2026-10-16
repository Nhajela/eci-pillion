"use client";

import { act } from "./act";

export function Logout() {
  return (
    <button type="button" className="linkish" onClick={async () => { await act({ action: "logout" }); window.location.href = "/"; }}>
      Log out
    </button>
  );
}
