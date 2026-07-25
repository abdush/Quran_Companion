"""Ed25519 signing of pack manifests (§6.3 — clients refuse unsigned packs, NFR-1).

The signature covers the *canonical manifest bytes*: the manifest as compact,
key-sorted JSON with the `signature` field removed. Since the manifest carries a
SHA-256 for every payload file, signing it transitively covers the whole pack.

Key handling:

* the private key comes from `QPACK_SIGNING_KEY` (base64 raw seed) or
  `QPACK_SIGNING_KEY_FILE`, never from the repo;
* the matching public key is committed under `tools/pack-builder/keys/` so that
  verification — including the golden tests and any client — needs no secret;
* `pack-builder keygen` produces a development pair.
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from pack_builder.config import PUBLIC_KEYS_DIR

SIGNATURE_PREFIX = "ed25519:"
DEFAULT_KEY_NAME = "dev"
PRIVATE_KEY_ENV = "QPACK_SIGNING_KEY"
PRIVATE_KEY_FILE_ENV = "QPACK_SIGNING_KEY_FILE"
KEY_NAME_ENV = "QPACK_SIGNING_KEY_NAME"


def default_key_name() -> str:
    """Which committed public key verification should use (`dev` unless told)."""
    return os.environ.get(KEY_NAME_ENV, DEFAULT_KEY_NAME)


class SigningError(RuntimeError):
    """A pack could not be signed or its signature did not verify."""


def canonical_manifest_bytes(manifest: dict[str, Any]) -> bytes:
    """Deterministic bytes to sign: sorted keys, no whitespace, no `signature`."""
    payload = {key: value for key, value in manifest.items() if key != "signature"}
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def _public_key_path(name: str) -> Path:
    return PUBLIC_KEYS_DIR / f"{name}-signing.pub"


def load_private_key() -> Ed25519PrivateKey:
    raw = os.environ.get(PRIVATE_KEY_ENV)
    if raw is None:
        key_file = os.environ.get(PRIVATE_KEY_FILE_ENV)
        if key_file is None:
            raise SigningError(
                f"no signing key: set {PRIVATE_KEY_ENV} (base64 seed) or "
                f"{PRIVATE_KEY_FILE_ENV}. Run `pack-builder keygen` for a dev pair."
            )
        raw = Path(key_file).read_text(encoding="utf-8").strip()
    try:
        seed = base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise SigningError("signing key is not valid base64") from exc
    if len(seed) != 32:
        raise SigningError(f"ed25519 seed must be 32 bytes, got {len(seed)}")
    return Ed25519PrivateKey.from_private_bytes(seed)


def load_public_key(name: str | None = None) -> Ed25519PublicKey:
    path = _public_key_path(name or default_key_name())
    if not path.is_file():
        raise SigningError(f"no public key at {path}; run `pack-builder keygen`")
    return serialization.load_pem_public_key(path.read_bytes())  # type: ignore[return-value]


def generate_keypair(name: str | None = None) -> tuple[str, Path]:
    """Create a keypair: return the base64 seed and the written public-key path."""
    private = Ed25519PrivateKey.generate()
    seed = private.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    PUBLIC_KEYS_DIR.mkdir(parents=True, exist_ok=True)
    path = _public_key_path(name or default_key_name())
    path.write_bytes(
        private.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    return base64.b64encode(seed).decode(), path


def sign_manifest(manifest: dict[str, Any]) -> str:
    signature = load_private_key().sign(canonical_manifest_bytes(manifest))
    return SIGNATURE_PREFIX + base64.b64encode(signature).decode()


def verify_manifest(manifest: dict[str, Any], name: str | None = None) -> None:
    signature = manifest.get("signature", "")
    if not signature.startswith(SIGNATURE_PREFIX):
        raise SigningError("manifest is unsigned or uses an unsupported algorithm")
    raw = base64.b64decode(signature[len(SIGNATURE_PREFIX) :])
    try:
        load_public_key(name).verify(raw, canonical_manifest_bytes(manifest))
    except InvalidSignature as exc:
        raise SigningError("manifest signature does not verify — refuse this pack") from exc
