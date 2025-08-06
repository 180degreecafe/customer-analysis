import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Supabase client
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
serve(async (_req)=>{
  // 1. Fetch messages with offer codes not yet redeemed
  const { data: messages, error: messagesError } = await supabase.from("outbound_messages").select("id, customer_id, offer_code").is("redeemed_at", null).not("offer_code", "is", null);
  if (messagesError || !messages) {
    console.error("Failed to fetch messages", messagesError);
    return new Response(JSON.stringify({
      error: messagesError?.message || "Failed to fetch messages"
    }), {
      status: 500
    });
  }
  // Extract relevant customer IDs
  const customerIds = messages.map((m)=>m.customer_id);
  // 2. Fetch only relevant orders for the customers in messages
  const { data: orders, error: ordersError } = await supabase.from("orders").select("id, customer_id, order_time, raw_item").in("customer_id", customerIds);
  if (ordersError || !orders) {
    console.error("Failed to fetch orders", ordersError);
    return new Response(JSON.stringify({
      error: ordersError?.message || "Failed to fetch orders"
    }), {
      status: 500
    });
  }
  let updatedCount = 0;
  for (const message of messages){
    const code = message.offer_code.toLowerCase();
    for (const order of orders){
      if (order.customer_id !== message.customer_id) continue;
      const rawJsonStr = JSON.stringify(order.raw_item || {}).toLowerCase();
      const found = rawJsonStr.includes(code);
      if (found) {
        const { error: updateError } = await supabase.from("outbound_messages").update({
          redeemed_at: order.order_time,
          redeemed_order_id: order.id
        }).eq("id", message.id);
        if (!updateError) updatedCount++;
        break;
      }
    }
  }
  const result = {
    success: true,
    updated: updatedCount,
    total_messages: messages.length,
    total_orders: orders.length
  };
  console.log("Redemption Result:", result);
  return new Response(JSON.stringify(result), {
    status: 200
  });
});
