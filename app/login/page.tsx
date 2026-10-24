import HeroArt from "@/components/HeroArt.tsx";
import LoginForm from "@/components/LoginForm.tsx";
import { HOUSE_NAME, HOUSE_TAGLINE } from "@/lib/house.ts";

export default function LoginPage() {
  return (
    <div className="page">
      <aside className="hero">
        <HeroArt variant="tall" />
        <HeroArt variant="wide" />
        <div className="hero-content">
          <p className="eyebrow">Family house · reservations</p>
          <h1 className="hero-title">{HOUSE_NAME}</h1>
          {HOUSE_TAGLINE && <p className="tagline">{HOUSE_TAGLINE}</p>}
        </div>
      </aside>
      <main className="content login">
        <h2 className="section-title">Welcome</h2>
        <p className="muted">Enter the family passcode to see which days are free.</p>
        <LoginForm />
      </main>
    </div>
  );
}
