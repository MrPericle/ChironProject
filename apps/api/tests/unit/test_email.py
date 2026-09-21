import logging
from unittest.mock import MagicMock

from chiron_api.config import Settings
from chiron_api.email import (
    ConsoleEmailSender,
    ResendEmailSender,
    TransactionalEmail,
    build_email_sender,
)


def test_console_email_sender_writes_message_to_uvicorn_log(caplog) -> None:
    message = TransactionalEmail(
        recipient="member@example.com",
        subject="Conferma email",
        text_body="Apri http://localhost:5173/?token=test-token",
        html_body="<p>Conferma email</p>",
    )

    with caplog.at_level(logging.INFO, logger="uvicorn.error"):
        ConsoleEmailSender().send(message)

    assert "member@example.com" in caplog.text
    assert "http://localhost:5173/?token=test-token" in caplog.text


def test_resend_email_sender_posts_expected_message(monkeypatch) -> None:
    response_mock = MagicMock()
    response_mock.__enter__.return_value = response_mock
    response_mock.__exit__.return_value = False
    urlopen_mock = MagicMock(return_value=response_mock)
    monkeypatch.setattr("chiron_api.email.urlopen", urlopen_mock)
    sender = ResendEmailSender(
        Settings(
            EMAIL_DELIVERY_MODE="resend",
            EMAIL_FROM_ADDRESS="noreply@makastudio.it",
            EMAIL_FROM_NAME="MAKA",
            RESEND_API_KEY="re_test_key",
        ),
    )
    message = TransactionalEmail(
        recipient="member@example.com",
        subject="Conferma email",
        text_body="Conferma il tuo indirizzo.",
        html_body="<p>Conferma il tuo indirizzo.</p>",
    )

    sender.send(message)

    request = urlopen_mock.call_args.args[0]
    assert request.full_url == "https://api.resend.com/emails"
    assert request.get_header("Authorization") == "Bearer re_test_key"
    assert request.data is not None
    assert b'"to": ["member@example.com"]' in request.data
    assert b'"from": "MAKA <noreply@makastudio.it>"' in request.data


def test_build_email_sender_selects_resend() -> None:
    sender = build_email_sender(
        Settings(
            EMAIL_DELIVERY_MODE="resend",
            RESEND_API_KEY="re_test_key",
        ),
    )

    assert isinstance(sender, ResendEmailSender)
