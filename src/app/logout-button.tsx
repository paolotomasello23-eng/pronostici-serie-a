"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/entra");
        router.refresh();
      }}
      className="text-sm text-slate-500 underline"
    >
      Esci
    </button>
  );
}
