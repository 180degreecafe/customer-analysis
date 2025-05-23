import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACCESS_TOKEN = Deno.env.get("ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async () => {
  try {
    const res = await fetch("https://api.loyverse.com/v1.0/receipts?limit=50", {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return new Response(`Failed to fetch receipts: ${res.status}`, { status: 500 });
    }

    const { receipts } = await res.json();
    let processed = 0;

    for (const receipt of receipts) {
      let customer_id = null;

      // جلب بيانات العميل
      if (receipt.customer_id) {
        const customerRes = await fetch(`https://api.loyverse.com/v1.0/customers/${receipt.customer_id}`, {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            Accept: "application/json",
          },
        });

        if (customerRes.ok) {
          const c = await customerRes.json();

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

      // الطلب
      const { data: order } = await supabase
        .from("Orders")
        .upsert({
          id: receipt.receipt_number,
          customer_id: customer_id,
          created_at: receipt.created_at,
        })
        .select()
        .single();

      // العناصر
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

  } catch (err) {
    return new Response(`Error: ${err.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});

console.log("Token prefix:", ACCESS_TOKEN?.slice(0, 5)); // اختياري للطباعة
//com
