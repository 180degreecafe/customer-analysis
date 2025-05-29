// supabase/functions/generate-triggers.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async () => {
  const messages: string[] = [];

  // 1. Churned customers
  const { data: churned, error: churnErr } = await supabase.from('churned_customers').select('id, name');
  if (churnErr) return new Response(`Error fetching churned: ${churnErr.message}`, { status: 500 });

  for (const c of churned || []) {
    const { error } = await supabase.from('triggers').upsert({
      customer_id: c.id,
      type: 'churned',
      message: `العميل ${c.name} لم يقم بالشراء منذ فترة طويلة.`
    }, { onConflict: 'customer_id,type' });

    if (error) messages.push(`❌ churned: ${error.message}`);
  }

  // 2. Inactive customers
  const { data: inactive, error: inactiveErr } = await supabase.from('inactive_customers').select('id, name');
  if (inactiveErr) return new Response(`Error fetching inactive: ${inactiveErr.message}`, { status: 500 });

  for (const c of inactive || []) {
    const { error } = await supabase.from('triggers').upsert({
      customer_id: c.id,
      type: 'inactive',
      message: `العميل ${c.name} توقف عن الشراء بشكل منتظم.`
    }, { onConflict: 'customer_id,type' });

    if (error) messages.push(`❌ inactive: ${error.message}`);
  }

  // 3. Advanced triggers from enriched_customers
  const { data: enriched, error: enrichedErr } = await supabase
    .from('enriched_customers')
    .select('id, name, total_orders, total_spent, avg_days_between_orders, favorite_drink, days_since_last_order');
  if (enrichedErr) return new Response(`Error fetching enriched: ${enrichedErr.message}`, { status: 500 });

  for (const c of enriched || []) {
    const triggers = [];

    if (c.favorite_drink) {
      triggers.push({
        type: 'favorite_drink',
        message: `العميل ${c.name} يفضل مشروب ${c.favorite_drink}.`
      });
    } else if (c.total_orders > 0) {
      triggers.push({
        type: 'no_favorite_yet',
        message: `العميل ${c.name} لم يظهر له مشروب مفضل حتى الآن.`
      });
    }

    if (c.total_orders === 1) {
      triggers.push({
        type: 'first_order',
        message: `العميل ${c.name} قام بأول طلب له.`
      });
    }

    if (c.total_spent >= 20) {
      triggers.push({
        type: 'high_spender',
        message: `العميل ${c.name} أنفق أكثر من 20 دينار.`
      });
    }

    if (c.avg_days_between_orders !== null && c.avg_days_between_orders <= 3) {
      triggers.push({
        type: 'frequent_buyer',
        message: `العميل ${c.name} يشتري بشكل متكرر.`
      });
    }

    if (c.total_orders === 1 && c.days_since_last_order > 30) {
      triggers.push({
        type: 'inactive_after_first',
        message: `العميل ${c.name} قام بطلب واحد فقط وتوقف منذ أكثر من 30 يوم.`
      });
    }

    for (const t of triggers) {
      const { error } = await supabase.from('triggers').upsert({
        customer_id: c.id,
        type: t.type,
        message: t.message
      }, { onConflict: 'customer_id,type' });

      if (error) messages.push(`❌ ${t.type}: ${error.message}`);
    }
  }

  return new Response(`✅ Triggers generated. ${messages.length > 0 ? messages.join('\\n') : 'All good.'}`);
});
