"""`pack-builder` — the QDS import pipeline CLI.

    pack-builder fetch            # cache raw upstream downloads
    pack-builder build            # normalise + run the golden gates
    pack-builder pack             # build and sign core-hafs.qpack
    pack-builder verify [PATH]    # re-check checksums, signature, licensing
    pack-builder load             # (re)load the qds.* reference tables
    pack-builder check-licenses   # the §6.4 gate on its own
    pack-builder keygen           # development signing keypair
    pack-builder freeze-reference # regenerate the golden fixture (review the diff!)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from qc_shared.quran.metadata import MADANI_604_PAGE_COUNT

from pack_builder import golden, normalize, pack
from pack_builder.config import DATASET_ITEMS, PACK_ID, PACK_VERSION, REFERENCE_FIXTURE_PATH
from pack_builder.corpus import Corpus
from pack_builder.sources import qul, tanzil
from pack_builder.validate import (
    registry,
    validate_corpus_against_openapi,
    validate_licensing,
)

log = logging.getLogger("pack-builder")


def _corpus() -> Corpus:
    log.info("normalising corpus…")
    corpus = normalize.build_corpus()
    log.info(
        "corpus: %s verses, %s words, %s glosses, %s lines, %s placements",
        len(corpus.verses),
        len(corpus.words),
        len(corpus.glosses),
        len(corpus.page_lines),
        len(corpus.placements),
    )
    return corpus


def _validated_corpus() -> Corpus:
    corpus = _corpus()
    validate_licensing(DATASET_ITEMS, registry().declarations_for(DATASET_ITEMS))
    validate_corpus_against_openapi(corpus)
    golden.run_all(corpus)
    log.info("schema, licensing and golden gates passed")
    return corpus


def cmd_fetch(args: argparse.Namespace) -> int:
    tanzil.fetch(refresh=args.refresh)
    qul.fetch_all(refresh=args.refresh)
    log.info("cached Tanzil text and %s muṣḥaf pages", MADANI_604_PAGE_COUNT)
    return 0


def cmd_build(_: argparse.Namespace) -> int:
    corpus = _validated_corpus()
    target = pack.write_payloads(pack.build_payloads(corpus))
    log.info("payloads written to %s", target)
    return 0


def cmd_pack(args: argparse.Namespace) -> int:
    corpus = _validated_corpus()
    path = pack.write_pack(corpus, pack_id=args.pack_id, version=args.version)
    manifest = pack.verify_pack(path)
    log.info("built and verified %s (%.1f MiB)", path, path.stat().st_size / 1024 / 1024)
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    path = Path(args.path) if args.path else pack.artifact_path()
    manifest = pack.verify_pack(path)
    log.info("%s verified: %s items, signature ok", path, len(manifest["contents"]))
    return 0


def cmd_load(args: argparse.Namespace) -> int:
    from pack_builder.load import load_corpus, make_engine

    corpus = _validated_corpus()
    report = load_corpus(corpus, make_engine(args.database_url), create_schema=args.create_schema)
    log.info("loaded qds.*: %s", report)
    return 0


def cmd_check_licenses(_: argparse.Namespace) -> int:
    known = registry()
    validate_licensing(DATASET_ITEMS, known.declarations_for(DATASET_ITEMS))
    log.info("licensing gate passed: %s registered dataset(s)", len(known))
    for item in DATASET_ITEMS:
        entry = known.entry(item)
        print(f"{item:34s} {entry.license:26s} {entry.name}")
    return 0


def cmd_keygen(args: argparse.Namespace) -> int:
    from pack_builder.signing import generate_keypair

    seed, path = generate_keypair(args.name)
    print(f"public key written to {path}")
    print(f"export QPACK_SIGNING_KEY={seed}")
    print("Keep the seed out of the repository.", file=sys.stderr)
    return 0


def cmd_freeze_reference(_: argparse.Namespace) -> int:
    corpus = _corpus()
    REFERENCE_FIXTURE_PATH.write_text(
        json.dumps(golden.build_reference(corpus), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    log.warning("rewrote %s — review the diff before committing", REFERENCE_FIXTURE_PATH)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pack-builder", description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    fetch = sub.add_parser("fetch", help="cache raw upstream downloads")
    fetch.add_argument("--refresh", action="store_true", help="re-download even if cached")
    fetch.set_defaults(func=cmd_fetch)

    sub.add_parser("build", help="normalise and run every gate").set_defaults(func=cmd_build)

    packer = sub.add_parser("pack", help="build and sign the .qpack")
    packer.add_argument("--pack-id", default=PACK_ID)
    packer.add_argument("--version", default=PACK_VERSION)
    packer.set_defaults(func=cmd_pack)

    verify = sub.add_parser("verify", help="verify an existing .qpack")
    verify.add_argument("path", nargs="?")
    verify.set_defaults(func=cmd_verify)

    loader = sub.add_parser("load", help="reload the qds.* reference tables")
    loader.add_argument("--database-url", default=None)
    loader.add_argument(
        "--create-schema", action="store_true", help="create qds.* if absent (dev/test only)"
    )
    loader.set_defaults(func=cmd_load)

    sub.add_parser("check-licenses", help="§6.4 licensing gate").set_defaults(
        func=cmd_check_licenses
    )

    keygen = sub.add_parser("keygen", help="generate a development signing keypair")
    keygen.add_argument("--name", default="dev")
    keygen.set_defaults(func=cmd_keygen)

    sub.add_parser("freeze-reference", help="regenerate the golden fixture").set_defaults(
        func=cmd_freeze_reference
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
