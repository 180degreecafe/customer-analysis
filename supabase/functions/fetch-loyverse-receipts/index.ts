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

  const limit = 50;

  const { data: latestOrder } = await supabase
    .from("orders")
    .select("id")
    .order("order_time", { ascending: false })
    .limit(1)
    .single();

  let afterReceipt: string | null = latestOrder?.id ?? null;
  let processed = 0;

  try {
    while (true) {
      const url = new URL("https://api.loyverse.com/v1.0/receipts");
      url.searchParams.set("limit", `${limit}`);
      if (afterReceipt) url.searchParams.set("after_receipt_number", afterReceipt);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) return new Response(`Failed to fetch receipts: ${res.status}`, { status: 500 });

      const { receipts } = await res.json();
      if (!receipts || receipts.length === 0) break;

      for (const receipt of receipts) {
        afterReceipt = receipt.receipt_number;

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

        const { data: order } = await supabase
          .from("orders")
          .upsert({
            id: receipt.receipt_number,
            customer_id: customer_id,
            created_at: receipt.created_at,
            order_time: receipt.receipt_date,
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
    }

    return new Response(`✅ Synced ${processed} new receipts`, {
      headers: { "Content-Type": "text/plain" },
    });

  } catch (err) {
    return new Response(`Error: ${err.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
