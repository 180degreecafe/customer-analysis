import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// UltraMsg credentials
const ULTRAMSG_INSTANCE_ID = Deno.env.get("ULTRAMSG_INSTANCE_ID")!;
const ULTRAMSG_TOKEN = Deno.env.get("ULTRAMSG_TOKEN")!;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Only POST requests are allowed", { status: 405 });
  }

  const { trigger_id } = await req.json();
  if (!trigger_id) {
    return new Response("Missing trigger_id", { status: 400 });
  }

  // 1. جلب الترقر المرتبط مع customer_id (text)
  const { data: trigger, error: triggerError } = await supabase
    .from("triggers")
    .select("id, type, customer_id")
    .eq("id", trigger_id)
    .single();

  if (triggerError || !trigger) {
    return new Response(JSON.stringify({ error: "Trigger not found" }), { status: 404 });
  }

  // 2. جلب بيانات العميل من جدول customers باستخدام customer_id (text)
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name, phone_number")
    .eq("id", trigger.customer_id)
    .single();

  if (customerError || !customer) {
    return new Response(JSON.stringify({ error: "Customer not found" }), { status: 404 });
  }

  if (!customer.phone_number) {
    return new Response(JSON.stringify({ error: "Customer has no phone number" }), { status: 400 });
  }

  // 3. جلب رسالة واتساب من trigger_templates حسب نوع الترقر
  const { data: template, error: templateError } = await supabase
    .from("trigger_templates")
    .select("whatsapp_message_template, default_offer")
    .eq("type", trigger.type)
    .single();

  if (templateError || !template) {
    return new Response(JSON.stringify({ error: "Template not found for this trigger type" }), { status: 404 });
  }

  // 4. تخصيص الرسالة باستخدام [name] و [offer]
  const message = template.whatsapp_message_template
    .replace("[name]", customer.name || "")
    .replace("[offer]", template.default_offer || "");

  // 5. إرسال الرسالة عبر UltraMsg
  const url = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE_ID}/messages/chat`;
  const body = new URLSearchParams({
    token: ULTRAMSG_TOKEN,
    to: customer.phone_number,
    body: message,
  });

  const ultraRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const ultraResult = await ultraRes.json();
  const sentSuccessfully = ultraResult.sent === true;

  // 6. تسجيل الرسالة في جدول outbound_messages
  await supabase.from("outbound_messages").insert({
    customer_id: trigger.customer_id, // text
    trigger_id: trigger.id,           // uuid
    channel: "whatsapp",
    recipient: customer.phone_number,
    message: message,
    status: sentSuccessfully ? "sent" : "failed",
    error: ultraResult.error || null,
    sent_at: sentSuccessfully ? new Date().toISOString() : null,
  });

  return new Response(JSON.stringify({
    success: sentSuccessfully,
    response: ultraResult
  }), {
    status: 200,
  });
});
