import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const accessToken = req.headers.get("x-loyverse-token");
  if (!accessToken) {
    return new Response("Missing x-loyverse-token header", { status: 401 });
  }

  const limit = 250;
  let cursor = null;
  let added = 0;
  let skipped = 0;

  while (true) {
    const url = new URL("https://api.loyverse.com/v1.0/customers");
    url.searchParams.set("limit", `${limit}`);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return new Response(`Failed to fetch customers: ${res.status}`, {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const { customers, cursor: nextCursor } = await res.json();

    for (const c of customers) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", c.phone_number)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("customers").insert({
        name: c.name,
        phone: c.phone_number,
        email: c.email,
      });

      if (!error) added++;
    }

    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return new Response(`✅ Synced customers. Added: ${added}, Skipped: ${skipped}`, {
    headers: { "Content-Type": "text/plain" },
  });
});
