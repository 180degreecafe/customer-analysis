import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ACCESS_TOKEN = "8BobfhtFqRbW_PxkVcDhVF5Qp1U"
const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async () => {
  const res = await fetch("https://api.loyverse.com/v1.0/receipts?limit=50", {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  const { receipts } = await res.json();
  let processed = 0;

  for (const receipt of receipts) {
    const customerId = receipt.customer_id;
    let customer = null;

    // 1. جلب بيانات العميل (إذا موجود)
    if (customerId) {
      const customerRes = await fetch(`https://api.loyverse.com/v1.0/customers/${customerId}`, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          Accept: "application/json",
        },
      });

      if (customerRes.ok) {
        const c = await customerRes.json();
        const upsertRes = await supabase
          .from("Customers")
          .upsert({
            id: c.id,
            name: c.name,
            phone: c.phone_number,
            email: c.email,
          }, { onConflict: "id" })
          .select()
          .single();
        customer = upsertRes.data;
      }
    }

    // 2. إضافة الطلب
    const orderInsert = await supabase
      .from("Orders")
      .upsert({
        id: receipt.receipt_number,
        customer_id: customer?.id || null,
        created_at: receipt.created_at,
      }, { onConflict: "id" })
      .select()
      .single();

    const order = orderInsert.data;

    // 3. إضافة عناصر الطلب
    for (const item of receipt.line_items) {
      await supabase
        .from("Order_items")
        .upsert({
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

  return new Response(`Processed ${processed} receipts`, {
    headers: { "Content-Type": "text/plain" },
  });
});
