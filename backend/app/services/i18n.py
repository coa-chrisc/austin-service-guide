"""Translation tables for the demo persona language variants.

The service catalog is English-canonical; in production we delegate
translation to the LLM at runtime. For deterministic offline demo
behavior we hand-translate the slices that surface on the /results
page for the four demo languages: Vietnamese (vi), Spanish (es),
Mandarin (zh), and Arabic (ar). Anything not in these tables falls
through to English. Translated service descriptions are place data and
live in the data pack's ``service_translations.yaml``.
"""

from __future__ import annotations

from app.services import catalog
from app.services.catalog_loader import load_service_translations

# ── Application-order sequence reasons ─────────────────────────────────
# Keys mirror _SEQUENCE_REASONS in matching.py.

SEQUENCE_REASONS_I18N: dict[str, dict[str, str]] = {
    "vi": {
        "emergency": "Được xếp đầu tiên vì liên quan đến sự an toàn.",
        "cooling": "Được xếp sớm vì bệnh do nhiệt có thể đến nhanh trong đợt cảnh báo nắng nóng.",
        "food": "Hỗ trợ thực phẩm thường là một bước đầu tiên nhanh chóng.",
        "housing": "Được xếp sớm vì một nơi ở ổn định giúp mọi việc khác dễ dàng hơn.",
        "refugee": "Các tổ chức tái định cư có thể giúp nhiều nhu cầu cùng lúc.",
        "utilities": "Nên hỏi sớm về hỗ trợ hóa đơn điện nước.",
        "healthcare": "Một nơi để được chăm sóc sức khỏe. Hãy hỏi về chi phí và điều kiện khi bạn gọi.",
        "childcare": "Hỗ trợ chăm sóc trẻ có thể giúp việc đi làm, đi học và đi khám dễ sắp xếp hơn.",
        "schools": "Hỗ trợ tại trường có thể đến với học sinh ngay tại nơi các em đang học.",
        "employment": "Dịch vụ việc làm có thể dễ bắt đầu hơn khi các nhu cầu cấp bách đã được lo.",
        "veterans": "Dịch vụ cho cựu quân nhân có thể dùng song song với các chương trình khác.",
        "senior": "Các chương trình cho người cao tuổi đáng để tìm hiểu.",
        "disability": "Dịch vụ khuyết tật có thể giúp bạn kết nối với các hỗ trợ khác.",
        "transportation": "Hỗ trợ đi lại có thể giúp việc đến chỗ hẹn và đi làm dễ hơn.",
        "legal": "Nên hỏi trợ giúp pháp lý, nhất là khi bạn có thông báo hoặc hạn chót.",
        "immigration": "Trợ giúp nhập cư có thể đi song song với các bước khác của bạn.",
        "education": "Có thể lên kế hoạch sau khi các nhu cầu cấp bách đã được xử lý.",
        "_default": "Đáng xem khi bạn có thời gian.",
    },
    "es": {
        "emergency": "Aparece primero porque tiene que ver con la seguridad.",
        "cooling": "Aparece pronto porque las enfermedades por calor pueden llegar rápido durante una alerta de calor.",
        "food": "La ayuda con alimentos suele ser un primer paso rápido.",
        "housing": "Aparece pronto porque un lugar estable para vivir facilita todo lo demás.",
        "refugee": "Las organizaciones de reasentamiento pueden ayudar con varias necesidades a la vez.",
        "utilities": "Vale la pena preguntar pronto por ayuda con las facturas de servicios.",
        "healthcare": "Un lugar para recibir atención. Pregunta por el costo y los requisitos cuando llames.",
        "childcare": "La ayuda con el cuidado infantil puede facilitar el trabajo, la escuela y las citas.",
        "schools": "El apoyo en la escuela puede llegar al estudiante donde ya está.",
        "employment": "Los servicios de empleo pueden ser más fáciles de aprovechar cuando las necesidades urgentes estén cubiertas.",
        "veterans": "Los servicios para veteranos pueden usarse junto con otros programas.",
        "senior": "Programas para adultos mayores que vale la pena revisar.",
        "disability": "Los servicios de discapacidad pueden ayudarte a conectar con otros apoyos.",
        "transportation": "La ayuda con el transporte puede facilitar llegar a las citas y al trabajo.",
        "legal": "Vale la pena pedir ayuda legal, sobre todo si tienes un aviso o una fecha límite.",
        "immigration": "La ayuda migratoria puede ir junto con tus otros pasos.",
        "education": "Algo para planear cuando las necesidades urgentes estén atendidas.",
        "_default": "Vale la pena revisarlo cuando tengas tiempo.",
    },
    "zh": {
        "emergency": "排在最前，因为它与安全有关。",
        "cooling": "排在前面，因为在高温预警期间，高温引起的疾病可能来得很快。",
        "food": "食物援助通常是可以很快开始的第一步。",
        "housing": "排在前面，因为稳定的住所让其他事情更容易处理。",
        "refugee": "安置机构可能可以同时帮助解决多项需求。",
        "utilities": "值得尽早询问水电费帮助。",
        "healthcare": "可以获得医疗服务的地方。打电话时请询问费用和申请条件。",
        "childcare": "儿童看护帮助可以让工作、上学和就医更容易安排。",
        "schools": "校内支持可以在学生所在的学校直接提供帮助。",
        "employment": "在紧急需求得到解决后，就业服务可能更容易开始。",
        "veterans": "退伍军人服务可以与其他项目一起使用。",
        "senior": "值得了解的长者项目。",
        "disability": "残障服务可能帮助你联系其他支持。",
        "transportation": "交通帮助可以让去看病和上班更方便。",
        "legal": "值得寻求法律帮助，特别是当你收到通知或有截止日期时。",
        "immigration": "移民方面的帮助可以与其他步骤同时进行。",
        "education": "可以在紧急需求处理好之后再规划。",
        "_default": "有时间时值得看看。",
    },
    "ar": {
        "emergency": "يأتي أولاً لأنه يتعلق بالسلامة.",
        "cooling": "يأتي مبكراً لأن أمراض الحرارة قد تظهر بسرعة أثناء تحذيرات الحر.",
        "food": "المساعدة الغذائية غالباً ما تكون خطوة أولى سريعة.",
        "housing": "يأتي مبكراً لأن السكن المستقر يسهّل كل شيء آخر.",
        "refugee": "قد تستطيع جهات إعادة التوطين المساعدة في عدة احتياجات في وقت واحد.",
        "utilities": "من المفيد السؤال مبكراً عن المساعدة في فواتير الخدمات.",
        "healthcare": "مكان للحصول على الرعاية. اسأل عن التكلفة وشروط الأهلية عند الاتصال.",
        "childcare": "المساعدة في رعاية الأطفال قد تسهّل العمل والدراسة والمواعيد.",
        "schools": "الدعم داخل المدرسة يمكن أن يصل إلى الطالب حيث هو.",
        "employment": "قد يكون البدء بخدمات التوظيف أسهل بعد تغطية الاحتياجات العاجلة.",
        "veterans": "يمكن استخدام خدمات قدامى المحاربين إلى جانب برامج أخرى.",
        "senior": "برامج لكبار السن تستحق الاطلاع عليها.",
        "disability": "قد تساعدك خدمات الإعاقة على الوصول إلى دعم آخر.",
        "transportation": "المساعدة في التنقل قد تسهّل الوصول إلى المواعيد والعمل.",
        "legal": "من المفيد طلب المساعدة القانونية، خاصة إذا كان لديك إشعار أو موعد نهائي.",
        "immigration": "يمكن أن تسير المساعدة في الهجرة إلى جانب خطواتك الأخرى.",
        "education": "شيء يمكن التخطيط له بعد التعامل مع الاحتياجات العاجلة.",
        "_default": "يستحق الاطلاع عليه عندما يتاح لك الوقت.",
    },
}


# ── Match-reasoning building blocks ────────────────────────────────────

MATCH_REASON_I18N: dict[str, dict[str, str]] = {
    "vi": {
        "matches_needs": "Phù hợp nhu cầu: {cats}",
        "available_in_language": "Có sẵn bằng ngôn ngữ của bạn",
        "free_or_low_cost": "Miễn phí hoặc chi phí thấp",
        "potential_match": "Có thể phù hợp dựa trên hồ sơ",
    },
    "es": {
        "matches_needs": "Coincide con tus necesidades: {cats}",
        "available_in_language": "Disponible en tu idioma",
        "free_or_low_cost": "Gratis o de bajo costo",
        "potential_match": "Posible coincidencia según tu perfil",
    },
    "zh": {
        "matches_needs": "匹配您的需求：{cats}",
        "available_in_language": "提供您的语言服务",
        "free_or_low_cost": "免费或低费用",
        "potential_match": "根据您的情况可能匹配",
    },
    "ar": {
        "matches_needs": "يتطابق مع احتياجاتك: {cats}",
        "available_in_language": "متاح بلغتك",
        "free_or_low_cost": "مجاني أو منخفض التكلفة",
        "potential_match": "تطابق محتمل بناءً على ملفك الشخصي",
    },
}


# ── Category labels (used inside match_reasoning) ──────────────────────

CATEGORY_LABELS_I18N: dict[str, dict[str, str]] = {
    "vi": {
        "food": "thực phẩm", "housing": "nhà ở", "healthcare": "y tế",
        "utilities": "điện nước", "cooling": "tránh nóng",
        "mental health": "sức khỏe tinh thần", "schools": "trường học",
        "childcare": "chăm sóc trẻ em", "employment": "việc làm",
        "education": "giáo dục", "senior": "người cao tuổi",
        "disability": "khuyết tật", "veterans": "cựu chiến binh",
        "legal": "pháp lý", "transportation": "giao thông",
        "refugee": "người tị nạn", "immigration": "nhập cư",
    },
    "es": {
        "food": "comida", "housing": "vivienda", "healthcare": "salud",
        "utilities": "servicios públicos", "cooling": "enfriamiento",
        "mental health": "salud mental", "schools": "escuelas",
        "childcare": "cuidado infantil", "employment": "empleo",
        "education": "educación", "senior": "adultos mayores",
        "disability": "discapacidad", "veterans": "veteranos",
        "legal": "legal", "transportation": "transporte",
        "refugee": "refugiados", "immigration": "inmigración",
    },
    "zh": {
        "food": "食物", "housing": "住房", "healthcare": "医疗",
        "utilities": "水电费", "cooling": "避暑",
        "mental health": "心理健康", "schools": "学校",
        "childcare": "儿童看护", "employment": "就业",
        "education": "教育", "senior": "老年",
        "disability": "残疾", "veterans": "退伍军人",
        "legal": "法律", "transportation": "交通",
        "refugee": "难民", "immigration": "移民",
    },
    "ar": {
        "food": "طعام", "housing": "سكن", "healthcare": "رعاية صحية",
        "utilities": "خدمات عامة", "cooling": "تبريد",
        "mental health": "صحة نفسية", "schools": "مدارس",
        "childcare": "رعاية أطفال", "employment": "توظيف",
        "education": "تعليم", "senior": "كبار السن",
        "disability": "إعاقة", "veterans": "قدامى المحاربين",
        "legal": "قانوني", "transportation": "نقل",
        "refugee": "لاجئون", "immigration": "هجرة",
    },
}


# ── Risk-flag descriptions ────────────────────────────────────────────

# "en" holds labels only (the English description comes from the matching
# engine) and covers every risk_type matching.assess_risks emits, so a flag
# never renders as its raw enum. Other languages fall back to the English
# label for risk types they do not translate.
RISK_FLAGS_I18N: dict[str, dict[str, dict[str, str]]] = {
    "en": {
        "homelessness": {"label": "Homelessness"},
        "housing_instability": {"label": "Unstable housing"},
        "food_insecurity": {"label": "Food insecurity"},
        "uninsured": {"label": "No health insurance"},
        "domestic_violence": {"label": "Safety at home"},
        "mental_health_crisis": {"label": "Mental health crisis"},
        "social_isolation": {"label": "Social isolation"},
        "child_mental_health_risk": {"label": "Child mental health"},
        "heat_vulnerable": {"label": "Heat vulnerability"},
    },
    "vi": {
        "heat_vulnerable": {
            "label": "Dễ bị tổn thương do nắng nóng",
            "description": "Nguy cơ cao mắc bệnh do nhiệt trong các đợt cảnh báo nóng mùa hè",
        },
        "uninsured": {
            "label": "Không có bảo hiểm",
            "description": "Cần kết nối với chăm sóc y tế giá phải chăng",
        },
        "child_mental_health_risk": {
            "label": "Nguy cơ sức khỏe tinh thần của trẻ",
            "description": "Học sinh K-12 có dấu hiệu lo âu, trầm cảm hoặc các mối lo về hành vi",
        },
        "food_insecurity": {
            "label": "Mất an ninh lương thực",
            "description": "Nguồn cung thực phẩm hạn chế hoặc không ổn định",
        },
    },
    "es": {
        "heat_vulnerable": {
            "label": "Vulnerable al calor",
            "description": "Riesgo elevado de enfermedad por calor durante alertas de verano",
        },
        "uninsured": {
            "label": "Sin seguro médico",
            "description": "Necesita conectarse con atención de salud de bajo costo",
        },
        "child_mental_health_risk": {
            "label": "Riesgo de salud mental infantil",
            "description": "Estudiante K-12 con señales de ansiedad, depresión o problemas de conducta",
        },
        "food_insecurity": {
            "label": "Inseguridad alimentaria",
            "description": "Acceso limitado o inestable a alimentos",
        },
    },
    "zh": {
        "heat_vulnerable": {
            "label": "高温易感人群",
            "description": "在夏季高温预警期间患中暑相关疾病的风险升高",
        },
        "uninsured": {
            "label": "无医疗保险",
            "description": "需要对接价格可负担的医疗服务",
        },
        "child_mental_health_risk": {
            "label": "儿童心理健康风险",
            "description": "K-12学生出现焦虑、抑郁或行为方面的迹象",
        },
        "food_insecurity": {
            "label": "粮食不安全",
            "description": "食物来源有限或不稳定",
        },
    },
    "ar": {
        "heat_vulnerable": {
            "label": "معرّض لخطر الحرارة",
            "description": "خطر مرتفع للإصابة بأمراض الحرارة خلال تحذيرات الصيف",
        },
        "uninsured": {
            "label": "بدون تأمين صحي",
            "description": "بحاجة للوصول إلى رعاية صحية ميسورة التكلفة",
        },
        "child_mental_health_risk": {
            "label": "خطر على الصحة النفسية للطفل",
            "description": "طالب من K-12 تظهر عليه علامات قلق أو اكتئاب أو مخاوف سلوكية",
        },
        "food_insecurity": {
            "label": "انعدام الأمن الغذائي",
            "description": "وصول محدود أو غير مستقر إلى الطعام",
        },
    },
}


# ── Plan-synthesis blurb (the green "You may qualify..." card sub-text) ─

PLAN_SUMMARY_I18N: dict[str, str] = {
    "vi": "Đây là kế hoạch của bạn. Bắt đầu từ trên cùng — chúng tôi đã sắp xếp các dịch vụ theo thứ tự cần liên hệ trước.",
    "es": "Aquí está tu plan. Empieza desde arriba — ordenamos los servicios según con cuál conviene contactar primero.",
    "zh": "这是您的计划。从顶部开始 — 我们按照应该先联系哪个的顺序进行了排列。",
    "ar": "هذه خطتك. ابدأ من الأعلى — رتّبنا الخدمات حسب أيها يجب التواصل معه أولاً.",
}


# ── PII redaction notice (prepended to the reply when pii.redact fired) ─

REDACTION_NOTICE_I18N: dict[str, str] = {
    "en": "For your privacy, I removed some personal details (like an ID number, phone, or address) from your message — I don't need them to find services.",
    "vi": "Để bảo vệ quyền riêng tư của bạn, tôi đã xóa một số thông tin cá nhân (như số giấy tờ, số điện thoại hoặc địa chỉ) khỏi tin nhắn — tôi không cần chúng để tìm dịch vụ.",
    "es": "Por tu privacidad, quité algunos datos personales (como un número de identificación, teléfono o dirección) de tu mensaje — no los necesito para encontrar servicios.",
    "zh": "为保护您的隐私，我已从您的消息中删除了一些个人信息（如证件号码、电话或地址）— 查找服务不需要这些信息。",
    "ar": "حفاظًا على خصوصيتك، أزلتُ بعض المعلومات الشخصية (مثل رقم هوية أو هاتف أو عنوان) من رسالتك — لا أحتاجها للعثور على الخدمات.",
}


def redaction_notice(language: str) -> str:
    """One-sentence privacy notice in the resident's language (English fallback)."""
    lang = (language or "en").split("-")[0].lower()
    return REDACTION_NOTICE_I18N.get(lang, REDACTION_NOTICE_I18N["en"])


# ── AI-processing notice (part of the opening greeting) ─────────────────
# Honest disclosure: typed text goes to OpenAI via the backend and voice
# audio goes to OpenAI directly, so the greeting must not promise
# confidentiality. Every translation keeps the Latin-script "OpenAI".

AI_NOTICE_I18N: dict[str, str] = {
    "en": "This guide uses AI (OpenAI) to help match you with services. Please don't share names, Social Security numbers, or account numbers — we don't need them.",
    "vi": "Hướng dẫn này dùng trí tuệ nhân tạo (OpenAI) để giúp bạn tìm dịch vụ phù hợp. Vui lòng không chia sẻ tên, số An sinh Xã hội hoặc số tài khoản — chúng tôi không cần những thông tin này.",
    "es": "Esta guía usa inteligencia artificial (OpenAI) para ayudarte a encontrar servicios. Por favor, no compartas nombres, números de Seguro Social ni números de cuenta — no los necesitamos.",
    "zh": "本指南使用人工智能（OpenAI）帮助您匹配服务。请不要提供姓名、社会安全号码或账户号码 — 我们不需要这些信息。",
    "ar": "يستخدم هذا الدليل الذكاء الاصطناعي (OpenAI) لمساعدتك في العثور على الخدمات. يُرجى عدم مشاركة الأسماء أو أرقام الضمان الاجتماعي أو أرقام الحسابات — لا نحتاج إليها.",
}


def ai_notice(language: str) -> str | None:
    """AI-processing notice in the resident's language, or None if untranslated."""
    lang = (language or "en").split("-")[0].lower()
    return AI_NOTICE_I18N.get(lang)


def translate_sequence_reason(category: str, language: str) -> str | None:
    """Return the localized sequence reason for a category, or None if no translation."""
    table = SEQUENCE_REASONS_I18N.get(language)
    if table is None:
        return None
    return table.get(category) or table.get("_default")


def translate_categories(categories, language: str) -> list[str]:
    """Translate a list of category slugs; falls back to the original slug."""
    table = CATEGORY_LABELS_I18N.get(language) or {}
    return [table.get(c, c) for c in categories]


def translate_match_reasoning(reasoning: str, language: str, profile_languages: list[str] | None = None) -> str:
    """Reconstruct a translated match-reasoning string from English markers.

    The matching engine emits semicolon-joined English fragments; we parse
    those markers and emit the equivalent in the target language. Anything
    we don't recognize falls through unchanged.
    """
    if language == "en" or language not in MATCH_REASON_I18N:
        return reasoning
    t = MATCH_REASON_I18N[language]
    out: list[str] = []
    for raw in [s.strip() for s in reasoning.split(";")]:
        if raw.startswith("Matches needs:"):
            cats = [c.strip() for c in raw[len("Matches needs:"):].split(",") if c.strip()]
            out.append(t["matches_needs"].format(cats=", ".join(translate_categories(cats, language))))
        elif raw == "Available in your language":
            out.append(t["available_in_language"])
        elif raw == "Free or low-cost":
            out.append(t["free_or_low_cost"])
        elif raw == "Potential match based on profile":
            out.append(t["potential_match"])
        elif raw:
            out.append(raw)
    return "; ".join(out)


def translate_service_description(service_id: str, language: str) -> str | None:
    """Localized service description from the pack's
    ``service_translations.yaml``, or None if not translated."""
    svc = catalog.get_service_by_id(service_id)
    if svc is None:
        return None
    entry = load_service_translations().get(svc.slug, {}).get(language)
    return entry.description if entry else None


def translate_risk_flag(risk_type: str, language: str) -> dict[str, str] | None:
    """Localized risk flag {label, description}, or None if not translated.

    The "en" entries carry a label only.
    """
    table = RISK_FLAGS_I18N.get(language)
    if table is None:
        return None
    return table.get(risk_type)


def risk_flag_label(risk_type: str, language: str) -> str:
    """Display label for a risk flag: the language's, else English, else the
    enum made readable."""
    for lang in (language, "en"):
        label = (translate_risk_flag(risk_type, lang) or {}).get("label")
        if label:
            return label
    return risk_type.replace("_", " ").capitalize()
