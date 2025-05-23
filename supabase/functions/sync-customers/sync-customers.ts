import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = "https://qwaooajgkkqtpbidzumd.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "مفتاح_SERVICE_ROLE_هنا";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const accessToken = req.headers.get("x-loyverse-token");
  if (!accessToken) {
    return new Response("Missing x-loyverse-token header", { status: 401 });
  }

  try {
    const response = await fetch("https://api.loyverse.com/v1.0/customers", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return new Response(`Failed to fetch customers: ${response.status}`, { status: 500 });
    }

    const { customers } = await response.json();
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
