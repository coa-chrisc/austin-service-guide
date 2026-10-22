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
        "emergency": "Giải quyết an toàn tức thì trước — các nguồn lực này hỗ trợ 24/7.",
        "cooling": "Bệnh do nhiệt diễn tiến nhanh — nơi tránh nóng và sửa máy lạnh phải được ưu tiên trong đợt nóng.",
        "food": "Hỗ trợ thực phẩm thường giúp bạn tự động đủ điều kiện cho các chương trình khác.",
        "housing": "Ổn định nơi ở trước khi giải quyết các mục tiêu dài hạn.",
        "refugee": "Phối hợp tái định cư có thể mở khóa thực phẩm, y tế và hỗ trợ trường học chỉ trong một lần đăng ký.",
        "utilities": "Giữ điện nước hoạt động giúp tránh bị đuổi và bảo vệ tiền đặt cọc.",
        "healthcare": "Có bảo hiểm trước khi hóa đơn tự chi trả chồng chất.",
        "childcare": "Chăm sóc trẻ giúp bạn rảnh tay đi tìm việc, học, và khám bệnh.",
        "schools": "Hỗ trợ sức khỏe tinh thần tại trường là cách nhanh nhất giúp một học sinh đang gặp khó khăn.",
        "employment": "Tìm việc nhanh hơn khi nhu cầu cơ bản đã ổn định.",
        "veterans": "Phúc lợi cựu quân nhân có thể kết hợp với hầu hết các chương trình tiểu bang và địa phương.",
        "senior": "Các chương trình theo độ tuổi thường nhanh đủ điều kiện nhất.",
        "disability": "Giấy tờ khuyết tật mở khóa nhiều phúc lợi khác.",
        "transportation": "Giao thông đáng tin cậy giúp việc khám bệnh và đi làm khả thi.",
        "legal": "Trợ giúp pháp lý có thể chặn các hành động bất lợi đang diễn ra.",
        "immigration": "Việc giải quyết tình trạng nhập cư đi song song với mọi thứ khác.",
        "education": "Lên kế hoạch sau khi các nhu cầu cấp bách đã được xử lý.",
        "_default": "Đăng ký khi bạn có thời gian — dịch vụ này hỗ trợ chứ không khẩn cấp.",
    },
    "es": {
        "emergency": "Atiende primero la seguridad inmediata — estos recursos están disponibles 24/7.",
        "cooling": "El golpe de calor se agrava rápido — el enfriamiento y la ayuda con el aire acondicionado van antes de todo lo demás durante una alerta de calor.",
        "food": "La asistencia alimentaria a menudo te califica automáticamente para otros programas.",
        "housing": "Estabiliza dónde duermes antes de abordar metas a largo plazo.",
        "refugee": "La coordinación de reasentamiento puede desbloquear comida, salud y apoyo escolar en una sola gestión.",
        "utilities": "Mantener la luz encendida previene el desalojo y protege tus depósitos.",
        "healthcare": "Consigue cobertura antes de que se acumulen las facturas de tu bolsillo.",
        "childcare": "El cuidado infantil libera tiempo para la búsqueda de empleo, la escuela y citas médicas.",
        "schools": "El apoyo de salud mental en la escuela es la vía más rápida para un estudiante que está luchando.",
        "employment": "La colocación laboral es más rápida cuando las necesidades básicas están estables.",
        "veterans": "Los beneficios de VA se combinan con la mayoría de los programas estatales y locales.",
        "senior": "Los programas para adultos mayores suelen ser los más rápidos para calificar.",
        "disability": "La documentación de discapacidad desbloquea varios otros beneficios.",
        "transportation": "Un transporte confiable hace posibles las citas y el trabajo.",
        "legal": "La asesoría legal puede detener acciones adversas ya en marcha.",
        "immigration": "El trabajo de estatus migratorio va junto con todo lo demás.",
        "education": "Planifica después de atender las necesidades inmediatas.",
        "_default": "Solicítalo cuando tengas tiempo — este es de apoyo, no urgente.",
    },
    "zh": {
        "emergency": "先处理眼前的安全问题 — 这些资源24小时全天候提供。",
        "cooling": "中暑会迅速恶化 — 在高温预警期间，避暑和空调帮助优先于其他一切。",
        "food": "食物援助通常会让你自动符合其他项目的条件。",
        "housing": "在处理长期目标之前先稳定住所。",
        "refugee": "安置协调可以通过一次受理打开食物、医疗和学校支持的通道。",
        "utilities": "保持电力供应可以防止被驱逐并保护你的押金。",
        "healthcare": "在自付账单累积之前获得医疗保险。",
        "childcare": "儿童看护可以让你腾出时间求职、上学和就医。",
        "schools": "校内心理健康支持是帮助一个挣扎中的学生最快的方式。",
        "employment": "基本需求稳定后，就业安置更快。",
        "veterans": "退伍军人福利可与大多数州和地方项目叠加。",
        "senior": "基于年龄的项目通常最快符合条件。",
        "disability": "残疾文件可以解锁多项其他福利。",
        "transportation": "可靠的交通让看病和工作变得可行。",
        "legal": "法律援助可以阻止已经在进行的不利行动。",
        "immigration": "移民身份的工作与其他一切并行。",
        "education": "在处理完紧急需求后再规划。",
        "_default": "有时间再申请 — 这一项是辅助性的，不紧急。",
    },
    "ar": {
        "emergency": "عالج السلامة الفورية أولاً — هذه الموارد متاحة على مدار الساعة طوال أيام الأسبوع.",
        "cooling": "أمراض الحرارة تتصاعد بسرعة — التبريد والمساعدة في تكييف الهواء يأتيان قبل كل شيء أثناء موجة الحر.",
        "food": "المساعدة الغذائية كثيراً ما تؤهلك تلقائياً لبرامج أخرى.",
        "housing": "ثبّت المكان الذي تنام فيه قبل التعامل مع الأهداف طويلة المدى.",
        "refugee": "تنسيق إعادة التوطين يمكن أن يفتح الباب للطعام والرعاية الصحية ودعم المدارس في معاملة واحدة.",
        "utilities": "إبقاء الكهرباء مشتغلة يمنع الإخلاء ويحمي تأميناتك.",
        "healthcare": "احصل على التغطية قبل أن تتراكم فواتير الجيب.",
        "childcare": "رعاية الأطفال تفتح الباب للبحث عن عمل والدراسة والمواعيد الطبية.",
        "schools": "الدعم النفسي داخل المدرسة هو الطريق الأسرع للوصول إلى طالب يعاني.",
        "employment": "التوظيف يصبح أسرع بمجرد أن تستقر الاحتياجات الأساسية.",
        "veterans": "تتراكب مزايا قدامى المحاربين مع معظم البرامج الولائية والمحلية.",
        "senior": "البرامج المرتبطة بالسن عادةً ما تكون الأسرع في التأهيل.",
        "disability": "وثائق الإعاقة تفتح الباب لعدة مزايا أخرى.",
        "transportation": "النقل الموثوق يجعل المواعيد والعمل ممكنين.",
        "legal": "المساعدة القانونية يمكن أن توقف إجراءات سلبية قيد التنفيذ بالفعل.",
        "immigration": "العمل على الوضع القانوني للهجرة يسير جنباً إلى جنب مع كل شيء آخر.",
        "education": "خطّط بعد التعامل مع الاحتياجات الفورية.",
        "_default": "تقدّم بطلب عندما يتاح لك الوقت — هذا داعم وليس عاجلاً.",
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

RISK_FLAGS_I18N: dict[str, dict[str, dict[str, str]]] = {
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
    """Localized risk flag {label, description}, or None if not translated."""
    table = RISK_FLAGS_I18N.get(language)
    if table is None:
        return None
    return table.get(risk_type)
