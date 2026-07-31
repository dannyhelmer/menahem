import Stripe from 'stripe';
import { withAuth } from '@/lib/auth/with-auth';
import { SITE_URL } from '@/lib/seo/constants';

export const POST = withAuth(async (_request, _ctx, user) => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRO_PRICE_ID;

  if (!stripeSecretKey) {
    return Response.json({ error: 'Stripe secret key is not configured.' }, { status: 500 });
  }

  if (!priceId) {
    return Response.json({ error: 'Stripe Pro price ID is not configured.' }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        userEmail: user.email,
        plan: 'pro',
      },
      customer_email: user.email,
      success_url: SITE_URL + '/billing/success',
      cancel_url: SITE_URL + '/pricing',
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('[stripe] checkout session creation failed:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session.' },
      { status: 500 },
    );
  }
});
