# Austin Service Guide — Vision Document

**Project:** Austin Service Guide
**Date:** April 23, 2026
**Version:** 1.0
**Status:** Draft

---

## Executive Summary

The Austin Service Guide is a resident-facing web portal and administrative platform that transforms how City of Austin residents discover, access, and navigate city, county, state, federal, and nonprofit services. Instead of requiring residents to already know what programs exist and where to find them, the portal uses AI-powered intake and matching to build a personalized directory of services each resident is eligible for — surfaced on an interactive map showing exactly where and how to access them.

The system treats every resident as a first-class citizen from the moment they arrive, providing an experience that is proactive rather than reactive, personalized rather than generic, and comprehensive rather than siloed.

---

## The Problem

Austin's service delivery landscape is deeply fragmented:

- **311** handles ~300K municipal service requests per year (potholes, code violations, animal control) but does not address social services navigation
- **211 Texas** provides phone-based referrals but has no personalized digital experience
- **austintexas.gov** was redesigned in March 2026 but remains informational — organized by department, not by resident need
- **findhelp.org / ConnectATX** offers a directory of services but lacks AI-powered matching, risk assessment, or closed-loop tracking
- Residents must already know which program exists and which entity administers it to find help

**The result:** Eligible residents leave benefits on the table. At-risk residents don't receive prevention services until they're in crisis. Underserved communities face compounding barriers of language, digital literacy, transportation, and awareness.

### By the Numbers

- **101,800+** people served by Austin Public Health for food assistance alone in FY2025
- **20.07%** uninsured rate among Hispanic/Latino residents (vs. 7.04% for non-Hispanic White)
- **$101M** identified funding need for homelessness strategy (vs. $30.3M allocated)
- **28%** of Austin metro residents speak a non-English language at home — the city's Language Access Program identifies 12 threshold languages
- Food insecurity, healthcare access, housing costs, and mental health are Austin's top four challenges (2025 Community Health Assessment)

---

## The Vision

**One door. Every service. Personalized to you.**

A resident arrives at the Austin Service Guide. Without creating an account, they answer a brief, conversational set of questions — guided by an AI navigator that adapts its questions based on prior answers. Within minutes, the resident sees:

1. **A personalized service directory** — every city, county, state, federal, and nonprofit program they're likely eligible for, organized by life need (not by department)
2. **A risk assessment summary** — proactive identification of risks they may face (housing instability, food insecurity, healthcare gaps) with prevention-oriented service recommendations
3. **An interactive map** — showing every service location, with hours, contact info, transit routes, and (where available) wait times and appointment availability
4. **Next steps** — clear actions: schedule appointments, start applications, save results, share with a caseworker

For residents who create an account, the experience deepens: saved profiles, family household management, application tracking, status updates, and proactive notifications when new services become available or existing benefits need renewal.

For staff, an administrative console provides a clean, real-time view of who has signed up, what services they've expressed interest in, demographic patterns, service gap identification, and equity metrics.

---

## Competitive Landscape & How We Exceed It

### What Exists Today

| System                   | Strengths                                                           | Gaps Austin Service Guide Fills                                                          |
| ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **ACCESS NYC**           | 40+ program screener, 11 languages, no account required             | No AI matching, no risk assessment, no mapping, no proactive services, NYC-only programs |
| **LifeSG (Singapore)**   | Life-event design, 100+ services, proactive recommendations         | Government-only services, no nonprofit integration, no conversational AI intake          |
| **TAMM 3.0 (Abu Dhabi)** | 1000+ services, multi-agent AI, personal assistant                  | Not open-source, not transferable, different governance model                            |
| **e-Estonia**            | Once-only data, citizen audit trails, proactive life-event services | National-scale infrastructure, decades of investment, not replicable at city level       |
| **Denver "Sunny"**       | 90% satisfaction, 72 languages, 20% of 311 volume                   | Chatbot only — no eligibility screening, no service matching, no case tracking           |
| **findhelp.org**         | 1M+ program locations, full-stack enrollment                        | Directory model — no AI personalization, no risk assessment, no city-integrated mapping  |
| **Unite Us**             | Closed-loop referral tracking, HIPAA compliant                      | Healthcare-focused, requires organizational adoption, not resident-self-service          |

### How Austin Service Guide Exceeds All of Them

1. **Unified platform** — First U.S. city to combine AI-powered intake + benefits eligibility + risk assessment + interactive mapping + closed-loop tracking in one resident-facing portal
2. **Conversational AI navigator** — Not a keyword chatbot but a context-aware AI that conducts a structured intake conversation, adapts questions dynamically, and explains its recommendations
3. **Proactive risk identification** — Goes beyond "what are you looking for?" to identify risks the resident may not be aware of, based on their demographic profile and responses
4. **Life-event architecture** — Services organized by what happened to you (new baby, job loss, new to Austin, aging parent, housing crisis), not by which department runs them
5. **No-account-first design** — Full screening and recommendations without creating an account; accounts unlock persistence, tracking, and notifications
6. **Family/household mode** — One intake covers an entire household, mapping services for each member based on their individual eligibility
7. **Equity-native** — Built with Austin's Equity Assessment Tool framework from day one; equity dashboard tracks who is being served and identifies gaps
8. **Open-source, white-label** — Built on the civic-ai-starter template; any city can deploy their own instance

---

## Target Users

### Primary: Austin Residents

- **New to Austin** — recently moved, unfamiliar with available services
- **Life transition** — just had a baby, lost a job, experienced a death, housing crisis, aging parent, divorce, retirement
- **Low-income / underserved** — eligible for programs they don't know about
- **Non-English-speaking** — Spanish (~200K), Chinese, Hindi, Arabic, Vietnamese, French, Korean, and 100+ additional languages supported via AI-powered real-time translation
- **Seniors** — aging into new service eligibility, navigating Medicare/Medicaid
- **Veterans** — transitioning to civilian services, unaware of veteran-specific programs
- **People with disabilities** — seeking accessible services and accommodations
- **Caregivers** — navigating services on behalf of family members

### Secondary: Service Navigators & Community Partners

- **Social workers and case managers** — using the tool on behalf of clients
- **Nonprofit staff** — helping clients find additional services beyond their organization
- **Library staff** — assisting patrons at public access computers
- **211/311 operators** — using the tool to provide more comprehensive referrals

### Tertiary: City Staff & Administrators

- **Department heads** — understanding service demand and utilization patterns
- **Equity Office** — tracking equitable access across demographics
- **Budget analysts** — data-informed resource allocation
- **Program managers** — monitoring enrollment and identifying outreach opportunities

---

## Design Principles

1. **Resident-first, not department-first.** Every design decision should be evaluated from the resident's perspective. Services are organized by need, not by org chart.

2. **No dead ends.** Every screen should offer a clear next action. If a resident isn't eligible for a service, show alternatives. If a service location is closed, show the next nearest option.

3. **Progressive disclosure.** Start simple. Ask only what's needed for the current step. Reveal complexity only when the resident needs it.

4. **Trust through transparency.** Show exactly what data is collected, why, and who can see it. Never collect more than necessary. Let residents delete their data.

5. **Accessible by default.** WCAG 2.1 AA is the floor, not the ceiling. Multi-channel access (web, mobile, SMS, in-person kiosk mode) ensures no one is excluded.

6. **Equity as architecture.** Not a feature bolted on — the system's data model, analytics, and outreach are designed to identify and close access disparities.

7. **AI as guide, not gatekeeper.** AI recommendations are suggestions, never gatekeeping. Residents can always browse the full directory. AI explains its reasoning.

---

## Success Metrics

| Metric                                      | Target                                                                      | Rationale                                             |
| ------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| Resident service matches per session        | 5+ programs surfaced on average                                             | Demonstrates comprehensive matching                   |
| Completion rate of intake flow              | >70%                                                                        | Indicates the flow is not too long or invasive        |
| Resident satisfaction (post-session survey) | >85%                                                                        | Exceeds Denver Sunny's 90% on a broader scope         |
| Time from arrival to personalized results   | <5 minutes                                                                  | Competitive with ACCESS NYC's 10-step screener        |
| Multilingual usage                          | >25% non-English sessions; 100+ languages supported via AI                  | Reflects Austin's 28% non-English-speaking population |
| Return visitor rate                         | >30% within 90 days                                                         | Indicates ongoing value                               |
| Service referral follow-through             | >40% click-through to service details/applications                          | Measures actionable outcomes                          |
| Equity gap closure                          | Measurable reduction in demographic access disparities quarter-over-quarter | Core mission metric                                   |
| Admin console daily active users            | >80% of enrolled staff                                                      | Indicates staff adoption                              |
| New services discovered per resident        | 2+ programs the resident didn't know about                                  | Measures the "discovery" value proposition            |
