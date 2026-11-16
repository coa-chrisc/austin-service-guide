"""Crisis keyword lists: real crisis statements match, ordinary sentences don't.

One true-positive and one false-positive group per language the city
config can offer. The false positives are the sentences a resident is
likely to type about housing, money, heat or the neighborhood.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.city import get_city
from app.services.crisis import detect_crisis
from app.services.crisis_phrases import ACUTE_KINDS, PHRASES

SUI, DV, DANGER = ACUTE_KINDS
CONFIG = Path(__file__).resolve().parents[2] / "config"

TRUE_POSITIVES = {
    "en": [
        ("I want to kill myself", SUI), ("I've been thinking about suicide", SUI),
        ("I don't want to live anymore", SUI), ("sometimes I self-harm", SUI),
        ("My husband beats me", DV), ("my boyfriend hit me last night", DV),
        ("I'm afraid of my partner", DV), ("he is hurting me", DV),
        ("I am in danger", DANGER), ("I’m not safe at home", DANGER),
        ("he said he's going to kill me", DANGER), ("I'm in danger of dying", DANGER),
    ],
    "es": [
        ("Quiero suicidarme", SUI), ("ya no quiero vivir", SUI),
        ("me quiero morir", SUI), ("Mi esposo me pega", DV),
        ("tengo miedo de mi pareja", DV), ("sufro violencia doméstica", DV),
        ("Estoy en peligro", DANGER), ("mi esposo va a matarme", DANGER),
        ("no me siento segura en casa", DANGER),
    ],
    "fr": [
        ("je veux mourir", SUI), ("j'ai envie de me tuer", SUI),
        ("mon mari me frappe", DV), ("j'ai peur de mon conjoint", DV),
        ("je suis en danger", DANGER), ("je suis en danger de mort", DANGER),
    ],
    "vi": [
        ("tôi muốn chết", SUI), ("tôi muốn tự tử", SUI),
        ("chồng tôi đánh tôi", DV), ("tôi bị bạo lực gia đình", DV),
        ("tôi đang gặp nguy hiểm", DANGER), ("anh ta dọa giết tôi", DANGER),
    ],
    "zh": [
        ("我想死", SUI), ("我想自杀", SUI), ("我不想活了", SUI),
        ("我老公打我", DV), ("我遭受家暴", DV),
        ("我有危险", DANGER), ("他要杀我", DANGER),
    ],
    "ko": [
        ("죽고 싶어요", SUI), ("자살하고 싶어요", SUI),
        ("남편이 때려요", DV), ("가정폭력을 당하고 있어요", DV),
        ("저는 위험해요", DANGER), ("저를 죽이겠다고 했어요", DANGER),
    ],
    "ar": [
        ("أريد أن أموت", SUI), ("افكر في الانتحار", SUI),
        ("زوجي يضربني", DV), ("أتعرض للعنف الأسري", DV),
        ("أنا في خطر", DANGER), ("هددني بالقتل", DANGER),
    ],
    "hi": [
        ("मैं आत्महत्या करना चाहता हूँ", SUI), ("मैं मरना चाहती हूँ", SUI),
        ("मेरा पति मुझे मारता है", DV), ("घरेलू हिंसा", DV),
        ("मैं खतरे में हूँ", DANGER), ("वह मुझे मार डालेगा", DANGER),
    ],
}

FALSE_POSITIVES = {
    "en": [
        "We are in danger of losing our apartment",
        "The neighborhood is not safe for the kids to walk to school",
        "Please keep my information safe",
        "Beats me, I don't know our exact income",
        "I hurt my back at work and need a clinic",
        "The heat is killing me, our AC is broken",
        "I'm dying to find a cheaper place",
        "My son was hit by a car last year and needs physical therapy",
        "My landlord threatened to evict us",
    ],
    "es": [
        "Estoy en peligro de perder mi casa",
        "El barrio no es seguro de noche",
        "Me muero de hambre",
        "El sol me pega muy fuerte en el trabajo",
        "Necesito ayuda para pagar la renta",
    ],
    "fr": [
        "Je suis en danger de perdre mon logement",
        "Le quartier n'est pas sûr",
        "Je meurs de faim",
    ],
    "vi": [
        "Từ từ thôi",
        "Tôi đói muốn chết",
        "Khu này không an toàn cho trẻ em",
        "Tôi cần giúp đỡ tiền thuê nhà",
    ],
    "zh": [
        "请打我电话",
        "我想找工作",
        "这个社区不安全",
        "我好想你",
    ],
    "ko": [
        "배고파 죽겠어요",
        "남편이 때때로 일을 해요",
        "동네가 안전하지 않아요",
        "피자해 먹었어요",
        "할머니가 그날 죽었어요",
    ],
    "ar": [
        "أريد أن أعمل",
        "الحي ليس آمنا",
        "أحتاج مساعدة في الإيجار",
    ],
    "hi": [
        "मुझे नौकरी चाहिए",
        "यह इलाका सुरक्षित नहीं है",
        "भूख से मर रहा हूँ",
    ],
}


@pytest.mark.parametrize(
    ("text", "kind"),
    [case for cases in TRUE_POSITIVES.values() for case in cases],
)
def test_crisis_statements_match(text, kind):
    assert kind in detect_crisis(text)


@pytest.mark.parametrize("text", [t for texts in FALSE_POSITIVES.values() for t in texts])
def test_ordinary_sentences_do_not_match(text):
    assert detect_crisis(text) == []


def test_every_offered_language_has_lists_and_cases():
    schema = json.loads((CONFIG / "city.config.schema.json").read_text(encoding="utf-8"))
    offered = set(
        schema["properties"]["serviceGuide"]["properties"]["languages"]["items"]["enum"]
    ) | set(get_city().languages)
    for lang in offered:
        assert set(ACUTE_KINDS) <= set(PHRASES[lang]), lang
        assert {kind for _, kind in TRUE_POSITIVES[lang]} == set(ACUTE_KINDS), lang
        assert FALSE_POSITIVES[lang], lang


def test_matching_ignores_case_accents_and_spacing():
    assert detect_crisis("QUIERO   SUICIDARME") == [SUI]
    assert detect_crisis("violencia domestica") == [DV]  # no accent typed
    assert detect_crisis("self harm") == detect_crisis("self-harm") == [SUI]


def test_kinds_come_back_most_urgent_first():
    assert detect_crisis("I am in danger, my husband beats me and I want to die") == list(ACUTE_KINDS)
