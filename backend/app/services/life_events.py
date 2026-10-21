"""Landing-page life-event scenarios: slugs, interview guidance, initial needs."""

from __future__ import annotations

from app.models import IntakeSession


def session_life_event_slug(session: IntakeSession) -> str:
    prefix = "life-event:"
    if session.entry_source.startswith(prefix):
        return normalize_life_event(session.entry_source[len(prefix):])
    return ""


def canonical_life_event_slug(slug: str) -> str:
    aliases = {
        "job-loss": "lost-job",
        "food-help": "need-food",
        "facing-eviction": "housing-crisis",
        "behind-on-rent": "housing-crisis",
        "having-baby": "new-baby",
        "medical-help": "need-healthcare",
        "healthcare": "need-healthcare",
        "senior-care": "senior-help",
        "veteran": "veteran-transition",
        "veteran-benefits": "veteran-transition",
        "legal-help": "legal-trouble",
        "childcare": "child-care",
    }
    return aliases.get(slug, slug)



def normalize_life_event(life_event: str) -> str:
    return life_event.strip().lower().replace("_", "-")


def life_event_context(life_event: str) -> str:
    """Return scenario-specific interview guidance for a landing-page entry."""
    slug = normalize_life_event(life_event)
    plans = {
        "lost-job": {
            "label": "Lost a Job",
            "categories": "employment, utilities, food, housing, healthcare",
            "first": (
                "Ask what changed most urgently since the job loss: rent, food, "
                "utilities, health insurance, job search, or something else."
            ),
            "scenario_questions": (
                "Confirm whether they are unemployed or had hours cut; ask if "
                "rent, food, utilities, or health coverage were affected; then "
                "continue with the core eligibility questions."
            ),
        },
        "job-loss": {
            "alias": "lost-job",
        },
        "need-food": {
            "label": "Need Food Help",
            "categories": "food, nutrition, childcare/family supports",
            "first": "Ask whether they need food today, SNAP help, or both.",
            "scenario_questions": (
                "Ask household size, whether children/seniors are included, and "
                "whether they can travel to a pantry or need nearby options."
            ),
        },
        "food-help": {
            "alias": "need-food",
        },
        "housing-crisis": {
            "label": "Housing Crisis",
            "categories": "housing, emergency, legal, utilities",
            "first": (
                "Ask their current housing situation first: behind on rent, "
                "eviction notice/court date, temporary stay, shelter need, or "
                "without housing."
            ),
            "scenario_questions": (
                "If eviction is involved, ask whether there is a notice or court "
                "date. If without housing, ask where they are staying tonight."
            ),
        },
        "facing-eviction": {
            "alias": "housing-crisis",
        },
        "behind-on-rent": {
            "alias": "housing-crisis",
        },
        "new-baby": {
            "label": "New Baby",
            "categories": "healthcare, childcare, food, family support",
            "first": (
                "Ask whether they need prenatal care, WIC/food, baby supplies, "
                "childcare, or health coverage first."
            ),
            "scenario_questions": (
                "Ask whether the baby is expected or already born, the child's "
                "age if born, and whether the parent/baby has health coverage."
            ),
        },
        "having-baby": {
            "alias": "new-baby",
        },
        "need-healthcare": {
            "label": "Need Healthcare",
            "categories": "healthcare, mental_health, disability",
            "first": (
                "Ask what kind of care they need: clinic visit, dental, mental "
                "health, prescriptions, health coverage, or urgent care."
            ),
            "scenario_questions": (
                "Ask whether they have insurance, whether the care is urgent, "
                "and whether cost, language, transportation, or prescriptions "
                "are barriers."
            ),
        },
        "medical-help": {
            "alias": "need-healthcare",
        },
        "healthcare": {
            "alias": "need-healthcare",
        },
        "mental-health": {
            "label": "Mental Health Support",
            "categories": "mental_health, healthcare, emergency, schools",
            "first": (
                "Ask what kind of support they want: counseling, crisis support, "
                "peer support, school/youth support, or another kind of help."
            ),
            "scenario_questions": (
                "Screen gently for immediate danger or self-harm. If the support "
                "is for a child or student, capture school/grade concerns."
            ),
        },
        "senior-help": {
            "label": "Senior Assistance",
            "categories": "senior, healthcare, transportation, food",
            "first": "Ask whether the support is for the resident or someone they care for.",
            "scenario_questions": (
                "Ask what support is needed most: meals, caregiving, benefits, "
                "transportation, healthcare, respite, or home safety."
            ),
        },
        "senior-care": {
            "alias": "senior-help",
        },
        "retiring": {
            "label": "Retiring",
            "categories": "senior, healthcare, transportation, benefits",
            "first": (
                "Ask what they are trying to plan for first: healthcare, meals, "
                "transportation, benefits, social support, or caregiving."
            ),
            "scenario_questions": (
                "Ask whether they already have Medicare or other coverage and "
                "whether mobility, transportation, meals, or benefits are the "
                "main concern."
            ),
        },
        "veteran-transition": {
            "label": "Veteran Transition",
            "categories": "veterans, housing, employment, healthcare",
            "first": (
                "Ask which veteran support is most helpful now: housing, VA "
                "benefits, healthcare, job help, or documents/navigation."
            ),
            "scenario_questions": (
                "Confirm whether the resident is the veteran or calling for one. "
                "If housing is mentioned, ask current housing situation before "
                "zip code or services."
            ),
        },
        "veteran-benefits": {
            "alias": "veteran-transition",
        },
        "veteran": {
            "alias": "veteran-transition",
        },
        "new-to-austin": {
            "label": "New to Austin",
            "categories": "utilities, healthcare, transportation, education, food",
            "first": (
                "Ask what they need help setting up first: healthcare, food, "
                "transportation, school, utilities, housing, or documents."
            ),
            "scenario_questions": (
                "Ask how recently they arrived, whether they have stable housing, "
                "and whether language, transportation, school enrollment, or "
                "health coverage are barriers."
            ),
        },
        "legal-trouble": {
            "label": "Legal Trouble",
            "categories": "legal, emergency, housing, immigration",
            "first": (
                "Ask what type of legal issue they are dealing with, without "
                "asking for private details they do not want to share."
            ),
            "scenario_questions": (
                "Ask whether there is a deadline, hearing, notice, eviction, "
                "family safety concern, immigration issue, or benefits issue."
            ),
        },
        "legal-help": {
            "alias": "legal-trouble",
        },
        "child-care": {
            "label": "Child Care Needs",
            "categories": "childcare, education, employment",
            "first": "Ask the child's age and what schedule they need covered.",
            "scenario_questions": (
                "Ask whether care is needed for work, school, training, or an "
                "emergency; ask about preferred location and whether cost is the "
                "main barrier."
            ),
        },
        "childcare": {
            "alias": "child-care",
        },
        "back-to-school": {
            "label": "Back to School",
            "categories": "education, employment, schools",
            "first": (
                "Ask what kind of program they want: GED, adult education, ESL, "
                "college help, job training, or school support for a child."
            ),
            "scenario_questions": (
                "Ask the learner's age or grade if relevant, current education "
                "level, schedule constraints, and whether transportation or "
                "technology access is a barrier."
            ),
        },
        "young-adult": {
            "label": "Becoming Independent",
            "categories": "education, employment, housing, healthcare",
            "first": (
                "Ask what they are trying to handle first: housing, job, school, "
                "healthcare, transportation, or basic needs."
            ),
            "scenario_questions": (
                "Ask current housing stability, work/school situation, and the "
                "most immediate barrier to becoming stable."
            ),
        },
        "aging-parent": {
            "label": "Aging Parent",
            "categories": "senior, healthcare, transportation, food, respite",
            "first": "Ask what kind of support their parent needs most right now.",
            "scenario_questions": (
                "Ask whether the need is meals, transportation, personal care, "
                "medical care, caregiver respite, home safety, or benefits."
            ),
        },
        "divorce": {
            "label": "Going Through Divorce",
            "categories": "legal, healthcare, childcare, housing",
            "first": (
                "Ask whether they need legal aid, counseling, housing, childcare, "
                "or financial support first."
            ),
            "scenario_questions": (
                "Ask whether there is a court deadline, child custody/childcare "
                "issue, housing change, safety concern, or loss of income."
            ),
        },
        "family-death": {
            "label": "Loss of a Family Member",
            "categories": "healthcare, legal, benefits, food",
            "first": (
                "Ask what help is most needed right now: grief support, legal "
                "paperwork, benefits, food, housing, or immediate expenses."
            ),
            "scenario_questions": (
                "Ask gently whether there is a legal/probate issue, benefits or "
                "income change, children or seniors affected, or urgent basic "
                "needs."
            ),
        },
        "new-disability": {
            "label": "New Disability",
            "categories": "disability, healthcare, employment, legal, transportation",
            "first": "Ask what has become hardest to manage since the disability changed.",
            "scenario_questions": (
                "Ask whether they need healthcare, benefits, assistive devices, "
                "transportation, workplace help, housing accessibility, or legal "
                "support."
            ),
        },
        "unsafe-situation": {
            "label": "Unsafe Situation",
            "categories": "emergency, legal, housing, healthcare",
            "first": (
                "Ask whether they are in immediate danger right now. If yes, "
                "prioritize 911/crisis resources before regular intake."
            ),
            "scenario_questions": (
                "If not in immediate danger, ask whether they need safe shelter, "
                "domestic violence support, legal help, counseling, or housing."
            ),
        },
        "healthspan": {
            "label": "Adding Healthy Years",
            "categories": "smoking_cessation, nutrition, physical_activity, mental_health, healthcare",
            "first": (
                "Ask which health goal they want to work on first: food/nutrition, "
                "movement, tobacco/vaping, stress/mental health, or healthcare."
            ),
            "scenario_questions": (
                "Ask what makes that goal hard right now, whether chronic "
                "conditions or mobility issues matter, and whether they prefer "
                "classes, coaching, clinics, or self-guided support."
            ),
        },
    }

    while isinstance(plans.get(slug), dict) and plans[slug].get("alias"):
        slug = plans[slug]["alias"]

    plan = plans.get(slug)
    if not plan:
        return (
            f"Entry scenario: the resident selected {slug.replace('-', ' ')}. "
            "Keep that scenario active through the interview, ask one practical "
            "follow-up question at a time, and only recommend services related "
            "to that scenario or needs the resident adds."
        )

    return (
        f"Entry scenario: the resident selected {plan['label']}.\n"
        "Scenario rule: this is not just an opener. Keep this path active until "
        "the plan is made. Ask scenario-specific follow-up questions before "
        "switching to generic eligibility questions. Ask one question at a time.\n"
        "Do not move to zip code, household size, income, or insurance until "
        "the resident has answered at least one scenario-specific detail beyond "
        "the card they selected, unless that generic field is itself the next "
        "scenario-specific detail listed here.\n"
        f"Primary service categories to preserve in matching: {plan['categories']}.\n"
        f"First follow-up: {plan['first']}\n"
        f"Scenario-specific details to collect: {plan['scenario_questions']}\n"
        "After the scenario-specific details are clear, collect the core intake "
        "fields still needed: zip code, household size, housing situation, "
        "employment, income, insurance, and urgent risk signals. Search and "
        "recommend services only after enough detail is collected, and keep the "
        "recommendations tied to this scenario plus any additional needs the "
        "resident stated."
    )


def needs_from_life_event(life_event: str) -> list[str]:
    """Map a landing-page life-event slug into initial need categories."""
    slug = normalize_life_event(life_event)
    mapping = {
        "lost-job": ["employment"],
        "job-loss": ["employment"],
        "food-help": ["food"],
        "need-food": ["food"],
        "housing-crisis": ["housing", "emergency"],
        "facing-eviction": ["housing", "legal"],
        "behind-on-rent": ["housing", "utilities"],
        "medical-help": ["healthcare"],
        "need-healthcare": ["healthcare"],
        "healthcare": ["healthcare"],
        "childcare": ["childcare"],
        "child-care": ["childcare"],
        "having-baby": ["childcare", "healthcare", "food"],
        "new-baby": ["childcare", "healthcare", "food"],
        "senior-care": ["senior"],
        "senior-help": ["senior"],
        "veteran": ["veterans"],
        "veteran-benefits": ["veterans"],
        "veteran-transition": ["veterans", "employment", "housing", "healthcare"],
        "legal-help": ["legal"],
        "legal-trouble": ["legal"],
        "transportation": ["transportation"],
        "mental-health": ["mental_health", "healthcare"],
        "back-to-school": ["education", "schools"],
        "new-to-austin": ["utilities", "transportation", "education", "food", "housing", "healthcare"],
        "retiring": ["senior", "healthcare", "transportation"],
        "aging-parent": ["senior", "healthcare", "transportation"],
        "young-adult": ["education", "employment", "housing"],
        "divorce": ["legal", "healthcare", "childcare"],
        "family-death": ["healthcare", "legal"],
        "new-disability": ["disability", "healthcare", "employment", "legal"],
        "unsafe-situation": ["emergency", "legal", "housing"],
        "healthspan": ["smoking_cessation", "nutrition", "physical_activity", "mental_health", "healthcare"],
    }
    if slug in mapping:
        return mapping[slug]
    fallback = slug.replace("-", " ").strip()
    return [fallback] if fallback else []
