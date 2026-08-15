"""
Synthesise one WAV per narration cue with Kokoro.

Reads vo/lines.json and writes vo/parts/cue-NN.wav. Called by narrate.mjs,
which handles cue placement and mixing — this script only makes sound.

Kokoro is Python-only, hence the split. The model loads once for all cues;
loading it per line would dominate the runtime.

    python narrate.py --voice am_michael --speed 0.95
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent

# espeakng-loader ships a library with a build-machine data path compiled in.
# Point the loader at the data that actually shipped, before anything imports it.
try:
    import espeakng_loader as _el

    os.environ.setdefault("ESPEAK_DATA_PATH", str(_el.get_data_path()))
except Exception:  # pragma: no cover - loader is optional at import time
    pass

from kokoro_onnx import Kokoro  # noqa: E402
import soundfile as sf  # noqa: E402


def for_speech(text: str, overrides: dict[str, str]) -> str:
    """Rewrite display text into something the phonemiser reads correctly.

    Captions keep the readable form; only the spoken form is adjusted. An em
    dash lands as a swallowed word, so it becomes a comma, and initialisms are
    spaced so they are spelled out rather than attempted as a word.
    """
    out = text
    for src, dst in overrides.items():
        out = out.replace(src, dst)
    out = re.sub(r"\s*—\s*", ", ", out)
    return re.sub(r"\s+", " ", out).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="am_michael")
    ap.add_argument("--speed", type=float, default=0.95)
    ap.add_argument("--model", default=str(HERE / "voices" / "kokoro-v1.0.onnx"))
    ap.add_argument("--voices", default=str(HERE / "voices" / "voices-v1.0.bin"))
    args = ap.parse_args()

    for p in (args.model, args.voices):
        if not pathlib.Path(p).exists():
            print(f"missing model file: {p}\nSee README -> Voice-over.", file=sys.stderr)
            return 1

    spec = json.loads((HERE / "vo" / "lines.json").read_text())
    overrides: dict[str, str] = spec.get("pronunciation", {})
    parts = HERE / "vo" / "parts"
    parts.mkdir(parents=True, exist_ok=True)

    kokoro = Kokoro(args.model, args.voices)
    print(f"voice={args.voice} speed={args.speed} cues={len(spec['cues'])}")

    for i, cue in enumerate(spec["cues"]):
        # an explicit "say" wins over the substitution pass
        spoken = cue.get("say") or for_speech(cue["text"], overrides)
        samples, rate = kokoro.create(spoken, voice=args.voice, speed=args.speed, lang="en-us")
        path = parts / f"cue-{i:02d}.wav"
        sf.write(path, samples, rate)
        print(f"  {cue['t']:5.1f}s  {len(samples)/rate:4.1f}s  {spoken[:58]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
