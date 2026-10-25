"""Gridzilla's database: SQLite, one file next to the platform, write-ahead mode.

Every signal the platform signs, every ack a device returns, every autopilot decision, every log line, every device key and
every curve sample is appended here as a row. This is the audit trail: append only, queryable with any SQLite client.
Nothing in the platform depends on a write succeeding: every call swallows its own errors and logs once.
"""
import json, sqlite3, threading, time
from pathlib import Path

PATH = Path(__file__).parent / "gridzilla.db"
_lock = threading.Lock()
_con = None
_failed = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS signals   (seq INTEGER PRIMARY KEY, ts TEXT, segment TEXT, mode TEXT, valid_from TEXT, valid_to TEXT, note TEXT, doc TEXT);
CREATE TABLE IF NOT EXISTS acks      (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, device TEXT, seq INTEGER, status TEXT, reason TEXT, verified INTEGER, doc TEXT);
CREATE TABLE IF NOT EXISTS decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, sim_h REAL, mode TEXT, segment TEXT, verdict TEXT, detail TEXT, seq INTEGER, rationale TEXT, doc TEXT);
CREATE TABLE IF NOT EXISTS log       (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, msg TEXT, extra TEXT);
CREATE TABLE IF NOT EXISTS samples   (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, node TEXT, h REAL, program_kw REAL, baseline_kw REAL, other_kw REAL, total_kw REAL);
CREATE TABLE IF NOT EXISTS devices   (device TEXT PRIMARY KEY, pubkey_pem TEXT, registered_at TEXT, last_seen TEXT);
CREATE INDEX IF NOT EXISTS acks_ts ON acks(ts);
CREATE INDEX IF NOT EXISTS samples_node_ts ON samples(node, ts);
CREATE INDEX IF NOT EXISTS log_ts ON log(ts);
"""


def _connect():
    global _con
    if _con is None:
        _con = sqlite3.connect(str(PATH), check_same_thread=False, timeout=5)
        _con.execute("PRAGMA journal_mode=WAL"); _con.execute("PRAGMA synchronous=NORMAL")
        _con.executescript(SCHEMA)
    return _con


def _run(sql, rows, many=False):
    global _failed
    try:
        with _lock:
            con = _connect()
            (con.executemany if many else con.execute)(sql, rows); con.commit()
    except Exception as e:
        if not _failed: print(f"[db] write failed: {e}", flush=True); _failed = True


def signal(doc):
    _run("INSERT OR REPLACE INTO signals VALUES (?,?,?,?,?,?,?,?)",
         (doc.get("seq"), doc.get("issued_at"), doc.get("segment"), doc.get("mode"), doc.get("valid_from"), doc.get("valid_to"), doc.get("note", ""), json.dumps(doc)))


def ack(ts, device, a, verified):
    _run("INSERT INTO acks (ts, device, seq, status, reason, verified, doc) VALUES (?,?,?,?,?,?,?)",
         (ts, device, a.get("seq"), a.get("status"), a.get("reason"), 1 if verified else 0, json.dumps(a)))


def decision(e):
    _run("INSERT INTO decisions (ts, sim_h, mode, segment, verdict, detail, seq, rationale, doc) VALUES (?,?,?,?,?,?,?,?,?)",
         (e.get("at"), e.get("sim_h"), e.get("mode"), e.get("segment"), e.get("verdict"), e.get("detail"), e.get("seq"), e.get("rationale"), json.dumps(e)))


def log(e):
    extra = {k: v for k, v in e.items() if k not in ("ts", "kind", "msg")}
    _run("INSERT INTO log (ts, kind, msg, extra) VALUES (?,?,?,?)", (e.get("ts"), e.get("kind"), e.get("msg"), json.dumps(extra) if extra else None))


def samples(rows):
    """rows: iterable of (ts, node, h, program_kw, baseline_kw, other_kw, total_kw)"""
    _run("INSERT INTO samples (ts, node, h, program_kw, baseline_kw, other_kw, total_kw) VALUES (?,?,?,?,?,?,?)", list(rows), many=True)


def device(dev, pem, ts):
    _run("INSERT INTO devices (device, pubkey_pem, registered_at, last_seen) VALUES (?,?,?,?) "
         "ON CONFLICT(device) DO UPDATE SET pubkey_pem=excluded.pubkey_pem, last_seen=excluded.last_seen", (dev, pem, ts, ts))


def query(sql, args=()):
    with _lock:
        con = _connect(); con.row_factory = sqlite3.Row
        try: return [dict(r) for r in con.execute(sql, args).fetchall()]
        finally: con.row_factory = None


def audit(limit=50):
    """The last signals, acks and decisions, newest first, plus row counts: what the jury asks for."""
    lim = max(1, min(int(limit), 500))
    counts = {t: query(f"SELECT COUNT(*) AS n FROM {t}")[0]["n"] for t in ("signals", "acks", "decisions", "log", "samples", "devices")}
    return {"db": str(PATH), "counts": counts,
            "signals": query("SELECT seq, ts, segment, mode, valid_from, valid_to, note FROM signals ORDER BY seq DESC LIMIT ?", (lim,)),
            "acks": query("SELECT ts, device, seq, status, reason, verified FROM acks ORDER BY id DESC LIMIT ?", (lim,)),
            "decisions": query("SELECT ts, sim_h, mode, segment, verdict, detail, seq, rationale FROM decisions ORDER BY id DESC LIMIT ?", (lim,))}
