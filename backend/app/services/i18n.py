"""Translation tables for the demo persona language variants.

The service catalog is English-canonical; in production we delegate
translation to the LLM at runtime. For deterministic offline demo
behavior we hand-translate the slices that surface on the /results
page for the four demo languages: Vietnamese (vi), Spanish (es),
Mandarin (zh), and Arabic (ar). Anything not in these tables falls
through to English.
"""

from __future__ import annotations

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


# ── Service descriptions for the services that surface in personas ────

SERVICE_DESCRIPTIONS_I18N: dict[str, dict[str, str]] = {
    "vi": {
        "svc-heat-relief": "Hỗ trợ tài chính một lần để sửa máy lạnh, thay máy lạnh, hoặc mua máy lạnh cửa sổ cho cư dân đủ điều kiện theo thu nhập — ưu tiên người cao tuổi, người làm ngoài trời và hộ có bệnh mãn tính.",
        "svc-wic": "Chương trình WIC (Phụ nữ, Trẻ sơ sinh và Trẻ em) cung cấp thực phẩm bổ dưỡng, giáo dục dinh dưỡng, hỗ trợ cho con bú và giới thiệu đến dịch vụ y tế và cộng đồng.",
        "svc-commcare": "Trung tâm Y tế được Liên bang Công nhận cung cấp chăm sóc ban đầu, nha khoa, sức khỏe hành vi và dược phẩm theo mức phí trượt — không phân biệt tình trạng bảo hiểm.",
        "svc-cooling-center-network": "Mạng lưới các thư viện và cơ sở thành phố mở rộng giờ làm trong các đợt cảnh báo nhiệt — không gian mát có máy lạnh, miễn phí cho mọi cư dân.",
        "svc-headstart": "Chương trình giáo dục mầm non miễn phí cho trẻ 3-5 tuổi từ gia đình thu nhập thấp. Bao gồm khám sàng lọc sức khỏe, bữa ăn dinh dưỡng và hỗ trợ chuẩn bị đi học.",
        "svc-aisd-prek": "Mẫu giáo cả ngày miễn phí cho trẻ 3-4 tuổi đủ điều kiện tại các trường tiểu học AISD, cùng với giáo dục đặc biệt mầm non và lớp song ngữ.",
        "svc-vida-clinic-schools": "Bác sĩ lâm sàng làm việc tại trường, cung cấp trị liệu, chăm sóc tâm thần và ứng phó khủng hoảng trong các trường tiểu học, trung học cơ sở và trung học AISD. Có cả khám trực tiếp và từ xa.",
        "svc-cis-central-tx": "Quản lý ca tại trường cho học sinh K-12 có nguy cơ bỏ học — chuyên viên tư vấn, nhân viên xã hội và huấn luyện viên học thuật được bố trí tại các trường AISD, Del Valle, Manor và Pflugerville ISD.",
        "svc-integral": "Cơ quan Sức khỏe Tinh thần Địa phương của Quận Travis cung cấp dịch vụ tâm thần, can thiệp khủng hoảng, điều trị nghiện và dịch vụ khuyết tật trí tuệ/phát triển.",
        "svc-fameld": "Nhà ở hỗ trợ thường trực và dịch vụ quản lý tiền cho người cao tuổi thu nhập thấp và người lớn khuyết tật, bao gồm các cộng đồng Lyons Gardens và Sherman Apartments.",
        "svc-atc": "Thông tin, tư vấn và hòa giải miễn phí về các vấn đề chủ nhà-người thuê. Giúp người thuê hiểu quyền của mình theo luật Texas, giải quyết tranh chấp và điều tra khiếu nại nhà ở công bằng.",
        "svc-iam-food-pantry": "Kho thực phẩm phù hợp văn hóa phục vụ các gia đình tị nạn và nhập cư ở bắc Austin — thịt halal được chứng nhận, các loại thực phẩm chính (gạo, đậu lăng, gia vị) và sữa công thức cho trẻ. Tình nguyện viên song ngữ.",
        "svc-ccct": "Dịch vụ pháp lý nhập cư (DACA, nhập tịch, đơn bảo lãnh gia đình), tái định cư người tị nạn, tư vấn ổn định tài chính, kho thực phẩm và phục hồi sau thiên tai cho cư dân của mọi tôn giáo.",
        "svc-multicultural-refugee": "Hỗ trợ hội nhập dài hạn cho các gia đình tị nạn và nhập cư sau giai đoạn tái định cư ban đầu. Các chương trình bao gồm New Leaf Agriculture (đào tạo nông nghiệp có trả lương), nhóm sức khỏe phụ nữ và cố vấn thanh thiếu niên.",
        "svc-apl-literacy": "Dạy kèm xóa mù chữ cho người lớn miễn phí, giao tiếp tiếng Anh (Talk Time) và luyện thi nhập tịch tại các chi nhánh thư viện trên khắp Austin.",
        "svc-vivent": "Chăm sóc HIV, phòng ngừa và dịch vụ hỗ trợ bao gồm chăm sóc y tế và nha khoa, dược phẩm, tư vấn sức khỏe tâm thần, kho thực phẩm và quản lý ca cho người sống chung với HIV.",
        "svc-cfr": "Dịch vụ hỗ trợ phục hồi do đồng đẳng dẫn dắt cho người gặp vấn đề về sử dụng chất và sức khỏe tâm thần — bao gồm huấn luyện phục hồi, hỗ trợ việc làm và hoạt động xã hội tỉnh táo.",
    },
    "es": {
        "svc-heat-relief": "Asistencia financiera única para reparación de aire acondicionado, reemplazo de unidad o compra de aparato de ventana para residentes que califican por ingresos — con prioridad para adultos mayores, trabajadores al aire libre y hogares con condiciones crónicas.",
        "svc-wic": "El programa WIC (Mujeres, Bebés y Niños) ofrece alimentos nutritivos, educación nutricional, apoyo a la lactancia y referencias a servicios de salud y comunitarios.",
        "svc-commcare": "Centro de Salud Calificado Federalmente que ofrece atención primaria, dental, salud conductual y farmacia con tarifas según ingresos, sin importar el estado del seguro.",
        "svc-cooling-center-network": "Red de bibliotecas e instalaciones municipales con horario extendido durante alertas de calor — espacios con aire acondicionado, gratis para todos los residentes.",
        "svc-headstart": "Programa gratuito de educación temprana para niños de 3 a 5 años de familias de bajos ingresos. Incluye evaluaciones de salud, comidas nutritivas y apoyo para la preparación escolar.",
        "svc-aisd-prek": "Pre-K gratis de día completo para niños de 3 y 4 años elegibles en escuelas primarias de AISD, además de educación especial temprana y aulas de Pre-K bilingües.",
        "svc-vida-clinic-schools": "Clínicos integrados que brindan terapia, atención psiquiátrica y respuesta a crisis dentro de las escuelas primarias, intermedias y secundarias de AISD. Sesiones presenciales y por telesalud disponibles.",
        "svc-cis-central-tx": "Manejo de casos en la escuela para estudiantes K-12 en riesgo de abandonar — consejeros licenciados, trabajadores sociales y entrenadores académicos en planteles de AISD, Del Valle, Manor y Pflugerville ISD.",
        "svc-integral": "La Autoridad Local de Salud Mental del Condado de Travis brinda servicios psiquiátricos, intervención en crisis, tratamiento de uso de sustancias y servicios para discapacidades intelectuales/del desarrollo.",
        "svc-fameld": "Vivienda permanente de apoyo y servicios de manejo de dinero para adultos mayores de bajos ingresos y adultos con discapacidades, incluyendo las comunidades Lyons Gardens y Sherman Apartments.",
        "svc-atc": "Información, asesoría y mediación gratis sobre asuntos de propietarios e inquilinos. Ayuda a los inquilinos a entender sus derechos bajo la ley de Texas, resuelve disputas e investiga quejas de vivienda justa.",
        "svc-iam-food-pantry": "Despensa de alimentos culturalmente apropiada para familias refugiadas e inmigrantes en el norte de Austin — carnes certificadas halal, alimentos básicos regionales (arroz, lentejas, especias) y fórmula infantil. Voluntarios bilingües.",
        "svc-ccct": "Servicios legales de inmigración (DACA, ciudadanía, peticiones familiares), reasentamiento de refugiados, asesoría de estabilidad financiera, despensa de alimentos y recuperación de desastres para residentes de todas las creencias.",
        "svc-multicultural-refugee": "Apoyo de integración a largo plazo para familias refugiadas e inmigrantes después de la ventana inicial de reasentamiento. Programas como New Leaf Agriculture (capacitación agrícola pagada), círculos de bienestar para mujeres y mentoría juvenil.",
        "svc-apl-literacy": "Tutoría gratis de alfabetización para adultos uno a uno, inglés conversacional (Talk Time) y preparación para el examen de ciudadanía en sucursales de la biblioteca por todo Austin.",
        "svc-vivent": "Atención, prevención y servicios de apoyo para VIH incluyendo atención médica y dental, farmacia, consejería de salud mental, despensa de alimentos y manejo de casos para personas viviendo con VIH.",
        "svc-cfr": "Servicios de apoyo a la recuperación dirigidos por pares para personas con desafíos de uso de sustancias y salud mental — coaching de recuperación, apoyo laboral y actividades sociales en sobriedad.",
    },
    "zh": {
        "svc-heat-relief": "为符合收入条件的居民提供一次性空调维修、空调更换或窗式空调购置的经济援助——优先帮助老年人、户外工作者以及有慢性病的家庭。",
        "svc-wic": "WIC（妇女、婴儿和儿童）项目提供营养食品、营养教育、母乳喂养支持，以及到医疗和社区服务的转介。",
        "svc-commcare": "联邦合格医疗中心，按收入梯度收费提供初级医疗、牙科、行为健康和药房服务——不论保险状况。",
        "svc-cooling-center-network": "在高温预警期间延长营业时间的图书馆和市政设施网络——有空调的凉爽空间，所有居民免费。",
        "svc-headstart": "为低收入家庭3-5岁儿童提供的免费幼儿教育项目。包括健康筛查、营养餐和入学准备支持。",
        "svc-aisd-prek": "为符合条件的3至4岁儿童在AISD小学提供的免费全日制学前班，外加幼儿特殊教育和双语学前班。",
        "svc-vida-clinic-schools": "在AISD小学、初中和高中校内提供治疗、精神科护理和危机应对的嵌入式临床医生。可面诊或远程问诊。",
        "svc-cis-central-tx": "为有辍学风险的K-12学生提供校园个案管理——持照辅导员、社工和学业教练驻校于AISD、Del Valle、Manor和Pflugerville ISD。",
        "svc-integral": "Travis县地方心理健康主管部门，提供精神科服务、危机干预、物质使用治疗以及智力/发育障碍服务。",
        "svc-fameld": "为低收入老年人和残障成年人提供永久支持性住房和财务管理服务，包括Lyons Gardens和Sherman Apartments社区。",
        "svc-atc": "免费的房东-租客事务信息、咨询和调解服务。帮助租户了解德州法律下的权利，解决纠纷，并调查公平住房投诉。",
        "svc-iam-food-pantry": "服务于北奥斯汀难民和移民家庭的具有文化敏感度的食物分发——清真认证肉类、地区主食（米、扁豆、香料）和婴儿配方奶粉。配有双语志愿者。",
        "svc-ccct": "移民法律服务（DACA、公民身份、家庭申请）、难民安置、财务稳定咨询、食物分发和灾后恢复，面向所有信仰的居民。",
        "svc-multicultural-refugee": "为初次安置期之后的难民和移民家庭提供长期融入支持。项目包括New Leaf Agriculture（带薪农业培训）、女性健康圈和青少年指导。",
        "svc-apl-literacy": "在奥斯汀各分馆图书馆提供免费的一对一成人识字辅导、英语会话（Talk Time）和入籍考试备考。",
        "svc-vivent": "为HIV感染者提供护理、预防和支持服务，包括医疗和牙科、药房、心理健康咨询、食物分发和个案管理。",
        "svc-cfr": "由同伴主导的康复支持服务，面向有物质使用和心理健康挑战的人——包括康复辅导、就业支持和清醒社交活动。",
    },
    "ar": {
        "svc-heat-relief": "مساعدة مالية لمرة واحدة لإصلاح المكيف أو استبدال الوحدة أو شراء مكيف نوافذ للسكان المؤهلين حسب الدخل — مع الأولوية لكبار السن والعاملين في الهواء الطلق والأسر التي بها أمراض مزمنة.",
        "svc-wic": "برنامج WIC (للنساء والرضع والأطفال) يقدم أغذية مغذية وتثقيفاً غذائياً ودعماً للرضاعة الطبيعية وإحالات إلى الخدمات الصحية والمجتمعية.",
        "svc-commcare": "مركز صحي معتمد فيدرالياً يقدم رعاية أولية وطب أسنان وصحة سلوكية وصيدلية برسوم متدرجة — بغض النظر عن وضع التأمين.",
        "svc-cooling-center-network": "شبكة من المكتبات ومرافق المدينة بساعات عمل ممتدة خلال موجات الحر — أماكن باردة مكيفة ومجانية لجميع السكان.",
        "svc-headstart": "برنامج تعليم طفولة مبكرة مجاني للأطفال من سن 3 إلى 5 سنوات من الأسر منخفضة الدخل. يشمل فحوصات صحية ووجبات مغذية ودعم الاستعداد للمدرسة.",
        "svc-aisd-prek": "روضة مجانية بدوام كامل للأطفال المؤهلين في سن 3 و4 سنوات في مدارس AISD الابتدائية، بالإضافة إلى تعليم خاص للطفولة المبكرة وفصول روضة ثنائية اللغة.",
        "svc-vida-clinic-schools": "أطباء سريريون مدمجون يقدمون العلاج والرعاية النفسية والاستجابة للأزمات داخل مدارس AISD الابتدائية والمتوسطة والثانوية. جلسات حضورية وعبر الإنترنت متاحة.",
        "svc-cis-central-tx": "إدارة حالات في المدارس للطلاب من K-12 المعرضين لخطر التسرب — مستشارون مرخصون وأخصائيون اجتماعيون ومدربون أكاديميون في حرم مدارس AISD وDel Valle وManor وPflugerville ISD.",
        "svc-integral": "السلطة المحلية للصحة النفسية في مقاطعة ترافيس تقدم خدمات نفسية وتدخل في الأزمات وعلاج إدمان المواد وخدمات للإعاقات الذهنية/التطورية.",
        "svc-fameld": "إسكان دائم داعم وخدمات إدارة المال لكبار السن منخفضي الدخل والبالغين ذوي الإعاقات، بما في ذلك مجتمعات Lyons Gardens وSherman Apartments.",
        "svc-atc": "معلومات واستشارات ووساطة مجانية في قضايا المالك والمستأجر. يساعد المستأجرين على فهم حقوقهم بموجب قانون تكساس وحل النزاعات والتحقيق في شكاوى الإسكان العادل.",
        "svc-iam-food-pantry": "مخزن طعام يراعي الثقافة يخدم الأسر اللاجئة والمهاجرة في شمال أوستن — لحوم حلال معتمدة ومواد غذائية إقليمية أساسية (الأرز والعدس والبهارات) وحليب أطفال. متطوعون يتحدثون لغتين.",
        "svc-ccct": "خدمات قانونية للهجرة (DACA، الجنسية، طلبات لم شمل العائلات)، إعادة توطين اللاجئين، استشارات الاستقرار المالي، مخزن طعام، والتعافي من الكوارث لسكان جميع الأديان.",
        "svc-multicultural-refugee": "دعم اندماج طويل المدى للأسر اللاجئة والمهاجرة بعد فترة إعادة التوطين الأولى. تشمل البرامج New Leaf Agriculture (تدريب زراعي مدفوع) وحلقات صحة المرأة وإرشاد الشباب.",
        "svc-apl-literacy": "دروس مجانية فردية لمحو أمية الكبار، ومحادثة باللغة الإنجليزية (Talk Time)، والتحضير لاختبار الجنسية في فروع المكتبة في جميع أنحاء أوستن.",
        "svc-vivent": "رعاية فيروس نقص المناعة البشرية، الوقاية والخدمات الداعمة بما في ذلك الرعاية الطبية وطب الأسنان، والصيدلية، والاستشارات الصحية النفسية، ومخزن طعام، وإدارة الحالات للمتعايشين مع HIV.",
        "svc-cfr": "خدمات دعم التعافي بقيادة الأقران للأشخاص الذين يواجهون تحديات في تعاطي المواد والصحة النفسية — بما في ذلك تدريب التعافي ودعم التوظيف وأنشطة اجتماعية بدون كحول.",
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
    """Localized service description, or None if not translated."""
    table = SERVICE_DESCRIPTIONS_I18N.get(language)
    if table is None:
        return None
    return table.get(service_id)


def translate_risk_flag(risk_type: str, language: str) -> dict[str, str] | None:
    """Localized risk flag {label, description}, or None if not translated."""
    table = RISK_FLAGS_I18N.get(language)
    if table is None:
        return None
    return table.get(risk_type)
