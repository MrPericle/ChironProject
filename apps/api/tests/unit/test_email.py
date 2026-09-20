import logging

from chiron_api.email import ConsoleEmailSender, TransactionalEmail


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
