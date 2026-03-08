import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KOFI_VERIFICATION_TOKEN = Deno.env.get("KOFI_VERIFICATION_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  // Ko-fi sends POST with form-encoded body
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Ko-fi sends data as application/x-www-form-urlencoded with a "data" field containing JSON
    const formData = await req.formData();
    const dataStr = formData.get("data");

    if (!dataStr || typeof dataStr !== "string") {
      console.error("No data field in payload");
      return new Response("OK", { status: 200 });
    }

    const payload = JSON.parse(dataStr);

    // Verify the token
    if (payload.verification_token !== KOFI_VERIFICATION_TOKEN) {
      console.error("Invalid verification token");
      return new Response("OK", { status: 200 });
    }

    // Only process subscription payments
    if (!payload.is_subscription_payment) {
      console.log(`Ignoring non-subscription event: type=${payload.type}, from=${payload.from_name}`);
      return new Response("OK", { status: 200 });
    }

    const email = payload.email?.toLowerCase()?.trim();
    if (!email) {
      console.error("No email in subscription payload");
      return new Response("OK", { status: 200 });
    }

    console.log(`Subscription payment from ${payload.from_name} (${email}), first=${payload.is_first_subscription_payment}`);

    // Set is_supporter = true for matching facilitator
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from("facilitators")
      .update({ is_supporter: true })
      .eq("email", email)
      .select("id, display_name");

    if (error) {
      console.error("DB error:", error.message);
    } else if (!data || data.length === 0) {
      console.log(`No facilitator found for email: ${email}`);
    } else {
      console.log(`Set is_supporter=true for: ${data[0].display_name}`);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    // Always return 200 so Ko-fi doesn't retry
    return new Response("OK", { status: 200 });
  }
});
