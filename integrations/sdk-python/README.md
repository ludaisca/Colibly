# colibly (Python)

Cliente de la API de [Colibly](https://colibly.com) para Python 3.9+. Sin dependencias.

```bash
pip install colibly
```

```python
from colibly import Colibly, ColiblyError

colibly = Colibly(api_key="sk_live_…")

colibly.send_message({
    "accountId": "cmacc_…",
    "to": "5215512345678",
    "type": "template",
    "template": {"id": "cmtpl_…", "bodyParams": {"nombre": "Ana"}},
})

for contact in colibly.paginate("/contacts", leadStatus="NEW"):
    print(contact["name"])

# Cualquier endpoint:
colibly.request("GET", "/accounts/cmacc_…/flows")
```

- Los POST llevan `Idempotency-Key` automática; 429 y 503 se reintentan con `Retry-After`.
- Los errores son `ColiblyError` con `code`, `details`, `meta_code` (código de WhatsApp) y `request_id`.
- Con una key `sk_test_` los envíos se simulan (`test: True` y `preview`).

## Webhooks

```python
from colibly import construct_webhook_event

event = construct_webhook_event(request.get_data(), request.headers.get("X-Colibly-Signature"), WEBHOOK_SECRET)
```

Referencia completa: https://app.colibly.com/docs/api
