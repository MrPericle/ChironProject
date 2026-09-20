from html import escape
from urllib.parse import quote

from chiron_api.email import TransactionalEmail


def verification_email(
    *,
    recipient: str,
    first_name: str,
    frontend_base_url: str,
    token: str,
) -> TransactionalEmail:
    url = f"{frontend_base_url.rstrip('/')}?auth=verify-email&token={quote(token)}"
    safe_name = escape(first_name)
    return TransactionalEmail(
        recipient=recipient,
        subject="Conferma il tuo indirizzo email MAKA",
        text_body=(
            f"Ciao {first_name},\n\n"
            "conferma il tuo indirizzo email per attivare l'account MAKA:\n"
            f"{url}\n\n"
            "Il link scade e puo essere usato una sola volta. Se non hai creato tu "
            "l'account, ignora questo messaggio."
        ),
        html_body=(
            "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#171717\">"
            f"<h1 style=\"font-size:24px\">Ciao {safe_name}</h1>"
            "<p>Conferma il tuo indirizzo email per attivare l'account MAKA.</p>"
            f"<p><a href=\"{escape(url, quote=True)}\" "
            "style=\"background:#e2231a;color:#fff;padding:12px 18px;text-decoration:none\">"
            "Conferma email</a></p>"
            "<p>Il link scade e puo essere usato una sola volta.</p>"
            "</body></html>"
        ),
    )


def password_reset_email(
    *,
    recipient: str,
    first_name: str,
    frontend_base_url: str,
    token: str,
) -> TransactionalEmail:
    url = f"{frontend_base_url.rstrip('/')}?auth=reset-password&token={quote(token)}"
    safe_name = escape(first_name)
    return TransactionalEmail(
        recipient=recipient,
        subject="Reimposta la password MAKA",
        text_body=(
            f"Ciao {first_name},\n\n"
            "usa questo link per scegliere una nuova password MAKA:\n"
            f"{url}\n\n"
            "Il link scade e puo essere usato una sola volta. Se non hai richiesto tu "
            "il reset, ignora questo messaggio."
        ),
        html_body=(
            "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#171717\">"
            f"<h1 style=\"font-size:24px\">Ciao {safe_name}</h1>"
            "<p>Scegli una nuova password per il tuo account MAKA.</p>"
            f"<p><a href=\"{escape(url, quote=True)}\" "
            "style=\"background:#e2231a;color:#fff;padding:12px 18px;text-decoration:none\">"
            "Reimposta password</a></p>"
            "<p>Il link scade e puo essere usato una sola volta.</p>"
            "</body></html>"
        ),
    )
