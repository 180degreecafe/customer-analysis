import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ACCESS_TOKEN = req.headers.get("x-loyverse-token");

  if (!ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing x-loyverse-token header" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Get last order timestamp
  const { data: lastOrder, error } = await supabase
    .from("orders")
    .select("order_time")
    .order("order_time", { ascending: false })
    .limit(1)
    .single();

  const lastDate = lastOrder?.order_time
    ? new Date(lastOrder.order_time).toISOString()
    : null;

  let cursor: string | null = null;
  let imported = 0;

  while (true) {
    const url = new URL("https://api.loyverse.com/v1.0/receipts");
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);
    if (lastDate) url.searchParams.set("created_at_min", lastDate);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errorMsg = await res.text();
      console.error("❌ Failed to fetch receipts:", errorMsg);
      return new Response(`Failed to fetch receipts: ${errorMsg}`, { status: 500 });
    }

    const { receipts, cursor: nextCursor } = await res.json();
    if (!receipts || receipts.length === 0) break;

    for (const r of receipts) {
      const { customer_id, receipt_number, created_at, total_money, line_items } = r;

      const { error: orderError } = await supabase.from("orders").upsert({
        id: receipt_number,
        order_time: created_at,
        total_amount: total_money,
        customer_id: customer_id || null,
        raw_item: r,
      }, { onConflict: "id" });

      if (orderError) {
        console.error(`❌ Failed to insert order ${receipt_number}:`, orderError.message);
        continue;
      }

      if (Array.isArray(line_items)) {
        for (const item of line_items) {
          const { error: itemError } = await supabase.from("order_items").insert({
            order_id: receipt_number,
            product_name: item.item_name,
            quantity: item.quantity,
            price: item.price,
            raw_item: item,
          });

          if (itemError) {
            console.error(`❌ Failed to insert item for order ${receipt_number}:`, itemError.message);
          }
        }
      }

      imported++;
    }

    if (!nextCursor) break;
    cursor = nextCursor;
  }

  console.log(`✅ Synced ${imported} new receipts`);
  return new Response(`✅ Synced ${imported} new receipts`, { status: 200 });
});
