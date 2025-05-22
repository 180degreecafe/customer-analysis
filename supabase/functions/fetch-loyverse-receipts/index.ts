import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ACCESS_TOKEN = "8BobfhtFqRbW_PxkVcDhVF5Qp1U"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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
    let customer_id = null;

    // 1. جلب بيانات العميل (إن وجدت)
    if (receipt.customer_id) {
      const customerRes = await fetch(`https://api.loyverse.com/v1.0/customers/${receipt.customer_id}`, {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          Accept: "application/json",
        },
      });

      if (customerRes.ok) {
        const c = await customerRes.json();

        // التحقق إن العميل موجود مسبقًا بناء على رقم الهاتف
        const { data: existing } = await supabase
          .from("Customers")
          .select("id")
          .eq("phone", c.phone_number)
          .single();

        if (existing) {
          customer_id = existing.id;
        } else {
          const { data: newCustomer } = await supabase
            .from("Customers")
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

    // 2. إدخال الطلب
    const { data: order } = await supabase
      .from("Orders")
      .upsert({
        id: receipt.receipt_number,
        customer_id: customer_id,
        created_at: receipt.created_at,
      })
      .select()
      .single();

    // 3. إدخال عناصر الطلب
    for (const item of receipt.line_items) {
      await supabase.from("Order_items").upsert({
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

  return new Response(`Successfully processed ${processed} receipts.`, {
    headers: { "Content-Type": "text/plain" },
  });
});
