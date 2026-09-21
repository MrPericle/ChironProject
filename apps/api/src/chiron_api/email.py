import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
from json import dumps
from typing import Protocol
from urllib.request import Request, urlopen

from chiron_api.config import Settings

logger = logging.getLogger(__name__)
development_email_logger = logging.getLogger("uvicorn.error")


@dataclass(frozen=True)
class TransactionalEmail:
    recipient: str
    subject: str
    text_body: str
    html_body: str


class EmailSender(Protocol):
    def send(self, message: TransactionalEmail) -> None: ...


class ConsoleEmailSender:
    def send(self, message: TransactionalEmail) -> None:
        development_email_logger.info(
            "Development email to %s: %s\n%s",
            message.recipient,
            message.subject,
            message.text_body,
        )


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(self, message: TransactionalEmail) -> None:
        email_message = EmailMessage()
        email_message["From"] = formataddr(
            (self.settings.email_from_name, self.settings.email_from_address),
        )
        email_message["To"] = message.recipient
        email_message["Subject"] = message.subject
        email_message.set_content(message.text_body)
        email_message.add_alternative(message.html_body, subtype="html")

        smtp_type = smtplib.SMTP_SSL if self.settings.smtp_security == "ssl" else smtplib.SMTP
        with smtp_type(self.settings.smtp_host, self.settings.smtp_port, timeout=15) as client:
            if self.settings.smtp_security == "starttls":
                client.starttls()
            if self.settings.smtp_username:
                client.login(self.settings.smtp_username, self.settings.smtp_password or "")
            client.send_message(email_message)


class ResendEmailSender:
    endpoint = "https://api.resend.com/emails"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(self, message: TransactionalEmail) -> None:
        payload = {
            "from": formataddr(
                (self.settings.email_from_name, self.settings.email_from_address),
            ),
            "to": [message.recipient],
            "subject": message.subject,
            "text": message.text_body,
            "html": message.html_body,
        }
        request = Request(
            self.endpoint,
            data=dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.settings.resend_api_key}",
                "Content-Type": "application/json",
                "User-Agent": "MAKA/1.0",
            },
            method="POST",
        )
        with urlopen(request, timeout=15):
            pass


def build_email_sender(settings: Settings) -> EmailSender:
    if settings.email_delivery_mode == "smtp":
        return SmtpEmailSender(settings)
    if settings.email_delivery_mode == "resend":
        return ResendEmailSender(settings)
    return ConsoleEmailSender()
