import { redirect } from "next/navigation";
import BookingApp from "@/components/BookingApp.tsx";
import { currentRole, familyGateOn } from "@/lib/auth.ts";
import { parseExtraHolidays } from "@/lib/holidays.ts";
import { storageProblem } from "@/lib/db.ts";
import { HOUSE_NAME, HOUSE_TAGLINE } from "@/lib/house.ts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const role = await currentRole();
  if (!role) redirect("/login");
  return (
    <BookingApp
      houseName={HOUSE_NAME}
      tagline={HOUSE_TAGLINE}
      isAdmin={role === "admin"}
      canSignOut={role === "admin" || familyGateOn()}
      extraHolidays={parseExtraHolidays(process.env.HOUSE_HOLIDAYS)}
      storageWarning={storageProblem()}
    />
  );
}
