import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ACCESS_TOKEN = "8BobfhtFqRbW_PxkVcDhVF5Qp1U"

// Supabase credentials
const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async () => {
  const receiptsRes = await fetch("https://api.loyverse.com/v1.0/receipts?limit=50", {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  const { receipts } = await receiptsRes.json();

  for (const receipt of receipts) {
    const customerId = receipt.customer_id;
    if (!customerId) continue;

    // Fetch customer details from Loyverse
    const customerRes = await fetch(`https://api.loyverse.com/v1.0/customers/${customerId}`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!customerRes.ok) continue;
    const customer = await customerRes.json();

    // Insert or update customer in Supabase
    await supabase
      .from("Customers")
      .upsert({
        id: customer.id,
        name: customer.name,
        phone: customer.phone_number,
        email: customer.email,
      }, { onConflict: "id" });
  }

  return new Response("Customers updated successfully", {
    headers: { "Content-Type": "text/plain" },
  });
});
