import Stripe from "stripe";
import { upsertSubscription, updateUserPlan, resetUsageForNewCycle, getSubscriptionByCustomerId } from "@/lib/subscription/store";
import type { PlanTier } from "@/lib/subscription/plans";

// Stripe webhook handler -- receives events from Stripe and updates the
// local subscriptions table accordingly. This is the authoritative source
// for subscription status: the checkout route creates the session, but
// the webhook confirms payment and activates the subscription.
//
// Required env vars:
//   STRIPE_SECRET_KEY       -- same as checkout
//   STRIPE_WEBHOOK_SECRET   -- from Stripe Dashboard > Webhooks

export const dynamic = "force-dynamic";

// Maps a Stripe subscription status to our internal status.
function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "inactive";
  }
}

// Determines the plan tier from the Stripe price ID.
function resolveTier(priceId: string): PlanTier {
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  if (proPriceId && priceId === proPriceId) return "pro";
  // Default to pro for any paid subscription -- the only paid plan.
  return "pro";
}

// Extracts period dates from a Stripe subscription object. In Stripe API
// v2025+, current_period_start/end were removed from the Subscription object.
// We derive them from billing_cycle_anchor and the price interval.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPeriodDates(sub: any): { start: string; end: string } {
  // Try the direct properties first (older API versions)
  if (sub.current_period_start && sub.current_period_end) {
    return {
      start: new Date(sub.current_period_start * 1000).toISOString(),
      end: new Date(sub.current_period_end * 1000).toISOString(),
    };
  }

  // Fall back to deriving from billing_cycle_anchor + price interval
  const anchor = sub.billing_cycle_anchor ?? sub.created ?? Math.floor(Date.now() / 1000);
  const item = sub.items?.data?.[0];
  const interval = item?.price?.recurring?.interval ?? "month";
  const intervalCount = item?.price?.recurring?.interval_count ?? 1;

  const startDate = new Date(anchor * 1000);
  const endDate = new Date(startDate);

  if (interval === "month") {
    endDate.setMonth(endDate.getMonth() + intervalCount);
  } else if (interval === "year") {
    endDate.setFullYear(endDate.getFullYear() + intervalCount);
  } else if (interval === "week") {
    endDate.setDate(endDate.getDate() + 7 * intervalCount);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

export async function POST(request: Request): Promise<Response> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    return Response.json({ error: "Stripe secret key not configured." }, { status: 500 });
  }
  if (!webhookSecret) {
    return Response.json({ error: "Stripe webhook secret not configured." }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed:", err);
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      // -------------------------------------------------------------------
      // checkout.session.completed -- user completed Stripe Checkout
      // -------------------------------------------------------------------
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId) {
          console.error("[stripe/webhook] checkout.session.completed: no client_reference_id");
          break;
        }

        // Retrieve the full subscription to get period dates and price ID
        const subResponse = await stripe.subscriptions.retrieve(subscriptionId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub: any = subResponse;
        const priceId = sub.items?.data?.[0]?.price?.id ?? "";
        const tier = resolveTier(priceId);
        const { start: periodStart, end: periodEnd } = extractPeriodDates(sub);

        await upsertSubscription(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          plan: tier,
          status: mapStatus(sub.status),
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });

        await updateUserPlan(userId, tier);
        await resetUsageForNewCycle(userId, periodStart, periodEnd);

        console.log(`[stripe/webhook] checkout completed: user=${userId} plan=${tier}`);
        break;
      }

      // -------------------------------------------------------------------
      // customer.subscription.updated -- plan changes, renewals, etc.
      // -------------------------------------------------------------------
      case "customer.subscription.updated": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription: any = event.data.object;
        const subscriptionId = subscription.id;
        const customerId = subscription.customer as string;
        const priceId = subscription.items?.data?.[0]?.price?.id ?? "";
        const tier = resolveTier(priceId);

        const existing = await getSubscriptionByCustomerId(customerId);
        if (!existing) {
          console.error(`[stripe/webhook] subscription.updated: no user for customer=${customerId}`);
          break;
        }

        const oldPeriodEnd = existing.currentPeriodEnd;
        const { start: newPeriodStart, end: newPeriodEnd } = extractPeriodDates(subscription);

        await upsertSubscription(existing.userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          plan: tier,
          status: mapStatus(subscription.status),
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });

        await updateUserPlan(existing.userId, tier);

        if (oldPeriodEnd !== newPeriodEnd) {
          await resetUsageForNewCycle(existing.userId, newPeriodStart, newPeriodEnd);
          console.log(`[stripe/webhook] billing cycle renewed: user=${existing.userId}`);
        }

        console.log(`[stripe/webhook] subscription updated: user=${existing.userId} status=${subscription.status}`);
        break;
      }

      // -------------------------------------------------------------------
      // customer.subscription.deleted -- user cancelled or was refunded
      // -------------------------------------------------------------------
      case "customer.subscription.deleted": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subscription: any = event.data.object;
        const customerId = subscription.customer as string;

        const existing = await getSubscriptionByCustomerId(customerId);
        if (!existing) {
          console.error(`[stripe/webhook] subscription.deleted: no user for customer=${customerId}`);
          break;
        }

        await upsertSubscription(existing.userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          plan: "free",
          status: "canceled",
          cancelAtPeriodEnd: false,
          canceledAt: new Date().toISOString(),
        });

        await updateUserPlan(existing.userId, "free");

        console.log(`[stripe/webhook] subscription deleted: user=${existing.userId} downgraded to free`);
        break;
      }

      // -------------------------------------------------------------------
      // invoice.payment_failed -- payment retry needed
      // -------------------------------------------------------------------
      case "invoice.payment_failed": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice: any = event.data.object;
        const customerId = invoice.customer as string;

        const existing = await getSubscriptionByCustomerId(customerId);
        if (existing) {
          await upsertSubscription(existing.userId, {
            stripeCustomerId: customerId,
            plan: existing.plan as PlanTier,
            status: "past_due",
          });
          console.log(`[stripe/webhook] payment failed: user=${existing.userId} status=past_due`);
        }
        break;
      }

      // -------------------------------------------------------------------
      // invoice.paid -- successful recurring payment
      // -------------------------------------------------------------------
      case "invoice.paid": {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice: any = event.data.object;
        const customerId = invoice.customer as string;

        const existing = await getSubscriptionByCustomerId(customerId);
        if (existing && existing.status === "past_due") {
          await upsertSubscription(existing.userId, {
            stripeCustomerId: customerId,
            plan: existing.plan as PlanTier,
            status: "active",
          });
          console.log(`[stripe/webhook] payment recovered: user=${existing.userId} status=active`);
        }
        break;
      }

      default:
        console.log(`[stripe/webhook] unhandled event type: ${event.type}`);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("[stripe/webhook] handler error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Webhook handler failed." },
      { status: 500 },
    );
  }
}