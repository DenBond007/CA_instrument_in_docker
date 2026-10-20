#!/usr/bin/env python3
"""Apply a small, checked runtime-config customization to the pinned upstream."""

import pathlib
import sys


def replace_once(path: pathlib.Path, old: str, new: str) -> None:
    content = path.read_text()
    if content.count(old) != 1:
        raise SystemExit(f"Upstream changed: expected one match in {path}")
    path.write_text(content.replace(old, new, 1))


def main() -> None:
    source, runtime_module = map(pathlib.Path, sys.argv[1:])
    replace_once(
        source / "src/lib/util/env.ts",
        "export const env = {",
        "import { runtimeKrokiUrl } from './runtime-config';\n\nexport const env = {",
    )
    replace_once(
        source / "src/lib/util/env.ts",
        "krokiRendererUrl: import.meta.env.MERMAID_KROKI_RENDERER_URL ?? '',",
        "krokiRendererUrl: runtimeKrokiUrl,",
    )
    replace_once(
        source / "src/app.html",
        "    %sveltekit.head%",
        '    <script src="%sveltekit.assets%/runtime-config.js"></script>\n'
        "    %sveltekit.head%",
    )
    (source / "src/lib/util/runtime-config.ts").write_text(runtime_module.read_text())
    # Available during prerendering; replaced by the container entrypoint.
    (source / "static/runtime-config.js").write_text(
        'window.__MERMAID_RUNTIME_CONFIG__ = {"krokiRendererUrl":""};\n'
    )


if __name__ == "__main__":
    main()
