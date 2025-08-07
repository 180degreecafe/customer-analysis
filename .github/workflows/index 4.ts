import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
serve(async (_req)=>{
  try {
    const { data: responses, error: responsesError } = await supabase.from("campaign_responses").select("*").is("redeemed_at", null);
    if (responsesError) throw responsesError;
    let updatedCount = 0;
    for (const response of responses){
      const { offer_code, customer_id } = response;
      const { data: orders, error: ordersError } = await supabase.from("orders").select("id, order_time, raw_item").eq("customer_id", customer_id).order("order_time", {
        ascending: false
      }).limit(50); // ✅ جلب آخر 50 إيصال
      if (ordersError) throw ordersError;
      for (const order of orders){
        const rawText = JSON.stringify(order.raw_item).toLowerCase();
        const found = rawText.includes(offer_code.toLowerCase());
        console.log(`🧾 Checking order ${order.id} for code ${offer_code}: ${found ? '✅ Found' : '❌ Not found'}`);
        if (found) {
          const { error: updateError } = await supabase.from("campaign_responses").update({
            redeemed_at: order.order_time,
            status: "redeemed"
          }).eq("offer_code", offer_code).eq("customer_id", customer_id);
          if (updateError) {
            console.error("⚠️ Error updating campaign_responses:", updateError.message);
          } else {
            console.log(`✅ Updated campaign_responses for customer ${customer_id} with code ${offer_code}`);
            updatedCount++;
          }
          break; // ✅ توقف عن فحص بقية الإيصالات
        }
      }
    }
    return new Response(JSON.stringify({
      success: true,
      updated: updatedCount,
      total_responses: responses.length,
      total_orders: responses.length
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("❌ Error:", err);
    return new Response(JSON.stringify({
      error: "Failed to fetch receipts",
      detail: err.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
