from pathlib import Path

from worker import health, main


def test_heartbeat_roundtrip(tmp_path: Path, monkeypatch) -> None:
    heartbeat = tmp_path / "heartbeat"
    monkeypatch.setattr(main, "HEARTBEAT_FILE", heartbeat)
    monkeypatch.setattr(health, "HEARTBEAT_FILE", heartbeat)

    assert not health.is_healthy()
    main.beat(heartbeat)
    assert health.is_healthy()


def test_stale_heartbeat_is_unhealthy(tmp_path: Path, monkeypatch) -> None:
    heartbeat = tmp_path / "heartbeat"
    heartbeat.write_text("0")
    monkeypatch.setattr(health, "HEARTBEAT_FILE", heartbeat)

    assert not health.is_healthy()
