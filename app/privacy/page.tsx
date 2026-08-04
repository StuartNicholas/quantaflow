import { PRODUCT_NAME, PRODUCT_EMAIL } from "../../lib/constants";

export default function PrivacyPage() {
  const lastUpdated = "21 July 2026";

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

        <h1 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 8px", color: "#f1f5f9" }}>Privacy Policy</h1>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 0, marginBottom: 36 }}>
          Last updated: {lastUpdated}
        </p>

        <Section title="1. Who We Are">
          <p>Shilacon ("we", "us", or "our") operates Verixo, a cloud-based joinery and construction management platform ("Service"). This Privacy Policy explains how we collect, use, store, and protect your personal information when you use Verixo.</p>
          <p>We are committed to complying with the <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles (APPs).</p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong style={{ color: "#e2e8f0" }}>Account information.</strong> When you register, we collect your name, email address, and password (stored in hashed form). If you represent a business, we also collect your company name, ABN/NZBN, business address, and contact details.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Project and business data.</strong> We store data you enter into the Service, including project details, client and builder contacts, quotes, estimates, cabinet specifications, production records, colour schemes, and procurement information ("Customer Data"). This data belongs to you.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Usage and technical data.</strong> We collect information about how you use the Service, including pages visited, features used, actions taken, browser type, IP address, and device information. We use this to improve the Service and to detect security issues.</p>
          <p><strong style={{ color: "#e2e8f0" }}>AI usage data.</strong> When you use AI features, we log the number of tokens processed, the AI model used, the feature accessed, and the estimated cost. We do not store the full content of AI prompts or responses except as part of your Customer Data.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Payment information.</strong> Payment details are processed by our payment provider (Stripe) and we do not store your full card number. We retain billing records including invoice amounts, dates, and subscription status.</p>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use your information to:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Provide, operate, and improve the Service;</li>
            <li>Create and manage your account;</li>
            <li>Process payments and manage subscriptions;</li>
            <li>Send transactional communications (account confirmations, password resets, invoices);</li>
            <li>Monitor and enforce compliance with our Terms of Service;</li>
            <li>Detect, investigate, and prevent fraud or security incidents;</li>
            <li>Comply with legal obligations;</li>
            <li>Respond to your support requests and enquiries.</li>
          </ul>
          <p>We will not use your Customer Data to train AI models without your explicit consent.</p>
        </Section>

        <Section title="4. Legal Basis for Processing">
          <p>We process your personal information where it is necessary to:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Perform the contract with you (providing the Service);</li>
            <li>Comply with our legal obligations;</li>
            <li>Pursue our legitimate business interests (security, fraud prevention, product improvement), provided these do not override your rights;</li>
            <li>Where we rely on your consent, which you may withdraw at any time.</li>
          </ul>
        </Section>

        <Section title="5. Data Storage and Security">
          <p><strong style={{ color: "#e2e8f0" }}>Storage location.</strong> Your data is stored in Supabase, which is hosted on Amazon Web Services (AWS) infrastructure. Data is stored in the <strong style={{ color: "#e2e8f0" }}>ap-southeast-2 (Sydney, Australia)</strong> region by default.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Security measures.</strong> We implement industry-standard security measures, including:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Encryption at rest and in transit (TLS/SSL);</li>
            <li>Row-Level Security (RLS) ensuring your data is isolated from other tenants;</li>
            <li>Role-based access controls limiting which team members can access your data;</li>
            <li>Regular security reviews of our infrastructure and code.</li>
          </ul>
          <p>No method of electronic transmission or storage is 100% secure. We will notify you of any data breach affecting your personal information as required by Australian law.</p>
        </Section>

        <Section title="6. Sharing Your Information">
          <p>We do not sell, rent, or trade your personal information. We may share your information only with:</p>
          <p><strong style={{ color: "#e2e8f0" }}>Service providers.</strong> Trusted third parties who assist in operating the Service, including:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li><strong style={{ color: "#e2e8f0" }}>Supabase</strong> — database and authentication infrastructure;</li>
            <li><strong style={{ color: "#e2e8f0" }}>Vercel</strong> — application hosting and delivery;</li>
            <li><strong style={{ color: "#e2e8f0" }}>Anthropic / OpenAI</strong> — AI processing for AI features (plan images and text are sent to these providers' APIs);</li>
            <li><strong style={{ color: "#e2e8f0" }}>Stripe</strong> — payment processing.</li>
          </ul>
          <p>All service providers are bound by confidentiality obligations and may only use your information to provide services to us.</p>
          <p><strong style={{ color: "#e2e8f0" }}>Legal requirements.</strong> We may disclose information if required by law, court order, or government authority, or to protect the rights and safety of Shilacon, our users, or the public.</p>
        </Section>

        <Section title="7. AI Feature Data">
          <p>When you use AI features (such as plan upload and cabinet extraction), the images and text you submit are sent to Anthropic or OpenAI for processing. These providers operate under their own privacy policies and API usage terms. Architectural plans and project data sent through these features may be processed on servers outside Australia.</p>
          <p>We recommend you review Anthropic's and OpenAI's privacy policies before submitting sensitive or confidential project documents.</p>
        </Section>

        <Section title="8. Data Retention">
          <p>We retain your personal information and Customer Data for as long as your account is active. After account cancellation or termination:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li>Your data is available for export for <strong style={{ color: "#e2e8f0" }}>90 days</strong> after cancellation;</li>
            <li>After 90 days, your Customer Data is permanently deleted from our systems;</li>
            <li>We may retain minimal account records (email, billing history) for up to 7 years to comply with Australian taxation and accounting requirements.</li>
          </ul>
        </Section>

        <Section title="9. Your Rights">
          <p>Under Australian privacy law, you have the right to:</p>
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            <li><strong style={{ color: "#e2e8f0" }}>Access</strong> the personal information we hold about you;</li>
            <li><strong style={{ color: "#e2e8f0" }}>Correct</strong> inaccurate or incomplete personal information;</li>
            <li><strong style={{ color: "#e2e8f0" }}>Delete</strong> your personal information (subject to legal obligations);</li>
            <li><strong style={{ color: "#e2e8f0" }}>Export</strong> your Customer Data in a machine-readable format;</li>
            <li><strong style={{ color: "#e2e8f0" }}>Object</strong> to processing of your personal information in certain circumstances.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href={`mailto:${PRODUCT_EMAIL}`} style={{ color: "#f59e0b" }}>{PRODUCT_EMAIL}</a>. We will respond within 30 days.</p>
        </Section>

        <Section title="10. Cookies and Tracking">
          <p>The Service uses essential cookies and session tokens required for authentication and security. We do not use advertising trackers or third-party analytics cookies. Browser local storage may be used to save user preferences (such as theme settings).</p>
        </Section>

        <Section title="11. Children's Privacy">
          <p>The Service is intended for use by adults in a business context. We do not knowingly collect personal information from anyone under the age of 18. If you believe a minor has provided us with personal information, please contact us so we can remove it.</p>
        </Section>

        <Section title="12. Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. We will notify you of material changes by email or in-app notification with at least 14 days' notice. Continued use of the Service after the effective date constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="13. Complaints">
          <p>If you have a complaint about how we handle your personal information, please contact us first at <a href={`mailto:${PRODUCT_EMAIL}`} style={{ color: "#f59e0b" }}>{PRODUCT_EMAIL}</a>. We will attempt to resolve your complaint within 30 days.</p>
          <p>If you are not satisfied with our response, you may lodge a complaint with the <strong style={{ color: "#e2e8f0" }}>Office of the Australian Information Commissioner (OAIC)</strong> at <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" style={{ color: "#f59e0b" }}>oaic.gov.au</a>.</p>
        </Section>

        <Section title="14. Contact Us">
          <p>For privacy-related questions, requests, or complaints:</p>
          <p style={{ color: "#94a3b8", lineHeight: 2 }}>
            Shilacon<br />
            Email: <a href={`mailto:${PRODUCT_EMAIL}`} style={{ color: "#f59e0b" }}>{PRODUCT_EMAIL}</a>
          </p>
        </Section>

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #1e293b", textAlign: "center" }}>
          <a href="/" style={{ color: "#f59e0b", textDecoration: "none", fontSize: 13, marginRight: 24 }}>← Back to {PRODUCT_NAME}</a>
          <a href="/terms" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 13 }}>Terms of Service →</a>
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
