import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACCESS_TOKEN = Deno.env.get("ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  const tokenHeader = req.headers.get("x-loyverse-token");
  const token = tokenHeader || ACCESS_TOKEN;

  try {
    const res = await fetch("https://api.loyverse.com/v1.0/receipts?limit=50", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.error("Failed to fetch receipts:", res.status);
      return new Response(`Failed to fetch receipts: ${res.status}`, { status: 500 });
    }

    const { receipts } = await res.json();
    let processed = 0;

    for (const receipt of receipts) {
      console.log(`\n--- Receipt: ${receipt.receipt_number} ---`);
      let customer_id: string | null = null;

      // جلب بيانات العميل
      if (receipt.customer_id) {
        const customerRes = await fetch(`https://api.loyverse.com/v1.0/customers/${receipt.customer_id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        if (customerRes.ok) {
          const c = await customerRes.json();

          const { data: existing } = await supabase
            .from("customers")
            .select("id")
            .eq("phone", c.phone_number)
            .single();

          if (existing) {
            customer_id = existing.id;
            console.log(`Existing customer: ${customer_id}`);
          } else {
            const { data: newCustomer, error } = await supabase
              .from("customers")
              .insert({
                name: c.name,
                phone: c.phone_number,
                email: c.email,
                id: c.id,
              })
              .select()
              .single();

            if (error) {
              console.error(`Failed to insert customer: ${error.message}`);
            }

            customer_id = newCustomer?.id || null;
            console.log(`Inserted customer: ${customer_id}`);
          }
        } else {
          console.warn(`Failed to fetch customer: ${receipt.customer_id}`);
        }
      } else {
        console.log("No customer_id");
      }

      // إدخال الطلب
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .upsert({
          id: receipt.receipt_number,
          customer_id: customer_id || null,
          created_at: receipt.created_at,
        })
        .select()
        .single();

      if (orderError || !order) {
        console.error(`❌ Order insert failed for receipt ${receipt.receipt_number}: ${orderError?.message}`);
        continue;
      }

      console.log(`✅ Order inserted: ${order.id}`);

      // إدخال العناصر
      if (receipt.line_items?.length) {
        console.log(`Inserting ${receipt.line_items.length} items for order ${order.id}`);
        for (const item of receipt.line_items) {
          const { error: itemError } = await supabase.from("order_items").upsert({
            id: item.id,
            order_id: order.id,
            product_name: item.item_name,
            quantity: item.quantity,
            price: item.price,
            total: item.total_money,
          }, { onConflict: "id" });

          if (itemError) {
            console.error(`❌ Failed to insert item ${item.id}: ${itemError.message}`);
          } else {
            console.log(`✅ Item inserted: ${item.item_name} (${item.id})`);
          }
        }
      } else {
        console.warn(`⚠️ No line_items in receipt ${receipt.receipt_number}`);
      }

      processed++;
    }

    return new Response(`Successfully processed ${processed} receipts.`, {
      headers: { "Content-Type": "text/plain" },
    });

  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(`Error: ${err.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
