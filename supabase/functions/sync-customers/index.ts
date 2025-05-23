import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// إعدادات Supabase الخاصة بك
const SUPABASE_URL = "https://qwaooajgkkqtpbidzumd.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const accessToken = req.headers.get("x-loyverse-token");
  if (!accessToken) {
    return new Response("Missing x-loyverse-token header", { status: 401 });
  }

  try {
    const customersRes = await fetch("https://api.loyverse.com/v1.0/customers?limit=250", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!customersRes.ok) {
      return new Response(`Failed to fetch customers: ${customersRes.status}`, {
        status: 500,
      });
    }

    const { customers } = await customersRes.json();
    let synced = 0;

    for (const customer of customers) {
      const { error } = await supabase
        .from("customers")
        .upsert({
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone_number,
        }, { onConflict: "id" });

      if (!error) synced++;
    }

    return new Response(`✅ Synced ${synced} customers`, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, {
      status: 500,
    });
  }
});
//com
