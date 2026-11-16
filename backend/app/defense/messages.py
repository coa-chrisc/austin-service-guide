"""Resident-facing sentences for degraded modes, in the AI notice's languages.

Kept here rather than in ``services/i18n.py`` so the defense package owns
its copy. Translations were written for this feature and want a native
review like the rest of the copy.
"""

from __future__ import annotations

from app.defense import context
from app.models import IntakeMessage, IntakeSession, MessageRole
from app.services.city import get_city

#: ``ai_credits`` (OpenAI quota or spend limit reached) is not in this table:
#: its text is ``serviceGuide.creditsExhaustedMessage`` (see ``notice_text``).
NOTICES: dict[str, dict[str, str]] = {
    # Per-principal budget used up.
    "ai_budget": {
        "en": "You've reached today's limit for the AI assistant. The guided questions below still work.",
        "es": "Llegaste al límite de hoy del asistente de IA. Las preguntas guiadas de abajo siguen funcionando.",
        "vi": "Bạn đã dùng hết giới hạn hôm nay của trợ lý AI. Các câu hỏi hướng dẫn bên dưới vẫn hoạt động.",
        "zh": "您今天使用 AI 助手的次数已达上限。下面的引导问题仍然可以使用。",
        "ar": "لقد وصلت إلى الحد اليومي لاستخدام المساعد الذكي. لا تزال الأسئلة الإرشادية أدناه متاحة.",
    },
    # Site-wide pause: kill switch, breaker, global budget.
    "ai_paused": {
        "en": "The AI assistant is paused right now. The guided questions below still work.",
        "es": "El asistente de IA está en pausa por ahora. Las preguntas guiadas de abajo siguen funcionando.",
        "vi": "Trợ lý AI đang tạm dừng. Các câu hỏi hướng dẫn bên dưới vẫn hoạt động.",
        "zh": "AI 助手目前暂停服务。下面的引导问题仍然可以使用。",
        "ar": "المساعد الذكي متوقف مؤقتًا. لا تزال الأسئلة الإرشادية أدناه متاحة.",
    },
}


def notice_text(key: str, language: str = "en") -> str:
    if key == "ai_credits":
        # The operator's own words (city config), shown as written in every
        # language: machine-translating who to contact could garble it.
        return get_city().credits_exhausted_message
    lang = (language or "en").split("-")[0].lower()
    table = NOTICES[key]
    return table.get(lang, table["en"])


def add_degraded_notice(session: IntakeSession, reply: IntakeMessage) -> IntakeMessage:
    """Prefix ``reply`` with this request's degraded-mode sentence, once per intake."""
    key = context.current().notice
    if not key or reply.crisis_detected:
        return reply
    text = notice_text(key, session.language)
    already = any(
        m is not reply and m.role == MessageRole.assistant and text in m.content
        for m in session.conversation
    )
    if not already:
        reply.content = f"{text}\n\n{reply.content}"
    return reply
