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

  try {
    const res = await fetch("https://api.loyverse.com/v1.0/customers", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const { customers } = await res.json();
    let added = 0;

    for (const c of customers) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", c.phone_number)
        .maybeSingle();

      if (!existing) {
        await supabase.from("customers").insert({
          name: c.name,
          phone: c.phone_number,
          email: c.email,
        });
        added++;
      }
    }

    return new Response(`✅ Synced ${added} new customers`, {
      headers: { "Content-Type": "text/plain" },
    });

  } catch (err) {
    return new Response(`Error: ${err.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
//com
