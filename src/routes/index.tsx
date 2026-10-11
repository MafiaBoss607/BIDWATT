import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, Gauge, Users, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero-gpu.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bidwatt — Your GPU. Your price. Your terms." },
      { name: "description", content: "Peer-to-peer GPU rental in India. Post what you need, negotiate with real hosts, pay in INR." },
      { property: "og:title", content: "Bidwatt — Your GPU. Your price. Your terms." },
      { property: "og:description", content: "Peer-to-peer GPU rental in India. Post what you need, negotiate with real hosts, pay in INR." },
    ],
  }),
  component: Index,
});

const features = [
  { icon: MessageSquare, t: "Negotiate like people", d: "Talk it out in chat, then lock terms with a clear offer both sides accept." },
  { icon: Gauge, t: "Know what you get", d: "Verified hardware, benchmarks, VRAM and reliability — not just a price tag." },
  { icon: Users, t: "Ask an Ally", d: "Send requests straight to hosts you've rented from and trust." },
  { icon: IndianRupee, t: "Small, clear sessions", d: "Rent for an hour or a weekend. See the total before you commit." },
];

function Index() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border">
        <img src={hero} alt="Glowing graphics card" width={1600} height={1008} className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/20" />
        <div className="relative mx-auto max-w-6xl px-4 py-28 md:py-40">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">GPU rental · India-first · INR</p>
          <h1 className="mt-4 max-w-2xl text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            Your GPU.<br />Your price.<br /><span className="text-primary">Your terms.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Post the compute you need. Hosts with idle GPUs respond, and you agree on a deal together.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="hero" size="lg"><Link to="/requests/new">Post a request</Link></Button>
            <Button asChild variant="outline" size="lg"><Link to="/requests">Browse requests as a host</Link></Button>
          </div>
        </div>
      </section>

      <section className="grid-bg">
        <div className="mx-auto grid max-w-6xl gap-px bg-border md:grid-cols-4">
          {features.map(({ icon: Icon, t, d }) => (
            <div key={t} className="bg-background p-8">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-24">
        <h2 className="text-3xl font-bold tracking-tight">How a request works</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            ["01", "Post your need", "“8 GB VRAM, ~3 hours, ₹50 total, flexible on GPU model.”"],
            ["02", "Hosts respond", "People with matching hardware reply with what they can offer."],
            ["03", "Agree and run", "Settle terms in chat. Only an offer you accept becomes a booking."],
          ].map(([n, t, d]) => (
            <li key={n} className="border-t border-primary pt-4">
              <span className="font-mono text-sm text-primary">{n}</span>
              <h3 className="mt-2 text-xl font-semibold">{t}</h3>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
