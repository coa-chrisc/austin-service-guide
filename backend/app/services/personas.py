"""Demo personas for the four PH-commissioner scenarios.

A persona seeds an intake session with a baseline profile + a canned opening
message. The live LLM then drives the rest of the conversation and may
overwrite seeded fields if what the resident actually says contradicts the
seed (e.g. "I'm a parent of a construction worker, not the worker myself").

Used by ``POST /api/v1/intake/load-persona`` and the ``?demo=1`` launcher
on the resident landing page.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models import ResidentProfile, SchoolAgeChild


@dataclass
class ScriptedTurn:
    role: str  # "user" or "assistant"
    content: str
    delay_ms: int = 800  # typing-indicator pause before this bubble appears


@dataclass
class Persona:
    id: str
    label: str
    language: str
    seed_profile: ResidentProfile
    opening_message: str
    persona_note: str
    script: list[ScriptedTurn] = field(default_factory=list)


# A shared note appended to every persona — keeps the model honest about
# the seed being a hypothesis, not a fact.
_HYBRID_NOTE_PREFIX = (
    "This resident entered through a demo persona launcher. The profile "
    "is pre-seeded with a hypothesis, but treat it as a starting point — "
    "not a fact. Listen carefully to what the resident actually says. "
    "If their description contradicts the seed (different role, different "
    "household, different need), call extract_profile to overwrite. "
    "Adapt your matches to the person you're actually talking to."
)


_PERSONAS: dict[str, Persona] = {
    "heat-outdoor-worker": Persona(
        id="heat-outdoor-worker",
        label="Heat — outdoor worker, broken AC",
        language="en",
        seed_profile=ResidentProfile(
            age_range="40s",
            household_size=4,
            zip_code="78744",
            housing_situation="renting",
            employment_status="full-time",
            income_bracket="$20,000-$30,000",
            insurance_status="uninsured",
            has_children=True,
            languages_spoken=["en", "es"],
            primary_language="es",
            is_outdoor_worker=True,
            has_ac=False,
            has_chronic_conditions=True,
            immediate_needs=["utilities", "healthcare"],
        ),
        opening_message=(
            "Hi — I do roadway construction here in 78744. My AC unit "
            "broke last week and I can’t afford to fix it before the "
            "next heat wave. I’ve also got high blood pressure. Is "
            "there any help out there for someone like me?"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Seed hypothesis: outdoor worker in extreme-heat exposure with "
            "no home cooling and a chronic condition that compounds heat "
            "risk. Likely fits for cooling centers, utility/heat assistance, "
            "and primary-care-level healthcare. But verify — the "
            "resident might be calling on behalf of a coworker, a parent, "
            "or a neighbor."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "I'm so glad you reached out — heat illness can escalate "
                    "fast for someone in your situation. Let me ask a few "
                    "quick questions so I can match you to the right help. "
                    "First, is anyone else in your household at risk too — "
                    "kids, an older parent, anyone with health conditions?"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "Yeah, my wife and two kids live with me. The kids are "
                    "fine but my wife has asthma and the heat makes it worse."
                ),
                delay_ms=1200,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Thank you — that's important. With your blood pressure "
                    "and her asthma, both of you are heat-vulnerable. Two "
                    "more quick things: are you currently uninsured or do "
                    "you have any coverage? And is the rent and utilities "
                    "current, or are you behind?"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "No insurance for me. Rent is paid but the electric bill "
                    "is two months behind because I had to put money toward "
                    "the AC repair quote."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Got it. I'm going to put together a plan that covers "
                    "all three: somewhere cool right now, help paying down "
                    "that electric bill plus the AC fix, and a clinic that "
                    "will see you uninsured. One moment…"
                ),
                delay_ms=1100,
            ),
        ],
    ),

    "schools-anxious-student": Persona(
        id="schools-anxious-student",
        label="Schools — anxious 7th grader",
        language="en",
        seed_profile=ResidentProfile(
            age_range="40s",
            household_size=3,
            zip_code="78753",
            housing_situation="renting",
            employment_status="full-time",
            income_bracket="$30,000-$40,000",
            insurance_status="employer",
            has_children=True,
            languages_spoken=["en"],
            primary_language="en",
            school_age_children=[
                SchoolAgeChild(
                    grade="7",
                    district="AISD",
                    concerns=["anxiety", "attendance"],
                ),
            ],
            immediate_needs=["mental health"],
        ),
        opening_message=(
            "My daughter is in 7th grade and the last few months have been "
            "really hard — she’s missing school more often and "
            "I can tell her anxiety is getting worse. Her counselor at "
            "school is overloaded. Where can I get her real help?"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Seed hypothesis: parent of a school-age child with rising "
            "mental-health concerns. Likely fits for school-based counseling, "
            "Communities In Schools (CIS), and youth mental-health programs. "
            "But verify whether the caller is the parent, a caregiver, the "
            "student themselves, or a teacher — the right next step "
            "differs by role."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "I'm sorry you and your daughter are going through this. "
                    "You're doing the right thing reaching out. Can you tell "
                    "me a little more — has she said anything that worries "
                    "you about her safety, or is it more about anxiety and "
                    "withdrawal so far?"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "Mostly anxiety. She's not talking about hurting herself "
                    "but she cries before school and sometimes can't get "
                    "out of bed. We've never been to a therapist before."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "That's helpful — and what you're describing is exactly "
                    "what school-based mental health programs are designed for. "
                    "Quick question on logistics: which school does she attend, "
                    "and do you have insurance through your job?"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "She's at Lamar Middle School in AISD. We have insurance "
                    "through my work but the deductible is huge."
                ),
                delay_ms=1200,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Good — there are programs that meet kids at school so "
                    "you don't burn through that deductible. Let me put "
                    "together a plan with a school-based counseling option "
                    "first, plus a backup community provider in case you "
                    "want a second opinion. One moment…"
                ),
                delay_ms=1100,
            ),
        ],
    ),

    "equity-east-austin": Persona(
        id="equity-east-austin",
        label="East Austin — displacement squeeze",
        language="en",
        seed_profile=ResidentProfile(
            age_range="60s",
            household_size=2,
            zip_code="78702",
            housing_situation="renting",
            employment_status="part-time",
            income_bracket="$10,000-$20,000",
            insurance_status="medicare",
            has_children=False,
            languages_spoken=["en", "es"],
            primary_language="es",
            has_chronic_conditions=True,
            immediate_needs=["housing", "utilities", "healthcare"],
        ),
        opening_message=(
            "We’ve lived in East Austin for over thirty years. Our "
            "rent went up again this year and the property tax notices "
            "keep getting worse. My husband and I are both on fixed "
            "income. We don’t want to leave the neighborhood. "
            "What’s out there for people like us?"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Seed hypothesis: long-term East Austin household facing "
            "displacement pressure — rent + property tax burden on "
            "fixed income. Likely fits for housing-stability programs, "
            "utility assistance, senior services, and tax-relief programs. "
            "Pay attention to language preference (Spanish) and to whether "
            "they own vs rent — the seed says renting but they "
            "mentioned property tax notices, which may indicate ownership."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "Thirty years in one neighborhood is a real anchor — "
                    "I'll do my best to help you stay. A couple quick "
                    "questions: do you and your husband own the home, or "
                    "are you renting from a landlord? And how old are you "
                    "both, roughly?"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "We rent. Our landlord owns the house but he just sent "
                    "us the property tax notice and asked us to pay part of "
                    "it. We're both 67."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "That's actually important — the landlord can't legally "
                    "pass property tax onto you that way. I'll flag a "
                    "tenant-rights resource alongside the housing-stability "
                    "options. Are you on Medicare, and is your husband "
                    "managing any chronic conditions I should keep in mind?"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "Yes, both on Medicare. He has diabetes and his "
                    "medications are getting expensive on top of everything else."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Understood. I'll put together a plan that covers "
                    "housing stability, utility help, senior services, and "
                    "a low-cost prescription program. One moment…"
                ),
                delay_ms=1100,
            ),
        ],
    ),

    "refugee-food": Persona(
        id="refugee-food",
        label="Refugee family — food + coordination",
        language="en",
        seed_profile=ResidentProfile(
            age_range="30s",
            household_size=5,
            zip_code="78758",
            housing_situation="renting",
            employment_status="part-time",
            income_bracket="$10,000-$20,000",
            insurance_status="uninsured",
            has_children=True,
            languages_spoken=["en"],
            primary_language="ar",
            is_refugee_or_immigrant=True,
            immediate_needs=["food", "healthcare", "education"],
        ),
        opening_message=(
            "We arrived in Austin eight months ago. My kids are in school "
            "but we’re still figuring things out. My case worker "
            "helped at first but I haven’t heard from her in weeks. "
            "We’re running short on food and I don’t know which "
            "doctor to take my youngest to. Can you help?"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Seed hypothesis: refugee/immigrant family, post-resettlement "
            "transition, primary language Arabic, lost touch with their "
            "case worker. Likely fits for food pantries with refugee "
            "experience, community health clinics, school enrollment "
            "support, and re-engagement with a resettlement partner. "
            "Treat this as a coordination problem — surface multiple "
            "partners and call out the gap, don’t just hand off "
            "another phone number."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "Welcome to Austin — and I'm sorry your case worker "
                    "hasn't been in touch. Let me see if I can help. How "
                    "many people are in your family, and what ages are "
                    "your children?"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "There are five of us. My husband and me, and three "
                    "kids — eight, six, and two years old. The two-year-old "
                    "has had a bad cough for a week."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Thank you — a persistent cough at age two needs to be "
                    "looked at this week. Two more questions: do any of you "
                    "have insurance right now, and which language is most "
                    "comfortable for medical appointments?"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "No insurance for any of us. Arabic is best — my "
                    "English is okay for groceries but not for the doctor."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Got it. I'll line up a clinic that takes uninsured "
                    "patients and has Arabic-speaking staff, a food pantry "
                    "that knows refugee families, and I'll flag this to a "
                    "coordinator so you don't have to keep starting over. "
                    "One moment…"
                ),
                delay_ms=1100,
            ),
        ],
    ),

    # ─── Native-language variants ──────────────────────────────────
    # Each demonstrates the same intake flow in the resident's primary
    # language so commissioners can see the agent matches Austin's
    # actual linguistic landscape.

    "heat-outdoor-worker-vi": Persona(
        id="heat-outdoor-worker-vi",
        label="Heat — outdoor worker (Tiếng Việt)",
        language="vi",
        seed_profile=ResidentProfile(
            age_range="40s",
            household_size=4,
            zip_code="78744",
            housing_situation="renting",
            employment_status="full-time",
            income_bracket="$20,000-$30,000",
            insurance_status="uninsured",
            has_children=True,
            languages_spoken=["vi", "en"],
            primary_language="vi",
            is_outdoor_worker=True,
            has_ac=False,
            has_chronic_conditions=True,
            immediate_needs=["utilities", "healthcare"],
        ),
        opening_message=(
            "Chào bạn — tôi làm xây dựng đường ở khu 78744. Máy lạnh "
            "nhà tôi bị hỏng tuần trước và tôi không có đủ tiền sửa "
            "trước khi đợt nóng tới. Tôi cũng bị huyết áp cao. Có "
            "chương trình hỗ trợ nào không?"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Vietnamese-speaking outdoor worker with the same heat-vulnerability "
            "profile as the English variant. Respond in Vietnamese. The "
            "service catalog is English-canonical — translate service "
            "names and instructions on the fly."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "Tôi rất mừng vì bạn đã liên hệ — bệnh nhiệt có thể "
                    "trở nặng nhanh với người trong tình trạng của bạn. "
                    "Để tôi hỏi vài câu để giới thiệu đúng dịch vụ. "
                    "Trước tiên, trong nhà có ai khác cũng dễ bị ảnh "
                    "hưởng không — trẻ em, người lớn tuổi, hoặc ai có "
                    "bệnh nền?"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "Vâng, vợ và hai con tôi sống cùng nhà. Hai cháu "
                    "thì ổn nhưng vợ tôi bị hen suyễn và nắng nóng làm "
                    "bệnh nặng hơn."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Cảm ơn bạn — điều đó rất quan trọng. Với huyết áp "
                    "của bạn và bệnh hen của vợ, cả hai đều thuộc nhóm "
                    "nguy cơ cao do nhiệt. Hai câu hỏi nữa: bạn có bảo "
                    "hiểm y tế hay đang không có bảo hiểm? Và tiền nhà, "
                    "tiền điện có đang trễ hạn không?"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "Tôi không có bảo hiểm. Tiền nhà thì đã trả nhưng "
                    "tiền điện trễ hai tháng vì tôi phải để dành tiền "
                    "sửa máy lạnh."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Hiểu rồi. Tôi sẽ lập một kế hoạch bao gồm cả ba "
                    "phần: nơi tránh nóng ngay bây giờ, hỗ trợ thanh "
                    "toán hóa đơn điện cùng với sửa máy lạnh, và một "
                    "phòng khám nhận bệnh nhân không bảo hiểm. Một "
                    "chút thôi…"
                ),
                delay_ms=1100,
            ),
        ],
    ),

    "schools-anxious-student-es": Persona(
        id="schools-anxious-student-es",
        label="Schools — anxious 7th grader (Español)",
        language="es",
        seed_profile=ResidentProfile(
            age_range="40s",
            household_size=3,
            zip_code="78753",
            housing_situation="renting",
            employment_status="full-time",
            income_bracket="$30,000-$40,000",
            insurance_status="employer",
            has_children=True,
            languages_spoken=["es", "en"],
            primary_language="es",
            school_age_children=[
                SchoolAgeChild(
                    grade="7",
                    district="AISD",
                    concerns=["anxiety", "attendance"],
                ),
            ],
            immediate_needs=["mental health"],
        ),
        opening_message=(
            "Mi hija está en séptimo grado y los últimos meses han "
            "sido muy difíciles — falta a la escuela cada vez más a "
            "menudo y noto que su ansiedad está empeorando. La "
            "consejera de la escuela está sobrecargada. ¿Dónde puedo "
            "conseguirle ayuda real?"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Spanish-speaking parent with same school-mental-health "
            "concern as the English variant. Respond in Spanish."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "Lamento mucho lo que están viviendo tú y tu hija. "
                    "Estás haciendo lo correcto al pedir ayuda. ¿Puedes "
                    "contarme un poco más — ha dicho algo que te "
                    "preocupe sobre su seguridad, o por ahora se trata "
                    "más de ansiedad y aislamiento?"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "Es más ansiedad. No habla de hacerse daño, pero "
                    "llora antes de la escuela y a veces no puede "
                    "levantarse de la cama. Nunca hemos ido a un "
                    "terapeuta."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Eso ayuda — y lo que describes es exactamente lo "
                    "que los programas de salud mental escolares están "
                    "diseñados para atender. Una pregunta sobre la "
                    "logística: ¿a qué escuela asiste, y tienes seguro "
                    "médico a través de tu trabajo?"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "Está en Lamar Middle School en AISD. Tenemos "
                    "seguro por mi trabajo pero el deducible es enorme."
                ),
                delay_ms=1200,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "Bien — hay programas que atienden a los niños en "
                    "la escuela para que no tengan que pagar el "
                    "deducible. Voy a armar un plan con una opción de "
                    "consejería escolar primero, y un proveedor "
                    "comunitario de respaldo por si quieres una segunda "
                    "opinión. Un momento…"
                ),
                delay_ms=1100,
            ),
        ],
    ),

    "equity-east-austin-zh": Persona(
        id="equity-east-austin-zh",
        label="East Austin — displacement (中文)",
        language="zh",
        seed_profile=ResidentProfile(
            age_range="60s",
            household_size=2,
            zip_code="78702",
            housing_situation="renting",
            employment_status="part-time",
            income_bracket="$10,000-$20,000",
            insurance_status="medicare",
            has_children=False,
            languages_spoken=["zh", "en"],
            primary_language="zh",
            has_chronic_conditions=True,
            immediate_needs=["housing", "utilities", "healthcare"],
        ),
        opening_message=(
            "我们在东奥斯汀住了三十多年。今年房租又涨了，"
            "房产税单也越来越严重。我和我先生都靠固定收入"
            "生活。我们不想离开这个社区。有什么可以帮助"
            "我们这样的人的资源吗？"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Mandarin-speaking long-term East Austin household facing "
            "the same displacement squeeze as the English variant. "
            "Respond in simplified Chinese."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "在一个社区住了三十年是真正的根基 — 我会尽力"
                    "帮你们留下来。先问几个问题：你们和先生是这间"
                    "房子的房主，还是从房东那里租的？你们大概多大"
                    "年龄？"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "我们租的。房子是房东的，但他刚把房产税单寄给"
                    "我们，要求我们支付一部分。我们俩都是67岁。"
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "这个其实很重要 — 房东不能合法地这样把房产税"
                    "转嫁给你们。我会在住房稳定方案旁边标注一个"
                    "租户权益资源。你们用Medicare吗？先生有没有"
                    "什么需要长期管理的健康问题？"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "对，我们都用Medicare。他有糖尿病，加上其他"
                    "费用，他的药费越来越贵。"
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "明白了。我会准备一个计划，包含住房稳定、水电费"
                    "帮助、长者服务和一个低费用处方药项目。请稍等…"
                ),
                delay_ms=1100,
            ),
        ],
    ),

    "refugee-food-ar": Persona(
        id="refugee-food-ar",
        label="Refugee family — food + coordination (العربية)",
        language="ar",
        seed_profile=ResidentProfile(
            age_range="30s",
            household_size=5,
            zip_code="78758",
            housing_situation="renting",
            employment_status="part-time",
            income_bracket="$10,000-$20,000",
            insurance_status="uninsured",
            has_children=True,
            languages_spoken=["ar"],
            primary_language="ar",
            is_refugee_or_immigrant=True,
            immediate_needs=["food", "healthcare", "education"],
        ),
        opening_message=(
            "وصلنا إلى أوستن قبل ثمانية أشهر. أطفالي في المدرسة "
            "لكننا ما زلنا نحاول ترتيب أمورنا. أخصائية الحالة "
            "ساعدتنا في البداية لكنني لم أسمع منها منذ أسابيع. "
            "الطعام عندنا قليل ولا أعرف أي طبيب آخذ صغيري إليه. "
            "هل تستطيع المساعدة؟"
        ),
        persona_note=(
            f"{_HYBRID_NOTE_PREFIX}\n\n"
            "Arabic-speaking refugee family — same coordination gap as "
            "the English variant. Respond in Arabic."
        ),
        script=[
            ScriptedTurn(
                role="assistant",
                content=(
                    "أهلاً بكم في أوستن — وأنا آسف أن أخصائية الحالة "
                    "لم تتواصل معكم. دعيني أرى كيف يمكنني المساعدة. "
                    "كم عدد أفراد عائلتك، وكم أعمار أطفالك؟"
                ),
                delay_ms=900,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "نحن خمسة. أنا وزوجي وثلاثة أطفال — في الثامنة "
                    "والسادسة والثانية من العمر. الصغير عمره سنتان "
                    "وعنده سعال شديد منذ أسبوع."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "شكراً — السعال المستمر عند طفل في الثانية يحتاج "
                    "إلى فحص هذا الأسبوع. سؤالان آخران: هل لديكم أي "
                    "تأمين صحي حالياً، وما اللغة الأنسب لكم في "
                    "المواعيد الطبية؟"
                ),
                delay_ms=1100,
            ),
            ScriptedTurn(
                role="user",
                content=(
                    "لا تأمين لأي منا. العربية هي الأنسب — إنجليزيتي "
                    "تكفي للتسوق لكن ليس عند الطبيب."
                ),
                delay_ms=1300,
            ),
            ScriptedTurn(
                role="assistant",
                content=(
                    "حسناً. سأرتب لكم عيادة تستقبل المرضى بدون تأمين "
                    "ولديها موظفون يتكلمون العربية، ومخزن طعام يعرف "
                    "العائلات اللاجئة، وسأبلغ منسقاً حتى لا تضطروا "
                    "للبدء من جديد. لحظة من فضلك…"
                ),
                delay_ms=1100,
            ),
        ],
    ),
}


def get_persona(persona_id: str) -> Persona | None:
    return _PERSONAS.get(persona_id)


def list_personas() -> list[dict]:
    """Lightweight metadata for the demo launcher UI."""
    return [
        {"id": p.id, "label": p.label, "language": p.language}
        for p in _PERSONAS.values()
    ]
