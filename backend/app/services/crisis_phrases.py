"""Crisis kinds and the keyword phrase lists the backend safety net matches.

Data only; the matcher is ``crisis.detect_crisis``. One entry per language
the city config can offer (``serviceGuide.languages``: en, es, zh, hi, ar,
vi, fr, ko). Every list is checked on every resident turn, whatever the
session language, because residents mix languages.

The lists are deliberately narrow: first-person statements of suicidal
intent, abuse, or danger, not single words like "safe" or "danger" that
show up in ordinary sentences ("the neighborhood is not safe", "in danger
of losing my home"). Missing a crisis is worse than over-showing the crisis
lines, so a phrase stays when a real crisis statement would be missed
without it, even if an occasional unrelated sentence trips it.

How phrases match (see ``crisis.normalize``):

- Text and phrases are NFKC-normalized and case-folded; apostrophes are
  dropped ("I'm" and "Im" match alike) and hyphens become spaces.
- en, es, fr: accents are folded too ("suicidarme"/"suicidármé" match).
  Vietnamese keeps its diacritics: folding them merges unrelated words
  ("từ từ", slowly, would become "tu tu", suicide).
- en, es, fr, vi match whole words only. zh, ko, ar, hi match substrings:
  they either have no spaces or attach particles and prefixes to words.
- Arabic is matched with hamza, taa marbuta and alef maqsura folded and
  short-vowel marks removed.
- ``{who}`` in a phrase expands to every entry of the language's ``who``
  list (the people an abuse statement names).
- An ``immediate_danger`` phrase does not count when the next word is the
  language's ``danger_not_followed_by`` word ("I'm in danger of losing my
  apartment" is not a crisis statement; "I'm in danger" is).

The non-English lists are the project's own translations of common crisis
statements. Have a native speaker review them before relying on them.
"""

from __future__ import annotations

SUICIDAL_IDEATION = "suicidal_ideation"
DOMESTIC_VIOLENCE = "domestic_violence"
IMMEDIATE_DANGER = "immediate_danger"
# The model reported a crisis without naming a kind it could classify.
CRISIS_REPORTED = "crisis_reported"

#: Kinds the keyword check and the model can set, most urgent first.
ACUTE_KINDS: tuple[str, ...] = (SUICIDAL_IDEATION, DOMESTIC_VIOLENCE, IMMEDIATE_DANGER)
#: Profile crisis indicators that mean "show the crisis lines". The other
#: indicator, ``homelessness``, still leads the plan with its crisis-direct
#: services but is a housing crisis, not a safety one.
SAFETY_KINDS: tuple[str, ...] = (*ACUTE_KINDS, CRISIS_REPORTED)

#: Languages whose phrases match on whole words.
WORD_BOUNDED = frozenset({"en", "es", "fr", "vi"})
#: Languages whose phrases and text are accent-folded before matching.
ACCENT_FOLDED = frozenset({"en", "es", "fr"})

_EN_WHO = (
    "he", "she", "my husband", "my wife", "my partner", "my boyfriend",
    "my girlfriend", "my ex", "my spouse", "my fiance", "my dad", "my father",
    "my mom", "my mother", "my stepdad", "my stepfather", "my stepmom",
    "my stepmother", "my parents", "my son", "my daughter", "my brother",
    "my sister", "my roommate",
)

PHRASES: dict[str, dict[str, tuple[str, ...]]] = {
    "en": {
        "who": _EN_WHO,
        SUICIDAL_IDEATION: (
            "suicide", "suicidal", "kill myself", "killing myself",
            "want to die", "wanna die", "want to be dead", "wish i was dead",
            "wish i were dead", "better off dead", "end my life",
            "ending my life", "end it all", "take my own life",
            "taking my own life", "dont want to live", "do not want to live",
            "dont want to be alive", "do not want to be alive",
            "no reason to live", "self harm", "self harming",
            "want to hurt myself", "going to hurt myself",
            "thinking about hurting myself", "thinking of hurting myself",
            "been hurting myself", "been cutting myself",
            "started cutting myself", "cut myself on purpose",
        ),
        DOMESTIC_VIOLENCE: (
            "domestic violence", "domestic abuse", "family violence",
            "abusive relationship", "abusive partner", "abusive husband",
            "abusive wife", "abusive boyfriend", "abusive girlfriend",
            "hitting me", "beating me", "abusing me", "beats me up",
            "beat me up", "{who} beats me", "{who} beat me", "{who} hits me",
            "{who} hit me", "{who} hurts me", "{who} is hurting me",
            "{who} abuses me", "{who} abused me", "{who} chokes me",
            "{who} choked me", "{who} strangled me", "{who} threatens me",
            "{who} threatened me", "{who} raped me", "afraid of {who}",
            "scared of {who}", "terrified of {who}", "stalking me",
            "sexually assaulted", "sexual assault", "raped me", "was raped",
            "been raped",
        ),
        IMMEDIATE_DANGER: (
            "im in danger", "i am in danger", "were in danger",
            "we are in danger", "my life is in danger",
            "in immediate danger", "danger of dying", "danger of being killed",
            "im not safe", "i am not safe", "were not safe", "we are not safe",
            "not safe at home", "dont feel safe at home",
            "do not feel safe at home", "dont feel safe in my home",
            "afraid for my life", "fear for my life", "scared for my life",
            "going to kill me", "gonna kill me", "wants to kill me",
            "trying to kill me", "threatened to kill me",
            "threatening to kill me", "going to hurt me", "gonna hurt me",
            "threatened to hurt me", "threatening to hurt me",
        ),
    },
    "es": {
        "who": (
            "el", "ella", "mi esposo", "mi esposa", "mi marido", "mi mujer",
            "mi pareja", "mi novio", "mi novia", "mi ex", "mi papa",
            "mi padre", "mi mama", "mi madre", "mi padrastro", "mi madrastra",
            "mi hijo", "mi hija", "mi hermano", "mi hermana",
        ),
        SUICIDAL_IDEATION: (
            "suicidio", "suicidarme", "suicida", "me quiero morir",
            "quiero morir", "quiero morirme", "quisiera morir",
            "quisiera estar muerto", "quisiera estar muerta",
            "quiero matarme", "voy a matarme", "pienso matarme",
            "me voy a matar", "me quiero matar", "quitarme la vida",
            "acabar con mi vida", "terminar con mi vida", "no quiero vivir",
            "no quiero seguir viviendo", "quiero hacerme daño",
            "quiero lastimarme", "autolesion", "autolesiones",
        ),
        DOMESTIC_VIOLENCE: (
            "violencia domestica", "violencia familiar",
            "violencia intrafamiliar", "{who} me pega", "{who} me golpea",
            "{who} me golpeo", "{who} me pego", "{who} me maltrata",
            "{who} me lastima", "{who} me hace daño", "{who} me abusa",
            "{who} me amenaza", "me esta golpeando", "abusa de mi",
            "miedo a {who}", "miedo de {who}", "me violo", "abuso sexual",
            "agresion sexual",
        ),
        IMMEDIATE_DANGER: (
            "estoy en peligro", "estamos en peligro", "mi vida esta en peligro",
            "peligro inmediato", "peligro de muerte", "corro peligro",
            "no estoy a salvo", "no estoy segura en casa",
            "no estoy seguro en casa", "no me siento segura en casa",
            "no me siento seguro en casa", "me va a matar", "va a matarme",
            "me quiere matar", "quiere matarme", "amenazo con matarme",
            "amenaza con matarme", "me va a hacer daño",
        ),
    },
    "fr": {
        "who": (
            "il", "elle", "mon mari", "ma femme", "mon conjoint",
            "ma conjointe", "mon copain", "ma copine", "mon partenaire",
            "ma partenaire", "mon ex", "mon pere", "ma mere", "mon beau pere",
            "mon fils", "ma fille", "mon frere",
        ),
        SUICIDAL_IDEATION: (
            "suicide", "suicidaire", "me suicider", "je veux mourir",
            "envie de mourir", "je vais me tuer", "je veux me tuer",
            "envie de me tuer", "mettre fin a mes jours",
            "mettre fin a ma vie", "en finir avec la vie",
            "je ne veux plus vivre", "me faire du mal", "me scarifier",
            "automutilation",
        ),
        DOMESTIC_VIOLENCE: (
            "violence conjugale", "violences conjugales",
            "violence domestique", "violences domestiques",
            "{who} me frappe", "{who} me bat", "{who} m'a frappe",
            "{who} m'a battue", "{who} me menace", "peur de {who}",
            "agression sexuelle", "m'a violee", "m'a viole",
        ),
        IMMEDIATE_DANGER: (
            "je suis en danger", "nous sommes en danger",
            "ma vie est en danger", "en danger de mort",
            "je ne suis pas en securite", "pas en securite chez moi",
            "il va me tuer", "elle va me tuer", "veut me tuer",
            "menace de me tuer",
        ),
    },
    "vi": {
        SUICIDAL_IDEATION: (
            "tự tử", "tự sát", "tôi muốn chết", "em muốn chết",
            "mình muốn chết", "con muốn chết", "không muốn sống nữa",
            "kết thúc cuộc đời", "tự làm hại bản thân",
        ),
        DOMESTIC_VIOLENCE: (
            "bạo lực gia đình", "bạo hành", "đánh tôi", "đánh đập tôi",
            "bị đánh đập", "sợ chồng", "bị cưỡng hiếp", "hiếp dâm",
            "xâm hại tình dục",
        ),
        IMMEDIATE_DANGER: (
            "tôi đang gặp nguy hiểm", "đang gặp nguy hiểm",
            "tôi không an toàn", "không an toàn ở nhà", "sẽ giết tôi",
            "muốn giết tôi", "dọa giết tôi", "đe dọa giết",
        ),
    },
    "zh": {
        SUICIDAL_IDEATION: (
            "自杀", "自殺", "我想死", "想去死", "好想死", "真想死", "不想活",
            "轻生", "輕生", "结束自己的生命", "結束自己的生命", "自残", "自殘",
            "伤害自己", "傷害自己",
        ),
        DOMESTIC_VIOLENCE: (
            "家暴", "家庭暴力", "他打我", "她打我", "老公打我", "丈夫打我",
            "男朋友打我", "伴侣打我", "伴侶打我", "前夫打我", "爸爸打我",
            "妈妈打我", "媽媽打我", "被老公打", "被丈夫打", "虐待我", "性侵",
            "强奸", "強姦", "强暴", "強暴", "怕我老公", "怕我丈夫",
        ),
        IMMEDIATE_DANGER: (
            "我有危险", "我有危險", "我很危险", "我很危險", "生命危险",
            "生命危險", "要杀我", "要殺我", "想杀我", "想殺我", "我不安全",
            "在家不安全",
        ),
    },
    "ko": {
        SUICIDAL_IDEATION: (
            "자살", "죽고 싶", "죽고싶", "살고 싶지 않", "살고싶지 않",
            "살기 싫", "자해하", "자해를", "자해했", "자해 충동", "목숨을 끊",
        ),
        DOMESTIC_VIOLENCE: (
            "가정폭력", "가정 폭력", "남편이 때려", "남편이 때리",
            "남편이 때린", "남자친구가 때려", "남자친구가 때리", "아내가 때려",
            "저를 때려", "저를 때리", "나를 때려", "나를 때리", "날 때려",
            "날 때리", "폭행당", "성폭행", "성폭력", "강간", "학대당",
        ),
        IMMEDIATE_DANGER: (
            "저는 위험", "제가 위험", "나는 위험", "목숨이 위험",
            "저를 죽", "나를 죽", "죽이겠다고 협박", "죽인다고 협박",
            "죽이겠다고 했", "집에서 안전하지", "저는 안전하지 않",
        ),
    },
    "ar": {
        SUICIDAL_IDEATION: (
            "انتحار", "انتحر", "أريد أن أموت", "اريد ان اموت", "بدي اموت",
            "عايز اموت", "أقتل نفسي", "اقتل نفسي", "أنهي حياتي",
            "لا أريد أن أعيش", "إيذاء نفسي", "أؤذي نفسي",
        ),
        DOMESTIC_VIOLENCE: (
            "عنف أسري", "عنف الأسري", "عنف منزلي", "عنف المنزلي",
            "يضربني", "تضربني", "يعتدي علي", "اغتصاب", "اغتصبني",
            "خائفة من زوجي", "خايفة من زوجي", "أخاف من زوجي",
        ),
        IMMEDIATE_DANGER: (
            "أنا في خطر", "حياتي في خطر", "سيقتلني", "يريد قتلي",
            "هددني بالقتل", "يهددني بالقتل", "لست بأمان", "لست في أمان",
        ),
    },
    "hi": {
        SUICIDAL_IDEATION: (
            "आत्महत्या", "खुदकुशी", "ख़ुदकुशी", "मरना चाहता", "मरना चाहती",
            "मर जाना चाहता", "मर जाना चाहती", "जीना नहीं चाहता",
            "जीना नहीं चाहती", "खुद को मार", "अपनी जान ले", "खुद को नुकसान",
        ),
        DOMESTIC_VIOLENCE: (
            "घरेलू हिंसा", "पति मारता", "मुझे मारता", "मुझे मारते",
            "मारपीट करता", "मारपीट करते", "बलात्कार", "यौन उत्पीड़न",
            "पति से डर",
        ),
        IMMEDIATE_DANGER: (
            "मैं खतरे में", "मैं ख़तरे में", "जान का खतरा", "जान को खतरा",
            "जान से मार", "मार डालेगा", "मार डालेगी", "मैं सुरक्षित नहीं",
            "घर में सुरक्षित नहीं",
        ),
    },
}

#: Next word that turns an ``immediate_danger`` phrase into an ordinary
#: sentence ("in danger of losing", "en peligro de perder").
DANGER_NOT_FOLLOWED_BY: dict[str, str] = {"en": "of", "es": "de", "fr": "de"}

#: Quick-reply buttons on the crisis message that ask for the lines again.
#: A resident who taps one gets the crisis response, not the next question.
COUNSELOR_REQUESTS: tuple[str, ...] = (
    "Connect with crisis counselor",
    "Hablar con un consejero de crisis",
)
