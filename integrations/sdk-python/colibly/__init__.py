"""Cliente de la API pública de Colibly (/api/v1). Sin dependencias (urllib).

Referencia completa: https://app.colibly.com/docs/api
"""

from __future__ import annotations

import hashlib
import hmac
import json
import random
import time
import uuid
from typing import Any, Dict, Iterator, List, Optional
from urllib import error, parse, request

__all__ = ["Colibly", "ColiblyError", "verify_webhook_signature", "construct_webhook_event"]
__version__ = "0.1.1"

_RETRYABLE = {429, 503}


class ColiblyError(Exception):
    """Error de la API: `code` para ramificar, mensaje en español, `meta_code` si WhatsApp lo rechazó."""

    def __init__(self, status: int, body: Dict[str, Any]):
        super().__init__(body.get("message", f"HTTP {status}"))
        self.status = status
        self.code: str = body.get("code", "http_error")
        self.details: List[Dict[str, str]] = body.get("details") or []
        self.meta_code: Optional[int] = (body.get("meta") or {}).get("code")
        self.request_id: Optional[str] = body.get("requestId")


class Colibly:
    def __init__(self, api_key: str, base_url: str = "https://app.colibly.com", max_retries: int = 2, timeout: float = 30.0):
        if not api_key:
            raise ValueError("Falta api_key")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.timeout = timeout

    def request(self, method: str, path: str, body: Any = None, query: Optional[Dict[str, Any]] = None, idempotency_key: Optional[str] = None) -> Any:
        """Llamada genérica a /api/v1{path}. Los POST llevan Idempotency-Key automática."""
        url = f"{self.base_url}/api/v1{path}"
        clean = {k: v for k, v in (query or {}).items() if v not in (None, "")}
        if clean:
            url += "?" + parse.urlencode({k: str(v).lower() if isinstance(v, bool) else v for k, v in clean.items()})
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        key = idempotency_key or (str(uuid.uuid4()) if method == "POST" else None)
        if key:
            headers["Idempotency-Key"] = key

        attempt = 0
        while True:
            req = request.Request(url, data=data, headers=headers, method=method)
            try:
                with request.urlopen(req, timeout=self.timeout) as res:
                    text = res.read().decode("utf-8")
                    return json.loads(text) if text else {}
            except error.HTTPError as exc:
                if exc.code in _RETRYABLE and attempt < self.max_retries:
                    retry_after = exc.headers.get("Retry-After")
                    time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else _backoff(attempt))
                    attempt += 1
                    continue
                text = exc.read().decode("utf-8")
                try:
                    payload = json.loads(text).get("error") or {}
                except ValueError:
                    payload = {}
                raise ColiblyError(exc.code, payload or {"code": "http_error", "message": f"HTTP {exc.code}"}) from None
            except error.URLError:
                if attempt < self.max_retries:
                    time.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                raise

    def paginate(self, path: str, **query: Any) -> Iterator[Dict[str, Any]]:
        """Recorre todas las páginas de un listado con cursor."""
        cursor = None
        query.setdefault("limit", 100)
        while True:
            page = self.request("GET", path, query={**query, "cursor": cursor})
            yield from page.get("data", [])
            cursor = page.get("nextCursor")
            if not cursor:
                return

    # Atajos de lo más usado; el resto, con request().
    def me(self) -> Any:
        return self.request("GET", "/me")

    def send_message(self, body: Dict[str, Any], idempotency_key: Optional[str] = None) -> Any:
        """POST /messages. Con una key sk_test_ responde la vista previa sin enviar."""
        return self.request("POST", "/messages", body=body, idempotency_key=idempotency_key)

    def get_contact(self, contact_id: str) -> Any:
        return self.request("GET", f"/contacts/{parse.quote(contact_id, safe='')}")

    def create_contact(self, body: Dict[str, Any]) -> Any:
        return self.request("POST", "/contacts", body=body)

    def update_contact(self, contact_id: str, body: Dict[str, Any]) -> Any:
        return self.request("PATCH", f"/contacts/{parse.quote(contact_id, safe='')}", body=body)

    def list_templates(self, **query: Any) -> Any:
        return self.request("GET", "/templates", query=query)

    def create_template(self, body: Dict[str, Any]) -> Any:
        return self.request("POST", "/templates", body=body)

    def upload_media(self, media_type: str, url: str, filename: Optional[str] = None) -> Any:
        body: Dict[str, Any] = {"type": media_type, "url": url}
        if filename:
            body["filename"] = filename
        return self.request("POST", "/media", body=body)

    def create_onboarding_link(self, name: Optional[str] = None, reference: Optional[str] = None, redirect_url: Optional[str] = None, expires_in_hours: Optional[int] = None) -> Any:
        """Enlace para que un cliente conecte su número de WhatsApp (devuelve `url`)."""
        body = {k: v for k, v in {"name": name, "reference": reference, "redirectUrl": redirect_url, "expiresInHours": expires_in_hours}.items() if v is not None}
        return self.request("POST", "/onboarding-links", body=body)

    def run_automation(self, automation_id: str, contact_id: str, variables: Optional[Dict[str, str]] = None) -> Any:
        body: Dict[str, Any] = {"contactId": contact_id}
        if variables:
            body["vars"] = variables
        return self.request("POST", f"/automations/{parse.quote(automation_id, safe='')}/runs", body=body)


def _backoff(attempt: int) -> float:
    return min(8.0, 0.5 * 2 ** attempt) + random.random() / 4


def verify_webhook_signature(raw_body: bytes | str, header: Optional[str], secret: str, tolerance_seconds: int = 300, now: Optional[int] = None) -> bool:
    """Verifica X-Colibly-Signature (t=<unix>,v1=<hmac>…) sobre el cuerpo crudo."""
    if not header or not secret:
        return False
    t: Optional[int] = None
    candidates: List[str] = []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            try:
                t = int(value)
            except ValueError:
                return False
        elif key == "v1" and value:
            candidates.append(value)
    if t is None or not candidates:
        return False
    if abs((now if now is not None else int(time.time())) - t) > tolerance_seconds:
        return False
    body = raw_body.decode("utf-8") if isinstance(raw_body, bytes) else raw_body
    expected = hmac.new(secret.encode("utf-8"), f"{t}.{body}".encode("utf-8"), hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, c) for c in candidates)


def construct_webhook_event(raw_body: bytes | str, header: Optional[str], secret: str) -> Dict[str, Any]:
    """Verifica y devuelve el evento; lanza ValueError si la firma no es válida."""
    if not verify_webhook_signature(raw_body, header, secret):
        raise ValueError("Firma de webhook inválida")
    return json.loads(raw_body)
