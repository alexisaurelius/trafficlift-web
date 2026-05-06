import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export const metadata: Metadata = {
  title: "Privacy Policy & Terms of Use | TrafficLift",
  description:
    "Privacy Policy and Terms of Use for TrafficLift SEO and CRO audit services at trafficlift.ai.",
  alternates: {
    canonical: "https://www.trafficlift.ai/privacy-policy-terms-of-use/",
  },
};

export default async function PrivacyPolicyTermsPage() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--on-surface)]">
      <header className="border-b border-[color:color-mix(in_oklab,var(--primary)_8%,white)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/" className="font-manrope text-2xl font-extrabold tracking-tight text-[var(--primary)]">
            TrafficLift
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/#pricing" className="hidden text-sm font-semibold text-[var(--on-surface)]/65 sm:inline">
              Pricing
            </Link>
            <Link href={userId ? "/dashboard" : "/sign-in"} className="text-sm font-semibold text-[var(--primary)]/75">
              Sign In
            </Link>
            <Link
              href={userId ? "/dashboard" : "/sign-up"}
              className="rounded-xl bg-[var(--primary)] px-5 py-2 text-sm font-bold text-white"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 md:px-6 md:pt-14">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--on-surface)]/55">Legal</p>
        <h1 className="font-manrope mt-2 text-3xl font-extrabold tracking-tight text-[var(--primary)] md:text-4xl">
          Privacy Policy &amp; Terms of Use
        </h1>
        <p className="mt-3 text-sm text-[var(--on-surface)]/65">
          Last updated: <time dateTime="2026-05-06">May 6, 2026</time>
        </p>
        <p className="mt-6 rounded-xl bg-[var(--surface-container-low)] p-4 text-sm leading-relaxed text-[var(--on-surface)]/78">
          TrafficLift (&quot;we,&quot; &quot;us&quot;) operates the websites and services available at{" "}
          <a href="https://www.trafficlift.ai" className="font-semibold text-[var(--primary)] underline underline-offset-2">
            https://www.trafficlift.ai
          </a>{" "}
          (the &quot;Service&quot;). These documents explain how we handle personal information and the rules for using the
          Service. They are not legal advice; consider consulting counsel for your situation.
        </p>

        <nav className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
          <a href="#privacy-policy" className="text-[var(--primary)] underline underline-offset-4">
            Privacy Policy
          </a>
          <a href="#terms-of-use" className="text-[var(--primary)] underline underline-offset-4">
            Terms of Use
          </a>
        </nav>

        <article id="privacy-policy" className="mt-14 scroll-mt-24 border-t border-[color:color-mix(in_oklab,var(--primary)_12%,transparent)] pt-12">
          <h2 className="font-manrope text-2xl font-extrabold text-[var(--primary)]">Privacy Policy</h2>

          <section className="mt-8 space-y-4 text-[15px] leading-relaxed text-[var(--on-surface)]/82">
            <h3 className="font-manrope text-lg font-bold text-[var(--on-surface)]">1. Scope</h3>
            <p>
              This Privacy Policy describes how we collect, use, store, and share information when you visit our marketing
              pages, create an account, purchase plans or credits, request SEO or conversion-rate (CRO) audits, or otherwise
              interact with the Service.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">2. Information we collect</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-[var(--on-surface)]">Account and authentication data.</strong> When you register or
                sign in, we rely on Clerk to authenticate you. Clerk may process identifiers such as your email address and
                profile details you choose to share with us through that flow.
              </li>
              <li>
                <strong className="text-[var(--on-surface)]">Billing data.</strong> Payments are processed by Stripe. We
                receive limited billing-related records (for example, subscription status, customer identifiers Stripe assigns,
                and transaction references) needed to fulfill purchases and maintain your plan or credits.
              </li>
              <li>
                <strong className="text-[var(--on-surface)]">Audit inputs and deliverables.</strong> To run audits you submit
                URLs, target keywords or similar inputs, and we generate reports, scores, checklist items, and related content.
                We store these materials so you can access them in your dashboard and receive notifications when audits
                complete.
              </li>
              <li>
                <strong className="text-[var(--on-surface)]">Technical and usage data.</strong> Like most hosted sites, our
                infrastructure may log standard technical information (such as IP address, device or browser type, timestamps,
                and referral URLs) for security, reliability, and debugging.
              </li>
              <li>
                <strong className="text-[var(--on-surface)]">Communications.</strong> If you email us (for example at{" "}
                <a href="mailto:contact@trafficlift.ai" className="font-semibold text-[var(--primary)] underline">
                  contact@trafficlift.ai
                </a>
                ), we retain those messages as needed to respond and operate the Service.
              </li>
            </ul>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">3. How we use information</h3>
            <p>We use the categories above to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Provide, operate, secure, and improve the Service;</li>
              <li>Create and manage accounts, allocate credits, and deliver audit reports;</li>
              <li>Process payments and respond to billing requests;</li>
              <li>Send transactional messages (such as audit-ready notifications) and respond to support inquiries;</li>
              <li>Meet legal obligations and enforce our Terms of Use.</li>
            </ul>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">4. Sharing and subprocessors</h3>
            <p>
              We do not sell your personal information. We share data with service providers who process it on our behalf under
              contractual safeguards, including authentication (Clerk), payments (Stripe), hosting and infrastructure (such as
              our deployment platform and database providers), and email delivery as applicable. Those providers may only use
              information as instructed to deliver their services.
            </p>
            <p>
              We may disclose information if required by law, court order, or governmental request, or when we believe
              disclosure is necessary to protect the rights, safety, or integrity of TrafficLift, our users, or the public.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">5. Shared audit links</h3>
            <p>
              If you use a feature that generates a shareable link to an audit report, anyone with that link may be able to view
              the shared content until you revoke access or we disable the link. Only share links with recipients you trust.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">6. Retention</h3>
            <p>
              We retain information for as long as needed to provide the Service, comply with law, resolve disputes, and enforce
              agreements. You may request deletion of your account subject to legitimate retention needs (for example,
              finalized billing records).
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">7. Security</h3>
            <p>
              We implement administrative, technical, and organizational measures designed to protect information. No online
              service is completely secure; you share information at your own risk beyond what reasonable safeguards can address.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">8. International transfers</h3>
            <p>
              We may process and store information in the United States and other countries where we or our vendors operate.
              Those jurisdictions may have different data-protection laws than your home region.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">9. Your choices and rights</h3>
            <p>
              Depending on where you live, you may have rights to access, correct, delete, or restrict certain processing of
              personal information, or to object to processing or port data. To exercise applicable rights, contact{" "}
              <a href="mailto:contact@trafficlift.ai" className="font-semibold text-[var(--primary)] underline">
                contact@trafficlift.ai
              </a>
              . We may need to verify your request. You may also lodge a complaint with your local supervisory authority where
              provided by law.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">10. Children</h3>
            <p>The Service is not directed to children under 13 (or the minimum age required in your jurisdiction).</p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">11. Changes</h3>
            <p>
              We may update this Privacy Policy from time to time by posting a revised version on this page and updating the
              &quot;Last updated&quot; date.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">12. Contact</h3>
            <p>
              Questions about privacy:{" "}
              <a href="mailto:contact@trafficlift.ai" className="font-semibold text-[var(--primary)] underline">
                contact@trafficlift.ai
              </a>
            </p>
          </section>
        </article>

        <article id="terms-of-use" className="mt-16 scroll-mt-24 border-t border-[color:color-mix(in_oklab,var(--primary)_12%,transparent)] pt-12">
          <h2 className="font-manrope text-2xl font-extrabold text-[var(--primary)]">Terms of Use</h2>

          <section className="mt-8 space-y-4 text-[15px] leading-relaxed text-[var(--on-surface)]/82">
            <h3 className="font-manrope text-lg font-bold text-[var(--on-surface)]">1. Agreement</h3>
            <p>
              By accessing or using the Service, you agree to these Terms of Use and our Privacy Policy. If you do not agree,
              do not use the Service.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">2. The Service</h3>
            <p>
              TrafficLift provides software-assisted SEO and CRO auditing tools that analyze pages you submit and produce
              structured findings and recommendations. Outputs combine automated analysis with product rules described on our
              website. We may modify features, pricing, credit mechanics, or availability with reasonable notice where
              practicable.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">3. Accounts</h3>
            <p>
              You must provide accurate registration information and safeguard your credentials. You are responsible for
              activity under your account. Notify us promptly at{" "}
              <a href="mailto:contact@trafficlift.ai" className="font-semibold text-[var(--primary)] underline">
                contact@trafficlift.ai
              </a>{" "}
              if you suspect unauthorized access.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">4. Customer obligations</h3>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                You represent that you have authority to submit each URL for analysis and that doing so does not violate
                applicable law, contracts, or third-party rights.
              </li>
              <li>You will not misuse the Service (for example probing third-party sites without permission, scraping our
                infrastructure, attempting to bypass billing or credit limits, or interfering with other users).</li>
              <li>You will comply with acceptable-use expectations of integrated providers (such as Clerk and Stripe).</li>
            </ul>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">5. Plans, credits, and billing</h3>
            <p>
              Paid access may include subscriptions, one-time purchases, or bundles described at checkout. Fees are processed
              through Stripe; additional Stripe terms may apply. Credits or allowances are consumed when audits run according to
              product rules shown in your dashboard or checkout flow.
            </p>
            <p>
              You may cancel recurring subscriptions through the Billing area of your dashboard where that option is offered.
              Cancellation typically stops renewal but does not refund prior periods unless required by law or expressly stated
              during purchase.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">6. Intellectual property</h3>
            <p>
              TrafficLift retains all rights in the Service, branding, templates, prompts, scoring models, and aggregated
              analytics. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable license to use audit
              outputs for your internal business purposes. You may not resell raw access to the Service or systematically
              redistribute reports outside your organization without our written consent.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">7. Disclaimers</h3>
            <p className="uppercase tracking-wide text-[var(--on-surface)]/70">
              THE SERVICE AND ALL AUDITS, REPORTS, SCORES, AND RECOMMENDATIONS ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
              AVAILABLE.&quot; WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              Audit outputs are informational and depend on data you supply and conditions at analysis time. We do not guarantee
              search rankings, traffic levels, revenue, AI-overview placement, or conversion outcomes. You remain solely
              responsible for implementing changes on your properties and for compliance with search-engine or advertising
              platform policies.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">8. Limitation of liability</h3>
            <p className="uppercase tracking-wide text-[var(--on-surface)]/70">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, TRAFFICLIFT AND ITS AFFILIATES WILL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR
              BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p>
              OUR AGGREGATE LIABILITY FOR ANY CLAIM ARISING OUT OF THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS
              YOU PAID TO TRAFFICLIFT FOR THE SERVICE IN THE THREE (3) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM OR (B)
              ONE HUNDRED U.S. DOLLARS (USD $100), IF NO FEES APPLIED IN THAT PERIOD.
            </p>
            <p>Some jurisdictions do not allow certain limitations; in those cases our liability is limited to the fullest extent allowed by law.</p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">9. Indemnity</h3>
            <p>
              You will defend and indemnify TrafficLift against claims, damages, losses, or expenses (including reasonable
              attorneys&apos; fees) arising from your misuse of the Service, your submissions, or your violation of these Terms or
              applicable law.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">10. Suspension and termination</h3>
            <p>
              We may suspend or terminate access if you materially breach these Terms, create risk or legal exposure, or if we
              discontinue the Service. Provisions that by their nature should survive (such as intellectual property,
              disclaimers, limitations, indemnity) will survive termination.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">11. Governing law and disputes</h3>
            <p>
              Unless mandatory local law requires otherwise, these Terms are governed by the laws of the State of Delaware,
              USA, excluding conflict-of-law rules. Courts in Delaware have exclusive jurisdiction over disputes, except where
              prohibited; you consent to personal jurisdiction there.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">12. Changes</h3>
            <p>
              We may revise these Terms by posting updates on this page and changing the &quot;Last updated&quot; date.
              Continued use after changes become effective constitutes acceptance of the revised Terms.
            </p>

            <h3 className="font-manrope pt-4 text-lg font-bold text-[var(--on-surface)]">13. Contact</h3>
            <p>
              Questions about these Terms:{" "}
              <a href="mailto:contact@trafficlift.ai" className="font-semibold text-[var(--primary)] underline">
                contact@trafficlift.ai
              </a>
            </p>
          </section>
        </article>

        <footer className="mt-16 border-t border-[color:color-mix(in_oklab,var(--primary)_12%,transparent)] pt-8 text-center text-xs text-[var(--on-surface)]/55">
          © {new Date().getFullYear()} TrafficLift ·{" "}
          <Link href="/" className="underline underline-offset-2">
            Home
          </Link>
        </footer>
      </main>
    </div>
  );
}
