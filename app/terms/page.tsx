export default function TermsPage() {
  const lastUpdated = "21 July 2026";
  const effectiveDate = "21 July 2026";

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, rgba(245,158,11,0.06), transparent 30%), #07090c",
      color: "#e2e8f0",
      fontFamily: "Arial, sans-serif",
      padding: "40px 24px 80px",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 40 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: "#f59e0b", color: "#111827",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 20, flexShrink: 0,
          }}>V</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.1em", color: "#f1f5f9" }}>VERIXO</div>
            <div style={{ fontSize: 11, color: "#4b5f72", marginTop: 2, letterSpacing: "0.04em" }}>by Shilacon</div>
          </div>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 8px", color: "#f1f5f9" }}>Terms of Service</h1>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 0, marginBottom: 36 }}>
          Last updated: {lastUpdated} · Effective: {effectiveDate}
        </p>

        <Section title="1. Agreement to Terms">
          <p>These Terms of Service ("Terms") constitute a legally binding agreement between you ("Customer", "you", or "your") and Shilacon ("Shilacon", "we", "us", or "our"), governing your access to and use of Verixo, a cloud-based joinery and construction management platform ("Service").</p>
          <p>By registering an account, accessing, or using the Service, you confirm that you have read, understood, and agree to be bound by these Terms. If you are using the Service on behalf of a business or other legal entity, you represent that you have the authority to bind that entity to these Terms.</p>
          <p>If you do not agree to these Terms, you must not access or use the Service.</p>
        </Section>

        <Section title="2. The Service">
          <p>Verixo is a software-as-a-service (SaaS) platform designed for joinery manufacturers, cabinet makers, and construction businesses. The Service includes project management, estimating, quoting, production tracking, cabinet database management, AI-assisted takeoff, procurement, and related tools made available by Shilacon from time to time.</p>
          <p>Shilacon reserves the right to modify, update, or discontinue any feature of the Service at any time, with reasonable notice to active subscribers where practicable. We will not make changes that fundamentally reduce the core functionality of your subscribed plan without providing you the option to cancel and receive a pro-rata refund.</p>
        </Section>

        <Section title="3. Accounts and Registration">
          <p><strong style={{ color: "#e2e8f0" }}>Account creation.</strong> You must provide accurate, current, and complete information when creating your account. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Team accounts.</strong> A company account may have multiple users. The account owner (the person who registered the company) is responsible for all users added to the account, their actions within the Service, and all fees incurred.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Age and eligibility.</strong> You must be at least 18 years old and legally permitted to enter into contracts in your jurisdiction to use the Service.</p>
        </Section>

        <Section title="4. Subscriptions and Payment">
          <p><strong style={{ color: "#e2e8f0" }}>Subscription plans.</strong> Access to the Service is offered on a subscription basis. Current pricing and plan details are available on the Verixo pricing page. Plans may include a free trial or closed beta period as communicated at the time of sign-up.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Billing.</strong> Subscription fees are billed in advance on a monthly or annual basis (as selected) in Australian Dollars (AUD) unless otherwise stated. All fees are inclusive of GST where applicable.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Payment.</strong> You authorise Shilacon (and its payment processor) to charge your nominated payment method at the start of each billing period. If payment fails, we may suspend your access until payment is resolved.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Price changes.</strong> Shilacon may change subscription pricing with at least 30 days' written notice. Continued use of the Service after the effective date of a price change constitutes acceptance of the new pricing.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Refunds.</strong> Subscription fees are non-refundable except where required by Australian consumer law or where Shilacon has discontinued a feature that was material to your subscription.</p>
        </Section>

        <Section title="5. Cancellation and Termination">
          <p><strong style={{ color: "#e2e8f0" }}>Cancellation by you.</strong> You may cancel your subscription at any time through your account settings or by contacting us. Cancellation takes effect at the end of the current billing period; you will retain access until then.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Termination by Shilacon.</strong> We may suspend or terminate your account immediately if you breach these Terms, engage in fraudulent activity, or if required by law. We will provide notice where we are legally permitted to do so.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Effect of termination.</strong> On termination, your right to access the Service ceases. We will retain your data for 90 days after cancellation, during which time you may request an export. After that period, your data may be permanently deleted.</p>
        </Section>

        <Section title="6. Acceptable Use">
          <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Use the Service to violate any applicable law, regulation, or third-party rights;</li>
            <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure;</li>
            <li>Reverse engineer, decompile, or attempt to extract the source code of the Service;</li>
            <li>Use the Service to transmit malware, spam, or any harmful content;</li>
            <li>Resell or sublicense access to the Service without our prior written consent;</li>
            <li>Use the Service in a way that could damage, disable, or impair it or interfere with other users.</li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <p><strong style={{ color: "#e2e8f0" }}>Our IP.</strong> The Service, including its software, design, trademarks, and content (excluding Customer Data), is owned by Shilacon and protected by Australian and international intellectual property laws. Nothing in these Terms transfers any IP rights to you.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Your data.</strong> You retain full ownership of all data, content, and materials you input into the Service ("Customer Data"). You grant Shilacon a limited licence to process your Customer Data solely for the purpose of providing the Service to you.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Feedback.</strong> If you provide feedback or suggestions about the Service, you grant us the right to use that feedback without restriction or compensation to you.</p>
        </Section>

        <Section title="8. AI Features">
          <p>The Service includes AI-powered features such as automated takeoff, cabinet extraction, and scheme detection ("AI Features"). These features are provided as tools to assist your workflow and are not a substitute for professional judgment.</p>
          <p>AI outputs are generated probabilistically and may contain errors, omissions, or inaccuracies. You are solely responsible for reviewing, verifying, and approving all AI-generated content before relying on it for commercial, contractual, or construction purposes. Shilacon accepts no liability for losses arising from unreviewed AI outputs.</p>
          <p>AI feature availability and monthly usage limits depend on your subscription plan as specified in your account's entitlements.</p>
        </Section>

        <Section title="9. Confidentiality">
          <p>Each party agrees to keep confidential any non-public information disclosed by the other party in connection with the Service, and to use such information only as necessary to fulfill obligations under these Terms. This obligation survives termination of these Terms for a period of 3 years.</p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>To the maximum extent permitted by applicable law:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>The Service is provided "as is" without warranties of any kind, express or implied;</li>
            <li>Shilacon will not be liable for any indirect, incidental, special, consequential, or punitive damages;</li>
            <li>Shilacon's total aggregate liability to you will not exceed the amount you paid for the Service in the 3 months preceding the claim.</li>
          </ul>
          <p>Nothing in these Terms excludes or limits liability to the extent that it cannot be excluded or limited under Australian consumer law.</p>
        </Section>

        <Section title="11. Indemnification">
          <p>You agree to indemnify and hold harmless Shilacon and its directors, employees, and agents from any claims, damages, or expenses (including legal fees) arising from your use of the Service, your Customer Data, or your breach of these Terms.</p>
        </Section>

        <Section title="12. Third-Party Services">
          <p>The Service may integrate with or link to third-party services (such as accounting software, payment processors, or cloud storage providers). Shilacon is not responsible for the availability, accuracy, or practices of those services, and your use of them is governed by their respective terms.</p>
        </Section>

        <Section title="13. Changes to These Terms">
          <p>We may update these Terms from time to time. We will provide at least 14 days' notice of material changes by email or in-app notification. Continued use of the Service after the effective date of changes constitutes acceptance of the updated Terms.</p>
        </Section>

        <Section title="14. Governing Law and Disputes">
          <p>These Terms are governed by the laws of New South Wales, Australia, without regard to conflict-of-law principles. Any dispute arising from these Terms will be subject to the exclusive jurisdiction of the courts of New South Wales, Australia.</p>
          <p>Before initiating any legal action, the parties agree to attempt good-faith resolution through direct negotiation for a period of not less than 30 days.</p>
        </Section>

        <Section title="15. General">
          <p><strong style={{ color: "#e2e8f0" }}>Entire agreement.</strong> These Terms, together with any applicable Order Form or plan description, constitute the entire agreement between you and Shilacon regarding the Service.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Severability.</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force.</p>
          <p><strong style={{ color: "#e2e8f0" }}>No waiver.</strong> Failure by either party to enforce any right under these Terms will not be deemed a waiver of that right.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Assignment.</strong> You may not assign these Terms without our prior written consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets.</p>
        </Section>

        <Section title="16. Contact">
          <p>If you have any questions about these Terms, please contact Shilacon at:</p>
          <p style={{ color: "#94a3b8", lineHeight: 2 }}>
            Shilacon<br />
            Email: <a href="mailto:hello@verixo.com" style={{ color: "#f59e0b" }}>hello@verixo.com</a>
          </p>
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #1e293b", textAlign: "center" }}>
          <a href="/" style={{ color: "#f59e0b", textDecoration: "none", fontSize: 13, marginRight: 24 }}>← Back to Verixo</a>
          <a href="/privacy" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 13 }}>Privacy Policy →</a>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 15, fontWeight: 700, color: "#f1f5f9",
        margin: "0 0 12px", paddingBottom: 8,
        borderBottom: "1px solid #1e293b",
      }}>{title}</h2>
      <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.75 }}>
        {children}
      </div>
    </div>
  );
}
