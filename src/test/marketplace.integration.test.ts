// Live tests against the backend. They create throwaway users, exercise the
// database rules (offers, bookings, blocks) and delete everything afterwards.
// Skipped automatically when admin credentials aren't available.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY;
const ADMIN = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = !!(URL && ANON && ADMIN);

type U = { id: string; c: SupabaseClient };
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
let admin: SupabaseClient;
const users: U[] = [];
const tag = Math.random().toString(36).slice(2, 8);

async function makeUser(n: string): Promise<U> {
  const email = `bw-test-${tag}-${n}@example.com`;
  const password = `Pw-${tag}-${n}-x9!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = createClient(URL!, ANON!, opts);
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const u = { id: data.user.id, c };
  users.push(u);
  return u;
}

const future = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

async function offer(from: U, conv: string, over: Record<string, unknown> = {}) {
  return from.c.rpc("create_offer", {
    _conversation: conv, _gpu_model: "RTX 3060", _min_specs: "", _vram_gb: 12, _start_at: future(180),
    _duration_hours: 3, _billing_unit: "hour", _unit_price_inr: 20, _runtime: "PyTorch 2", _interruption_allowed: false,
    _storage_terms: "20 GB scratch", _bandwidth_terms: "", _cancellation_terms: "Full refund before start",
    _expires_at: future(60), ...over,
  });
}

let renter: U, host: U, conv: string;

describe.skipIf(!enabled)("negotiation rules (live)", () => {
  beforeAll(async () => {
    admin = createClient(URL!, ADMIN!, opts);
    renter = await makeUser("r");
    host = await makeUser("h");
    const { data, error } = await host.c.rpc("start_conversation", { _other: renter.id, _i_am_host: true });
    if (error) throw error;
    conv = data as string;
  }, 30_000);

  afterAll(async () => {
    if (!admin) return;
    const ids = users.map((u) => u.id);
    await admin.from("bookings").delete().in("renter_id", ids);
    await admin.from("conversations").delete().in("renter_id", ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }, 30_000);

  it("computes the total server-side (₹20/hr × 3h = ₹60)", async () => {
    const { data: id } = await offer(host, conv);
    const { data } = await renter.c.from("offers").select("est_total_inr").eq("id", id).single();
    expect(Number(data!.est_total_inr)).toBe(60);
  });

  it("two simultaneous accepts create exactly one booking", async () => {
    const { data: id } = await offer(host, conv);
    const [a, b] = await Promise.all([
      renter.c.rpc("respond_offer", { _offer: id, _action: "accept" }),
      renter.c.rpc("respond_offer", { _offer: id, _action: "accept" }),
    ]);
    expect([a.error, b.error].filter(Boolean)).toHaveLength(1);
    const { count } = await admin.from("bookings").select("*", { count: "exact", head: true }).eq("offer_id", id);
    expect(count).toBe(1);
  });

  it("an expired offer cannot be accepted", async () => {
    const { data: id, error } = await offer(host, conv, { _expires_at: future(0.05) });
    expect(error).toBeNull();
    await new Promise((r) => setTimeout(r, 4000));
    const res = await renter.c.rpc("respond_offer", { _offer: id, _action: "accept" });
    expect(res.error?.message).toMatch(/expired/i);
  }, 15_000);

  it("the proposer cannot accept their own offer", async () => {
    const { data: id } = await offer(host, conv);
    const res = await host.c.rpc("respond_offer", { _offer: id, _action: "accept" });
    expect(res.error?.message).toMatch(/recipient/i);
  });

  it("accepted terms cannot be altered, even with admin access", async () => {
    const { data: id } = await offer(host, conv);
    await renter.c.rpc("respond_offer", { _offer: id, _action: "accept" });
    const res = await admin.from("offers").update({ unit_price_inr: 1 }).eq("id", id);
    expect(res.error?.message).toMatch(/immutable/i);
    const user = await host.c.from("offers").update({ unit_price_inr: 1 }).eq("id", id).select();
    expect(user.data ?? []).toHaveLength(0);
  });

  it("countering supersedes the original and keeps it in history", async () => {
    const { data: first } = await offer(host, conv);
    const { data: counter, error } = await offer(renter, conv, { _unit_price_inr: 15, _supersedes: first });
    expect(error).toBeNull();
    const { data } = await renter.c.from("offers").select("id,status,supersedes_id").in("id", [first, counter]);
    expect(data!.find((o) => o.id === first)!.status).toBe("countered");
    expect(data!.find((o) => o.id === counter)!.supersedes_id).toBe(first);
    const again = await renter.c.rpc("respond_offer", { _offer: first, _action: "accept" });
    expect(again.error?.message).toMatch(/already countered/i);
  });

  it("rejects illegal booking transitions and wrong actors", async () => {
    const { data: id } = await offer(host, conv);
    const { data: booking } = await renter.c.rpc("respond_offer", { _offer: id, _action: "accept" });
    const skip = await host.c.rpc("transition_booking", { _booking: booking, _to: "RUNNING" });
    expect(skip.error?.message).toMatch(/illegal/i);
    const wrong = await renter.c.rpc("transition_booking", { _booking: booking, _to: "HOST_PREPARING" });
    expect(wrong.error?.message).toMatch(/only the host/i);
    const ok = await host.c.rpc("transition_booking", { _booking: booking, _to: "HOST_PREPARING" });
    expect(ok.error).toBeNull();
    const { data: ev } = await renter.c.from("booking_events").select("to_state,actor_id").eq("booking_id", booking).order("id");
    expect(ev!.map((e) => e.to_state)).toEqual(["BOOKING_CONFIRMED", "HOST_PREPARING"]);
    expect(ev![1].actor_id).toBe(host.id);
  });

  it("blocking withdraws pending offers and stops messages, offers and Ally asks", async () => {
    const r2 = await makeUser("r2");
    const h2 = await makeUser("h2");
    const { data: c2 } = await h2.c.rpc("start_conversation", { _other: r2.id, _i_am_host: true });
    await h2.c.from("messages").insert({ conversation_id: c2, sender_id: h2.id, body: "hi" });
    await h2.c.rpc("request_ally", { _target: r2.id });
    const { data: link } = await r2.c.from("ally_links").select("id").single();
    await r2.c.rpc("respond_ally", { _link: link!.id, _accept: true });
    await r2.c.rpc("ask_allies", { _recipients: [h2.id], _message: "need 8GB tonight" });
    const { data: pending } = await offer(h2, c2 as string);

    expect((await r2.c.rpc("block_user", { _target: h2.id })).error).toBeNull();

    const { data: o } = await r2.c.from("offers").select("status").eq("id", pending).single();
    expect(o!.status).toBe("withdrawn");
    const { data: asks } = await r2.c.from("ally_requests").select("status");
    expect(asks!.every((a) => a.status === "declined")).toBe(true);
    const msg = await h2.c.from("messages").insert({ conversation_id: c2, sender_id: h2.id, body: "hello?" });
    expect(msg.error).not.toBeNull();
    expect((await offer(h2, c2 as string)).error?.message).toMatch(/cannot contact/i);
    expect((await h2.c.rpc("start_conversation", { _other: r2.id, _i_am_host: true })).error).not.toBeNull();
    const { count } = await r2.c.from("ally_links").select("*", { count: "exact", head: true });
    expect(count).toBe(0);
  }, 30_000);
});
