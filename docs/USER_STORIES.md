# Austin Service Guide — User Stories

**Project:** Austin Service Guide
**Date:** April 23, 2026
**Version:** 1.0
**Status:** Draft

---

## Story Map Overview

Stories are organized by epic, with priority tiers:

- **P0** — Must-have for MVP launch
- **P1** — High-value, target for launch if feasible
- **P2** — Post-launch enhancement
- **P3** — Future vision

---

## Epic 1: AI-Powered Intake & Onboarding

### P0 — MVP

**US-1.01: First-Visit Landing Experience**
As a resident visiting the portal for the first time,
I want to immediately understand what this site does and how it helps me,
so that I feel confident starting the process.

Acceptance Criteria:

- Landing page displays a clear value proposition in one sentence
- "Get Started" button is the dominant call-to-action
- Life Event pathway cards are visible below the fold as an alternative entry point
- Language selector in the header offers quick-switch to Austin's top 7 non-English languages (in native script) plus an "Other language" option; the AI assistant also accepts language switch requests mid-conversation
- Page loads in under 3 seconds on mobile

**US-1.02: Conversational Intake — Start**
As a resident,
I want to begin an intake conversation without creating an account,
so that I can see what services are available to me with zero friction.

Acceptance Criteria:

- Clicking "Get Started" opens the AI intake chat interface
- A brief privacy notice explains what data is collected and that nothing is stored without an account
- The AI greets me warmly and asks the first question
- I can answer by typing or by clicking quick-select buttons
- The interface works on mobile and desktop

**US-1.03: Conversational Intake — Adaptive Flow**
As a resident answering intake questions,
I want the AI to ask relevant follow-up questions based on my previous answers,
so that the process feels personal and efficient — not like a generic form.

Acceptance Criteria:

- If I say I have children, the AI asks about childcare needs; if I don't, it skips those questions
- If I indicate I'm a veteran, the AI includes veteran-specific questions
- If I indicate a crisis situation, the flow immediately surfaces emergency resources (US-1.07)
- Every question has a "skip" or "prefer not to answer" option
- The AI explains why each question matters in one brief sentence
- The full intake completes in under 5 minutes for a typical user

**US-1.04: Conversational Intake — Progress & Navigation**
As a resident in the middle of the intake,
I want to see how far along I am and go back to change previous answers,
so that I feel in control of the process.

Acceptance Criteria:

- A progress indicator shows approximate completion percentage
- I can scroll up to see my previous answers
- I can click on a previous answer to edit it, which triggers re-evaluation of subsequent questions
- I can exit the intake at any point and still see partial results based on what I've answered so far

**US-1.05: Intake in Any Language**
As a non-English-speaking resident,
I want to complete the entire intake and view results in my language,
so that I can use the portal without language barriers.

Acceptance Criteria:

- The AI assistant auto-detects my language from the browser's `Accept-Language` header and greets me in that language
- I can switch languages at any time by telling the AI ("habla español," "switch to Vietnamese," "한국어로 말해줘") — the assistant seamlessly continues in the new language
- I can also switch via the header language selector (top 7 non-English languages in native script, plus "Other language" free-text option supporting 100+ languages)
- The AI conducts the conversation natively in the selected language using GPT-5.4-mini — not post-hoc translation of English
- When I ask about services, the AI uses tool calls to search the English-canonical service catalog, then presents results translated into my language in real time
- Selecting Arabic switches the full layout to right-to-left (RTL)
- Crisis/emergency resources are pre-cached in the top 7 languages for instant display without AI round-trip delay
- URL-based language routing (e.g., `/es/`, `/zh/`, `/ar/`) makes translated pages shareable and bookmarkable

**US-1.06: Guided Onboarding Tour**
As a first-time visitor,
I want a brief optional tour of the portal's features,
so that I know what's available beyond the intake.

Acceptance Criteria:

- A dismissible tooltip tour highlights key features: intake, map, life events, save/share
- Tour is skippable with a single click
- Tour does not appear on subsequent visits (stored in localStorage)

**US-1.07: Crisis Detection & Emergency Pathway**
As a resident in an emergency situation,
I want to be immediately connected to crisis resources without completing the full intake,
so that I can get help right now.

Acceptance Criteria:

- If I mention homelessness, domestic violence, suicidal thoughts, or a food emergency, the AI immediately surfaces emergency contacts
- Crisis resources display with click-to-call phone buttons and addresses
- Key hotlines shown: 911, 988, SAFE Alliance (512-267-SAFE), Integral Care (512-472-HELP), 211
- After viewing crisis resources, I can choose to continue the intake or exit
- Crisis detection responds within 1 second (client-side keyword matching + AI classification)

---

### P1 — Launch Target

**US-1.08: Life Event Quick Start**
As a resident going through a specific life event,
I want to select my situation from a visual menu and get a focused set of relevant services,
so that I don't have to answer questions that aren't relevant to my current need.

Acceptance Criteria:

- Landing page shows life event cards: "New to Austin," "Just Had a Baby," "Lost My Job," "Retiring Soon," "Housing Crisis," "Caring for an Aging Parent," "Veteran Transitioning," "Leaving an Unsafe Situation," and others
- Selecting a life event opens a shorter, focused intake (3-8 questions)
- Results are a curated service bundle for that life event
- A "See More Services" option lets me complete the full intake for additional matches

**US-1.09: Return Visit — Resume Profile**
As a returning resident with an account,
I want the portal to remember my profile and show updated results,
so that I don't have to redo the intake every time.

Acceptance Criteria:

- After logging in, I see my previously matched services
- A banner prompts me to update my profile if it's been more than 30 days
- New services added since my last visit are highlighted with a "New" badge
- I can re-run the intake at any time to refresh my results

---

## Epic 2: Personalized Service Directory

### P0 — MVP

**US-2.01: View Matched Services**
As a resident who completed the intake,
I want to see a personalized list of services I'm likely eligible for,
so that I know exactly what help is available to me.

Acceptance Criteria:

- Services are grouped by category (Healthcare, Housing, Food, Employment, etc.)
- Each category shows a count of matched services
- Each service card shows: name, provider, one-line description, eligibility confidence (high/medium/possible), and distance from my zip code
- A summary banner shows total programs matched
- The AI provides a brief narrative summary explaining the top recommendations

**US-2.02: Filter & Sort Services**
As a resident viewing my matched services,
I want to filter and sort results by category, distance, and eligibility confidence,
so that I can focus on what matters most to me right now.

Acceptance Criteria:

- Filter chips at the top allow toggling by category
- Sort options: relevance (default), distance, alphabetical
- Eligibility confidence filter: show only high-confidence matches, or include possible matches
- Filters update results in real-time without page reload

**US-2.03: View Service Details**
As a resident interested in a specific service,
I want to see complete information about it,
so that I know if it's right for me and how to access it.

Acceptance Criteria:

- Detail page shows: full description, eligibility criteria, required documents, how to apply, location(s) with map, hours, contact info, languages supported, cost, accessibility features
- "Get Directions" button opens a mapping application
- "Share" button allows emailing or texting the service info
- Related services section shows 3-5 similar alternatives
- Last-verified date shows when the information was confirmed accurate

**US-2.04: AI Explanation of Recommendations**
As a resident viewing my results,
I want to understand why specific services were recommended to me,
so that I trust the results and can make informed decisions.

Acceptance Criteria:

- Each service card has a "Why this?" link that expands to show the matching reasoning
- Reasoning references specific intake answers ("Based on your household size and income range, you may qualify for...")
- The AI never claims certainty — language uses "may qualify," "likely eligible," "worth exploring"

---

### P1 — Launch Target

**US-2.05: Document Checklist**
As a resident planning to apply for a service,
I want to see a checklist of documents I'll need,
so that I can prepare everything before visiting or applying.

Acceptance Criteria:

- Each service detail page includes a "Documents You'll Need" section
- Common documents (ID, proof of income, proof of residence, etc.) are listed with descriptions of accepted forms
- Checklist is interactive — I can check off items I've gathered
- If I have an account, checked items persist across sessions

**US-2.06: Benefits Calculator**
As a resident viewing my matched services,
I want to see the estimated combined dollar value of benefits I may qualify for,
so that I understand the tangible impact of following through.

Acceptance Criteria:

- A summary card at the top of results shows estimated monthly and annual benefit value
- Calculation includes: SNAP value, utility assistance, childcare subsidies, healthcare savings, and other quantifiable programs
- Values are clearly labeled as estimates, not guarantees
- Clicking the estimate shows a breakdown by program

**US-2.07: Save & Share Results**
As a resident,
I want to save my results to my phone or share them with someone helping me,
so that I can refer back to them later.

Acceptance Criteria:

- "Save Results" button generates a downloadable PDF or shareable link
- "Email Results" and "Text Results" buttons send a formatted summary
- If I have an account, results are saved to my profile automatically
- Shared links work for 30 days and do not require an account to view

**US-2.08: Chat Follow-Up**
As a resident viewing my results,
I want to ask the AI follow-up questions about specific services or my eligibility,
so that I can get clarification without starting over.

Acceptance Criteria:

- A persistent "Ask a Question" chat button is available on the results page
- The AI has context about my intake answers and matched services
- I can ask things like "Am I eligible for SNAP?" or "What's the difference between these two clinics?"
- The AI answers based on the service catalog, never invents information

---

### P2 — Post-Launch

**US-2.09: Service Comparison**
As a resident choosing between similar services,
I want to compare them side by side,
so that I can pick the best option for my situation.

Acceptance Criteria:

- Checkbox on service cards allows selecting 2-3 for comparison
- Comparison view shows a table with key attributes: distance, hours, eligibility, cost, languages, accessibility
- Differences are highlighted

**US-2.10: Application Launchpad**
As a resident ready to apply for a service,
I want to be taken directly to the application with my information pre-filled where possible,
so that applying is as frictionless as possible.

Acceptance Criteria:

- Services with online applications show an "Apply Now" button linking directly to the application portal
- Where integration permits, basic info (name, address, household size) is pre-filled
- A disclaimer notes that pre-filled data should be verified before submitting

---

## Epic 3: Interactive Service Map

### P0 — MVP

**US-3.01: Map View of Services**
As a resident,
I want to see all my matched services on a map,
so that I can find services near me and plan my visits.

Acceptance Criteria:

- Full-width map shows all matched service locations as color-coded pins
- Legend explains pin colors by category
- Clicking a pin shows a popup with service name, address, hours, phone, and "View Details" link
- Map centers on my provided zip code
- Map is responsive and usable on mobile

**US-3.02: Map Filtering**
As a resident using the map,
I want to filter which service categories are shown,
so that I can focus on finding a specific type of service.

Acceptance Criteria:

- Category toggle buttons along the top or side of the map
- Toggling a category adds/removes its pins in real-time
- Distance radius filter: 1 mi, 5 mi, 10 mi, 25 mi, all
- "Open Now" filter shows only locations currently open

**US-3.03: List/Map Toggle**
As a resident,
I want to switch between map view and list view,
so that I can use whichever format is more helpful for my situation.

Acceptance Criteria:

- Toggle button switches between map and sortable list view
- List view shows the same filtered services with distance, hours, and a map link
- Both views stay synchronized — filtering in one applies to the other

---

### P2 — Post-Launch

**US-3.04: Transit Routing**
As a resident who relies on public transit,
I want to see Capital Metro routes and estimated travel times to service locations,
so that I can choose locations I can actually get to.

Acceptance Criteria:

- "Get Transit Directions" button on each service popup/detail page
- Shows nearest bus/rail stops and estimated travel time from my location
- Powered by Capital Metro GTFS data

**US-3.05: Near Me Geolocation**
As a resident on my phone,
I want to see services nearest to my current location,
so that I can find help right where I am.

Acceptance Criteria:

- "Near Me" button requests location permission and re-centers the map
- Services sorted by actual distance from current location
- Works on mobile browsers with GPS

---

## Epic 4: Risk Assessment & Prevention

### P0 — MVP

**US-4.01: Risk Factor Identification**
As a resident who completed the intake,
I want the system to identify areas where I might be at risk,
so that I can access prevention services before problems escalate.

Acceptance Criteria:

- Results page includes an "Areas Where We Can Help" section
- Risk areas are presented in supportive, non-clinical language
- Each risk area links to relevant prevention services
- Risk areas are derived from intake answers transparently — I can see which answers contributed

**US-4.02: Risk-Based Service Prioritization**
As a resident with identified risk factors,
I want prevention services to be prominently featured in my results,
so that I address the most urgent needs first.

Acceptance Criteria:

- Services addressing identified risks are marked with a "Recommended for You" indicator
- Risk-related services appear at the top of their respective categories
- The AI narrative summary mentions key risk areas and the services that address them

---

## Epic 5: Family & Household

### P1 — Launch Target

**US-5.01: Add Household Members**
As a resident seeking services for my family,
I want to add household members during intake,
so that the system finds services for everyone — not just me.

Acceptance Criteria:

- During intake, the AI asks if I'm seeking services for a household
- For each additional member, I provide: relationship, age range, and key attributes (veteran, disability, student, etc.)
- I can add up to 8 household members
- Each member's details take under 1 minute to enter

**US-5.02: Household Service Results**
As a head of household,
I want to see which services apply to which family members,
so that I can navigate services for my entire family in one place.

Acceptance Criteria:

- Results are tagged with the household member(s) each service applies to
- A household summary view shows all services across all members
- I can filter results by household member
- The benefits calculator shows combined household value

---

## Epic 6: Accounts & Persistence

### P1 — Launch Target

**US-6.01: Create Account**
As a resident who wants to save my results,
I want to create an account after completing the intake,
so that I can return and track my progress.

Acceptance Criteria:

- Account creation is offered after results are displayed (not before intake)
- Sign up with email + password or social login (via Azure AD B2C)
- Creating an account saves my intake profile and matched services
- Account creation is never required — the portal is fully functional without one
- Privacy policy and data handling explanation are clear and prominent

**US-6.02: Profile Management**
As a registered resident,
I want to update my profile information,
so that my service matches stay current as my situation changes.

Acceptance Criteria:

- Profile page shows all intake answers with edit capability
- Changing an answer triggers re-matching of services
- I can update household members
- I can delete my account and all associated data at any time

**US-6.03: Saved Services**
As a registered resident,
I want to save specific services to a personal list,
so that I can track the ones I'm pursuing.

Acceptance Criteria:

- "Save" button on each service card and detail page
- "My Saved Services" page shows all saved services with status
- I can mark services as "Applied," "Enrolled," "Not Eligible," or "Not Interested"
- Saved services are accessible after logging in from any device

---

### P2 — Post-Launch

**US-6.04: Notification Preferences**
As a registered resident,
I want to receive notifications about benefit renewals, new services, and appointments,
so that I stay on top of things without having to check the portal constantly.

Acceptance Criteria:

- Notification preferences page lets me opt in/out of: email notifications, SMS notifications (if phone provided), and push notifications (if PWA installed)
- Notification categories: new services matching my profile, benefit renewal reminders, service hour changes, portal announcements

---

## Epic 7: Administrative Console

### P0 — MVP

**US-7.01: Admin Login & Role-Based Access**
As a city staff member,
I want to log in to the admin console with my city credentials,
so that I can manage the portal with appropriate permissions.

Acceptance Criteria:

- Admin console is a separate route/section (`/admin`) with its own layout
- Authentication via Azure AD / Entra ID
- Four roles: Super Admin, Admin, Manager, Viewer
- Unauthorized access attempts are blocked and logged
- Staff sees only the features their role permits

**US-7.02: Resident Overview Dashboard**
As an admin,
I want to see an overview of all registered residents and their service interests,
so that I understand who is using the portal and what they need.

Acceptance Criteria:

- Dashboard shows key metrics: total residents, new signups (7d/30d), active users (7d/30d), top service categories
- Searchable, sortable table of registered residents
- Click-through to individual resident detail (services matched, services saved, activity timeline)
- Quick filters: date range, zip code, service category, language, household size

**US-7.03: Service Directory CRUD**
As an admin,
I want to add, edit, and deactivate services in the directory,
so that the portal stays current as services change.

Acceptance Criteria:

- Form-based interface for creating and editing service records
- All service fields editable: name, provider, description (English — AI translates to any language at runtime), eligibility, locations, hours, contact, documents, cost, categories, accessibility, languages, status
- Location fields auto-geocode for map placement
- Services can be deactivated (hidden from residents) without deletion
- Change history is preserved for each service record
- Bulk import via CSV for initial data load

**US-7.04: Demographics & Analytics Dashboard**
As an admin,
I want to view aggregate demographic breakdowns and usage analytics,
so that I can report on portal impact and identify outreach gaps.

Acceptance Criteria:

- Charts showing: age distribution, household sizes, zip code heatmap, language preferences, employment status, housing situation, top service categories
- All charts are interactive — clicking a segment filters the data
- Date range selector
- Export charts and data to PDF or CSV

---

### P1 — Launch Target

**US-7.05: Equity Dashboard**
As an equity officer,
I want to see portal usage overlaid with Austin demographic data,
so that I can identify underserved populations and target outreach.

Acceptance Criteria:

- Usage by race/ethnicity, income, zip code, language, and age compared to Austin census demographics
- Gap analysis highlighting underrepresented groups
- Geographic equity map showing usage density against census tracts
- Trend lines showing whether equity metrics are improving or declining

**US-7.06: Service Demand Analytics**
As a program manager,
I want to see which services are most in-demand and where,
so that I can allocate resources and advocate for funding.

Acceptance Criteria:

- Ranked list of services by number of matches, clicks, and saves
- Heatmap of demand by zip code and service category
- Unmet demand indicators: services with high eligibility matches but low follow-through (possible barriers)
- Time-series view of demand trends

**US-7.07: Eligibility Rules Management**
As an admin,
I want to edit the eligibility rules that determine which residents are matched to which services,
so that matching stays accurate as program criteria change.

Acceptance Criteria:

- Each service has an associated set of eligibility rules
- Rules are expressed as conditions on intake fields (e.g., income < 200% FPL AND household_size >= 3 AND zip_code IN [78702, 78721, ...])
- Rules can be edited through a form-based UI (not raw code)
- Changes take effect immediately after saving
- A "test" function allows testing a rule against a sample profile

**US-7.08: Reporting & Export**
As an admin,
I want to generate standard reports and export data,
so that I can share portal impact with leadership and stakeholders.

Acceptance Criteria:

- Pre-built report templates: Monthly Usage Summary, Service Demand Report, Demographic Profile, Equity Analysis
- Reports exportable as PDF and CSV
- Custom date ranges for all reports
- Scheduled report delivery via email (monthly, quarterly)

---

### P2 — Post-Launch

**US-7.09: Audit Log**
As a super admin,
I want to see a complete log of who accessed what data and when,
so that I can ensure data is handled responsibly and meet compliance requirements.

Acceptance Criteria:

- Log entries for: resident data views, service edits, report exports, login/logout, role changes
- Searchable by staff member, action type, date range
- Log entries are immutable (append-only)

**US-7.10: Service Gap Alerts**
As a program manager,
I want to be alerted when demand for a service category significantly exceeds supply,
so that I can take action before residents fall through the cracks.

Acceptance Criteria:

- Configurable thresholds per service category
- Email/dashboard alerts when thresholds are exceeded
- Alert includes: category, demand volume, available services, geographic concentration

**US-7.11: Intake Flow Customization**
As an admin,
I want to modify intake questions and add new ones,
so that the intake stays relevant as services and programs evolve.

Acceptance Criteria:

- Visual editor for intake question sequence
- Support for question types: multiple choice, free text, numeric, yes/no
- Branching logic: show/hide questions based on prior answers
- Preview mode to test changes before publishing
- Version control with rollback capability

---

## Epic 8: Accessibility & Inclusion

### P0 — MVP

**US-8.01: Screen Reader Compatibility**
As a visually impaired resident,
I want to navigate the entire portal with a screen reader,
so that I can access services independently.

Acceptance Criteria:

- All interactive elements have ARIA labels
- Chat messages use ARIA live regions for real-time announcement
- Focus management is correct during the intake flow (new messages receive focus appropriately)
- All images have alt text
- Form fields have associated labels

**US-8.02: Keyboard Navigation**
As a resident who cannot use a mouse,
I want to complete the full intake and browse services using only a keyboard,
so that the portal is usable for me.

Acceptance Criteria:

- All interactive elements are reachable via Tab
- Focus indicators are clearly visible
- Enter/Space activate buttons and links
- Escape closes modals and popups
- No keyboard traps

**US-8.03: Mobile Responsiveness**
As a resident using my phone,
I want the portal to work perfectly on a small screen,
so that I can use it wherever I am.

Acceptance Criteria:

- All features functional from 320px width up
- Touch targets are minimum 44x44px
- No horizontal scrolling
- Chat interface is comfortable on mobile
- Map is usable with touch gestures

**US-8.04: High Contrast & Reduced Motion**
As a resident with visual sensitivities,
I want high-contrast and reduced-motion options,
so that the portal is comfortable for me to use.

Acceptance Criteria:

- Respects system `prefers-color-scheme` and `prefers-reduced-motion` settings
- Manual high-contrast toggle in accessibility settings
- All animations can be disabled without losing functionality
- Minimum 4.5:1 contrast ratio in default theme

---

### P2 — Post-Launch

**US-8.05: Kiosk Mode**
As a library staff member setting up a public computer for residents,
I want to launch the portal in a simplified kiosk mode,
so that residents can use it without navigating a complex interface.

Acceptance Criteria:

- Kiosk mode accessible via URL parameter (`?mode=kiosk`)
- Simplified interface: larger text, fewer navigation options, no account features
- Auto-session-reset after 5 minutes of inactivity
- No data persists between sessions in kiosk mode

---

### P3 — Future Vision

**US-8.06: SMS-Only Pathway**
As a resident without internet access,
I want to text a number and receive service recommendations via SMS,
so that I can access help from any phone.

Acceptance Criteria:

- Dedicated SMS number for text-based intake
- Abbreviated intake via text message (5-8 questions)
- Results returned as a formatted text message with service names, phone numbers, and addresses
- Integration with Azure Communication Services

---

## Epic 9: Data & Privacy

### P0 — MVP

**US-9.01: Privacy-First Anonymous Use**
As a privacy-conscious resident,
I want to use the portal and get results without any of my data being stored,
so that I feel safe sharing sensitive information.

Acceptance Criteria:

- The intake works entirely without an account
- No cookies, server-side sessions, or tracking for anonymous users
- Intake data exists only in browser memory and is cleared when the tab is closed
- Privacy notice at the start of intake explains this clearly

**US-9.02: Data Deletion**
As a registered resident,
I want to delete my account and all associated data permanently,
so that I have full control over my information.

Acceptance Criteria:

- "Delete My Account" option in profile settings
- Confirmation dialog explains what will be deleted
- Deletion is complete and irreversible — no soft-delete retention period
- Deletion completes within 24 hours
- Confirmation email sent after deletion

**US-9.03: Transparent Data Usage**
As a resident,
I want to know exactly what data is collected, why, and who can see it,
so that I can make an informed decision about using the portal.

Acceptance Criteria:

- Plain-language privacy notice (not legalese) displayed before intake begins
- Each intake question has an optional "Why do we ask this?" tooltip
- Data usage summary available in account settings for registered users
- Admin data access is logged and auditable (US-7.09)

---

## Epic 10: Platform & Integration

### P1 — Launch Target

**US-10.01: White-Label Branding**
As a deploying organization,
I want to customize the portal's branding through a single configuration file,
so that I can deploy it for my city without modifying code.

Acceptance Criteria:

- All branding (colors, logo, name, tagline, typography) driven by `brand.config.json` (per civic-ai-starter pattern)
- Theme switching works for the full application including intake, results, map, and admin console
- Dark mode derived from brand config or configured explicitly

**US-10.02: Service Catalog API**
As a community partner organization,
I want to access the service catalog via API,
so that I can integrate Austin services into my own tools.

Acceptance Criteria:

- Public read-only REST API for service catalog (`/api/v1/services`)
- Filter by category, location radius, eligibility criteria
- Paginated results with standard JSON response format
- API key authentication for rate limiting
- OpenAPI/Swagger documentation

---

## Appendix: Story Priority Summary

| Priority  | Count  | Epics Covered                                                                           |
| --------- | ------ | --------------------------------------------------------------------------------------- |
| P0        | 18     | Intake, Directory, Map, Risk, Accessibility, Privacy, Admin                             |
| P1        | 14     | Life Events, Household, Accounts, Documents, Benefits Calc, Equity, Admin Analytics     |
| P2        | 8      | Comparison, Application Launchpad, Transit, Notifications, Kiosk, Audit, Intake Builder |
| P3        | 2      | SMS Pathway, Community Reviews                                                          |
| **Total** | **42** |                                                                                         |
