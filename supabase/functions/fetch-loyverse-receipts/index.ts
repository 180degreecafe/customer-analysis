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

  const res = await fetch("https://api.loyverse.com/v1.0/receipts?limit=50", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    return new Response(`Failed to fetch receipts: ${res.status}`, { status: 500 });
  }

  const { receipts } = await res.json();
  let processed = 0;

  for (const receipt of receipts) {
    // تحقق إذا تم إدخال الإيصال مسبقًا
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("id", receipt.receipt_number)
      .maybeSingle();

    if (existingOrder) continue;

    let customer_id = null;

    if (receipt.customer_id) {
      const customerRes = await fetch(`https://api.loyverse.com/v1.0/customers/${receipt.customer_id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (customerRes.ok) {
        const c = await customerRes.json();

        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("phone", c.phone_number)
          .maybeSingle();

        if (existing) {
          customer_id = existing.id;
        } else {
          const { data: newCustomer } = await supabase
            .from("customers")
            .insert({
              name: c.name,
              phone: c.phone_number,
              email: c.email,
            })
            .select()
            .single();

          customer_id = newCustomer?.id;
        }
      }
    }

    const adjustedTime = new Date(new Date(receipt.receipt_date).getTime() + 3 * 60 * 60 * 1000).toISOString();

    const { data: order } = await supabase
      .from("orders")
      .insert({
        id: receipt.receipt_number,
        customer_id: customer_id,
        created_at: receipt.created_at,
        order_time: adjustedTime,
        total_amount: receipt.total_money,
      })
      .select()
      .single();

    if (!order) continue;

    for (const item of receipt.line_items) {
      await supabase.from("order_items").upsert({
        id: item.id,
        order_id: order.id,
        product_name: item.item_name,
        quantity: item.quantity,
        price: item.price,
        total: item.total_money,
      }, { onConflict: "id" });
    }

    processed++;
  }

  return new Response(`✅ Synced ${processed} new receipts`, {
    headers: { "Content-Type": "text/plain" },
  });
});
