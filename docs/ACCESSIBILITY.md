# Accessibility

Target: WCAG 2.2 AA, with elder-friendly care workflows. This is a target, not a conformance certification.

Semantic landmarks, a skip link, real buttons/links, labeled controls, textual state labels, visible high-contrast focus rings, and explicit validation messages support keyboard and assistive technology use. Radix Dialog handles focus containment, Escape dismissal, accessible title/description, and restoration. Primary controls are at least 48px high. Compact navigation and secondary controls generally remain at least 44px.

The interface uses a ink/ivory/powder palette, lemon accents and warm light surfaces, no hover-only operations, no required animations, reduced-motion support, and responsive single-column forms. Larger text and higher contrast preferences are browser-local. Read-aloud is user-initiated speech synthesis and requires no microphone.

Medication confirmations require a clearly labeled confirmation dialog. Taken, Skipped, and Unconfirmed states include words rather than relying on color. Assistance explains that requesting help does not mean someone has responded. Charts have a tabular alternative with exact values and a documented denominator.

Automated axe checks cover login, registration, recovery, privacy, owner/caregiver dashboards, original care pages, all new tool routes, medication/appointment/invitation dialogs, task/stock/comparison states and mobile CareDay. Both suites passed, with 27 audited states and zero detected violations in the clean 3.0 run. Playwright also checks six viewport widths, keyboard confirmation/calendar navigation, Escape dismissal, language switching and 200% root text sizing without horizontal overflow. See FINAL_AUDIT.md for evidence and TESTING.md for reproduction.

Human screen-reader testing with NVDA/JAWS/VoiceOver, real elder usability sessions, high zoom testing across browsers, and cognitive accessibility review remain release tasks. Core interface controls support English, Hindi and Tamil, with local language selection and appropriate fonts/speech language. Untranslated explanatory/legal copy falls back to English; clinical and user-entered text stays verbatim. Complete copy translation and native-speaker usability review remain release tasks.
