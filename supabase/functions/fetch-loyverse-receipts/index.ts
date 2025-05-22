import { serve } from "https://deno.land/std@0.192.0/http/server.ts"

const ACCESS_TOKEN = "8BobfhtFqRbW_PxkVcDhVF5Qp1U";

serve(async () => {
  const response = await fetch("https://api.loyverse.com/v1.0/receipts?limit=50", {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  const data = await response.json();

  return new Response(JSON.stringify({ receipts: data }), {
    headers: { "Content-Type": "application/json" }
  });
});

init edge function
// Trigger redeploy
// Trigger redeploy
// Trigger redeploy
// Trigger redeploy
// Trigger redeploy
// Trigger redeploy
// Trigger redeploy
// Trigger redeploy
// Trigger redeploy
