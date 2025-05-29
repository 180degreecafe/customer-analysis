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

  // الخطوة 1: احصل على أحدث إيصال لدينا
  const { data: latestOrder } = await supabase
    .from("orders")
    .select("order_time")
    .order("order_time", { ascending: false })
    .limit(1)
    .single();

  const latestTime = latestOrder?.order_time;

  // الخطوة 2: جهز رابط Loyverse مع شرط التاريخ (إن وجد)
  const baseUrl = new URL("https://api.loyverse.com/v1.0/receipts");
  baseUrl.searchParams.set("limit", "50");
  baseUrl.searchParams.set("sort_by", "receipt_date:asc");
  if (latestTime) {
    baseUrl.searchParams.set("filter", `receipt_date>"${latestTime}"`);
  }

  const res = await fetch(baseUrl.toString(), {
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
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("id", receipt.receipt_number)
      .maybeSingle();

    if (existingOrder) continue;

    let customer_id = null;

    if (receipt.customer_id) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("id", receipt.customer_id) // loyverse_id
        .maybeSingle();

      if (existing) {
        customer_id = existing.id;
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
