import Stripe from "stripe";
import { withAuth } from "@/lib/auth/with-auth";
import { SITE_URL } from "@/lib/seo/constants";
import { getSubscription } from "@/lib/subscription/store";

// Creates a Stripe Billing Portal session so users can manage their
// subscription (update payment method, cancel, etc.) without leaving
// the app's auth context.
export const POST = withAuth(async (_request, _ctx, user) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return Response.json({ error: "Stripe secret key is not configured." }, { status: 500 });
  }

  const sub = await getSubscription(user.id);
  if (!sub?.stripeCustomerId) {
    return Response.json({ error: "No active subscription found." }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: SITE_URL + "/settings",
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/portal] session creation failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create billing portal session." },
      { status: 500 },
    );
  }
});