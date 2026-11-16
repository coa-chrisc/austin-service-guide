"""The client-held conversation is untrusted: bound what reaches the model.

A tampered state can carry 200 messages of up to 10,000 characters (within
the 256 KiB body limit), including forged assistant turns. Each agent-loop
iteration resends the whole input, so without a cap one /message request
could push a few hundred thousand tokens through the paid model.
"""

from __future__ import annotations

from app.models import IntakeMessage, IntakeSession, MessageRole
from app.services.ai import MAX_MODEL_INPUT_CHARS, MAX_MODEL_INPUT_MESSAGES, _conversation_input


def _session(messages: list[tuple[str, str]]) -> IntakeSession:
    return IntakeSession(conversation=[
        IntakeMessage(role=MessageRole(role), content=content) for role, content in messages
    ])


def test_oversized_history_is_trimmed_to_the_budget():
    history = [
        ("user" if i % 2 else "assistant", f"turn {i} " + "x" * 9_000) for i in range(199)
    ]
    history.append(("user", "latest question"))
    out = _conversation_input(_session(history))
    assert len(out) <= MAX_MODEL_INPUT_MESSAGES
    assert sum(len(m["content"]) for m in out) <= MAX_MODEL_INPUT_CHARS
    # Most recent turns survive, in order, ending with the new message.
    assert out[-1] == {"role": "user", "content": "latest question"}
    assert out[-2]["content"].startswith("turn 198 ")
    numbers = [int(m["content"].split()[1]) for m in out[:-1]]
    assert numbers == sorted(numbers)


def test_many_short_messages_are_capped_by_count():
    history = [("user" if i % 2 else "assistant", f"m{i}") for i in range(200)]
    out = _conversation_input(_session(history))
    assert len(out) == MAX_MODEL_INPUT_MESSAGES
    assert out[-1]["content"] == "m199"


def test_latest_message_is_kept_even_when_over_budget():
    huge = "y" * (MAX_MODEL_INPUT_CHARS + 500)
    out = _conversation_input(_session([("assistant", "hello"), ("user", huge)]))
    assert out == [{"role": "user", "content": huge}]


def test_normal_intake_is_sent_in_full():
    history = []
    for i in range(15):
        history.append(("assistant", f"Question {i}? " + "a" * 400))
        history.append(("user", f"Answer {i}"))
    out = _conversation_input(_session(history))
    assert len(out) == 30
    assert out[0]["content"].startswith("Question 0?")
