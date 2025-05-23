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

  let inserted = 0;
  let cursor = null;

  try {
    while (true) {
      const url = new URL("https://api.loyverse.com/v1.0/customers");
      url.searchParams.set("limit", "250");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return new Response(`Failed to fetch customers: ${res.status}`, { status: 500 });
      }

      const { customers, cursor: nextCursor } = await res.json();

      for (const c of customers) {
        await supabase.from("customers").upsert({
          id: c.id,
          name: c.name,
          phone: c.phone_number,
          email: c.email,
        }, { onConflict: "id" });

        inserted++;
      }

      if (!nextCursor) break;
      cursor = nextCursor;
    }

    return new Response(`✅ Synced ${inserted} customers`, {
      headers: { "Content-Type": "text/plain" },
    });

  } catch (err) {
    return new Response(`Error: ${err.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
