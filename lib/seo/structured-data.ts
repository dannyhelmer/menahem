import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./constants";

// Rendered once, site-wide, from the root layout -- Organization and
// WebSite describe the site's identity regardless of which page a visitor
// lands on, and SoftwareApplication describes the product itself. A
// SearchAction is deliberately NOT included: schema.org's SearchAction is
// meant for a real search box that works for an anonymous visitor, and
// every part of Menahem that could serve as "search" requires a signed-in,
// approved account -- declaring one anyway would describe a capability
// that doesn't actually work for the person Google sent to try it.
export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/menahem-logo.png`,
    description: SITE_DESCRIPTION,
  };
}

export function buildWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
  };
}

export function buildSoftwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (web-based)",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free plan with 250 AI messages per month.",
    },
  };
}
