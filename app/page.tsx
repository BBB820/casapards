import { redirect } from "next/navigation";
import BookingApp from "@/components/BookingApp.tsx";
import { currentRole, familyGateOn } from "@/lib/auth.ts";
import { HOUSE_NAME } from "@/lib/house.ts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const role = await currentRole();
  if (!role) redirect("/login");
  return (
    <BookingApp
      houseName={HOUSE_NAME}
      isAdmin={role === "admin"}
      canSignOut={role === "admin" || familyGateOn()}
    />
  );
}
