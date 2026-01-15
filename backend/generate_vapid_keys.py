#!/usr/bin/env python3
"""Generate VAPID keys for Web Push notifications."""

import base64
from py_vapid import Vapid

vapid = Vapid()
vapid.generate_keys()

# Save keys to files
vapid.save_key("backend/vapid_private.pem")
vapid.save_public_key("backend/vapid_public.pem")

# Get keys for .env
from cryptography.hazmat.primitives import serialization

private_key = vapid.private_pem().decode('utf-8').strip()

# Get public key in uncompressed format
public_key_bytes = vapid.public_key.public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint
)
public_key_b64 = base64.urlsafe_b64encode(public_key_bytes).decode('utf-8').rstrip('=')

print("=" * 70)
print("VAPID KEYS GENERATED - Add to backend/.env")
print("=" * 70)
print(f"VAPID_PRIVATE_KEY={private_key}")
print(f"VAPID_PUBLIC_KEY={public_key_b64}")
print("VAPID_CLAIMS_EMAIL=mailto:admin@corestone.ru")
print("=" * 70)
print("\nKeys also saved to:")
print("  - backend/vapid_private.pem")
print("  - backend/vapid_public.pem")

