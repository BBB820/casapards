import LoginForm from "@/components/LoginForm.tsx";
import { HOUSE_NAME } from "@/lib/house.ts";

export default function LoginPage() {
  return (
    <main className="shell login">
      <p className="eyebrow">Family house</p>
      <h1>{HOUSE_NAME}</h1>
      <p className="muted">Enter the family passcode to see which days are free.</p>
      <LoginForm />
    </main>
  );
}
