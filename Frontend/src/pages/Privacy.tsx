import { LegalPage, Section } from '../components/legal/LegalPage'

// ⚠️ Template that reflects what the app actually does, BUT review/adjust before publishing:
// the contact email, the responsible entity and the minimum age are yours to set.
const CONTACT = 'support@savoracook.com'
const UPDATED = 'June 24, 2026'

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <p>
        This Policy explains what data <strong>Savora</strong> (“the App”) collects, what we use it for,
        who we share it with and what rights you have. By using Savora you accept these practices.
      </p>

      <Section title="1. Data controller">
        <p>Savora is responsible for processing your data. For any privacy question you can write to us at{' '}
          <strong>{CONTACT}</strong>.</p>
      </Section>

      <Section title="2. What data we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account:</strong> email, password (stored encrypted, never in plain text), name and @username.</li>
          <li><strong>Profile you provide:</strong> cooking level, diet type, goal, allergies and time available.</li>
          <li><strong>Body metrics (optional):</strong> weight, height, birth year, sex and activity level — only if
            you choose to personalize your weekly nutrition goal. They are used to compute calorie estimates with a
            standard formula (Mifflin-St Jeor), are never shared with other users, and are not medical advice.</li>
          <li><strong>Content you create:</strong> generated recipes, conversations with the cooking assistant,
            weekly plan, photos you upload (posts, fridge analysis, photos of your dishes in courses),
            and messages/descriptions in clans.</li>
          <li><strong>Usage and progress:</strong> recipes generated, streak, level/XP, badges, course progress,
            and participation in duels and clans.</li>
          <li><strong>Social:</strong> posts, likes, friendships, blocks and reports.</li>
          <li><strong>Technical:</strong> push notification token (only if you enable them).</li>
          <li><strong>Subscription:</strong> your plan (FREE/PRO/CHEF) and its status. <strong>We do not store your
            card details</strong> — payments are handled by Apple/Google and RevenueCat.</li>
        </ul>
      </Section>

      <Section title="3. What we use your data for">
        <p>To generate and personalize recipes; show your profile and progress; moderate content; send you
          verification and password-recovery emails; send you notifications; manage your subscription; and for
          security and abuse prevention.</p>
      </Section>

      <Section title="4. Who we share your data with">
        <p>We do not sell your data. We share it only with providers that help us operate the App
          (data processors), and only what is necessary:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>OpenAI</strong> — generates recipes and chat responses, analyzes your photos (fridge/dishes)
            and <strong>moderates</strong> images and text. It receives the necessary text and images.</li>
          <li><strong>xAI</strong> — converts recipes to speech (voice feature of the paid plans); it receives the
            recipe text.</li>
          <li><strong>Supabase</strong> — database and storage for the images you upload.</li>
          <li><strong>Resend</strong> — sending of the App's emails.</li>
          <li><strong>Expo</strong> — sending of push notifications.</li>
          <li><strong>RevenueCat, Apple and Google</strong> — management and validation of subscriptions.</li>
        </ul>
        <p>These providers may process data outside your country. We choose providers with adequate data
          protection safeguards.</p>
      </Section>

      <Section title="5. No advertising or tracking">
        <p>We do not show ads or track your activity across other apps or websites.</p>
      </Section>

      <Section title="6. Retention and deletion">
        <p>We keep your data for as long as your account exists. You can <strong>delete your account</strong> at
          any time from <em>Profile → Danger zone</em>: deletion is irreversible — we permanently anonymize your
          data and remove your content (recipes, conversations, posts and images).</p>
      </Section>

      <Section title="7. Your rights">
        <p>You can access and correct your data from your profile, and delete it by deleting your account. If you
          want to exercise any other data protection right, write to us at {CONTACT}.</p>
      </Section>

      <Section title="8. Minors">
        <p>The App is not directed to children under 13 (or the minimum legal age in your country). If you are a
          minor, use Savora only with the permission of your parent or guardian.</p>
      </Section>

      <Section title="9. Security">
        <p>We protect your data with password encryption, secure connections and restricted access. No system is
          100% foolproof, but we work to keep your data safe.</p>
      </Section>

      <Section title="10. Changes">
        <p>We may update this Policy. If we make significant changes, we will notify you in the App.</p>
      </Section>

      <Section title="11. Contact">
        <p>Questions about your privacy? Write to us at <strong>{CONTACT}</strong>.</p>
      </Section>
    </LegalPage>
  )
}
