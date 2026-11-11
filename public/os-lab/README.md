# OS Lab (v86)

`/os-lab/` is a standalone static page, separate from the React app. It runs a real x86 PC in the browser using [v86](https://github.com/copy/v86). The guest is either a small Buildroot Linux or FreeDOS. Lab OS opens it in a window from Start → Experiments → **Linux & DOS**.

Nothing is downloaded until you press **Boot**. The button shows the download size first. The guest has no network. Saves are kept in this browser's IndexedDB (`os-lab` database).

## Files here

| File | What it is |
| --- | --- |
| `index.html`, `os-lab.js`, `os-lab.css` | The page. It uses plain ES modules and no build step. Vite copies it as-is. |
| `coi-serviceworker.js` | [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) v0.1.7, unmodified. MIT license: `coi-serviceworker.LICENSE.txt`. |

The worker's scope is the script's directory, `/os-lab/`, so it never controls the main site, Lab OS, or pages with third-party embeds. It only registers on a top-level visit, not inside a Lab OS window.

v86 doesn't use SharedArrayBuffer, and its JIT runs with or without cross-origin isolation, so the worker is optional. The spike kept it so both modes could be measured.

## Downloaded on demand

Every file is pinned to an exact version or commit. Each one is checked before use: `libv86.js` by Subresource Integrity, the rest by SHA-256 in `os-lab.js`. Nothing is committed to this repository.

| File | Bytes | Over the wire | SHA-256 | Source |
| --- | ---: | ---: | --- | --- |
| `libv86.js` | 359,857 | 96,464 | SRI `sha384-VHM7C9yLVVXL8tfkDmkG6D4ZEwS7DMdJvhMeD1uTYT7J512BkhgQ8Ylp6sUGBDnJ` | https://cdn.jsdelivr.net/npm/v86@0.5.473/build/libv86.js |
| `v86.wasm` | 2,007,347 | 341,445 | `2f0c4150f266415b754a84a32e6f8e4c975a1d3abb94c78b047fa30027db1ef1` | https://cdn.jsdelivr.net/npm/v86@0.5.473/build/v86.wasm |
| `v86-fallback.wasm` | 2,040,034 | only with `?jit=0` | `4eb64c9b7908d5931c1868eea4824b3a0a628eb86e6eac09d133776b50922d81` | https://cdn.jsdelivr.net/npm/v86@0.5.473/build/v86-fallback.wasm |
| `seabios.bin` | 131,072 | 60,587 | `73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98` | https://cdn.jsdelivr.net/gh/copy/v86@315b2b0b758703ef0e6cc7b4088d6068f83f3c20/bios/seabios.bin |
| `vgabios.bin` | 36,352 | 14,455 | `a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880` | https://cdn.jsdelivr.net/gh/copy/v86@315b2b0b758703ef0e6cc7b4088d6068f83f3c20/bios/vgabios.bin |
| `linux.iso` | 5,666,816 | 2,241,455 | `b311d065b9acc17e5bf1dd4d12f06e70efaf2f0d8b2c7be3bbbb25076f494885` | https://cdn.jsdelivr.net/gh/copy/images@db92d8fd4a53dbd73b8e0588bb4bd8fe37a1975a/linux.iso |
| `freedos722.img` | 737,280 | 571,097 | `6c7b3c62823d538e20797fecae6dc55d2572455791a573a7de2cdba0b583f6be` | https://cdn.jsdelivr.net/gh/copy/images@db92d8fd4a53dbd73b8e0588bb4bd8fe37a1975a/freedos722.img |

"Over the wire" is the compressed transfer size jsDelivr served during the spike:

- Linux cold boot: about 2.76 MB
- FreeDOS cold boot: about 1.09 MB
- Resuming a Linux save: about 0.51 MB, the runtime only. The Linux root file system is a RAM disk, so the save already contains it.

### Why jsDelivr

- The images on v86's own host, `i.copy.sh`, return 403 to requests with a foreign `Referer`, which means they are hotlink-protected. This page doesn't work around that.
- The same images are in the v86 author's [`copy/images`](https://github.com/copy/images) GitHub repository. jsDelivr mirrors that repository with CORS and immutable caching, pinned to a commit.
- The v86 runtime is the published npm package. The BIOS files are pinned to a v86 commit.
- None of these files are committed, so the repository stays small. The Linux ISO alone is 5.7 MB.

## Guests

- **Linux:** Buildroot with Linux 2.6.34.14 (i686) and BusyBox. Built in 2014 by the v86 author. It uses 32 MB of RAM and its root file system is a RAM disk. A save is about 29 MB raw, stored gzipped at about 10 MB.
- **FreeDOS:** a 720 KB FreeDOS boot floppy with FreeCOM and a few games. A save is about 0.8 MB stored.
- A newer kernel would mean building a Buildroot image ourselves. We would then host it and publish its GPL source, or link to that source.

## Query parameters

| Parameter | Effect |
| --- | --- |
| `?guest=freedos` | Selects FreeDOS. The default is Linux. |
| `?coi=0` | Unregisters the service worker and runs without cross-origin isolation. |
| `?jit=0` | Uses `v86-fallback.wasm`, which is the interpreter without the JIT. |

`window.osLab` exposes the current phase, timings, and metrics. `body[data-phase]` mirrors the phase. The **Measurements** panel on the page shows the same numbers.

## Tests

`tests/e2e/os-lab.spec.ts` checks three things:

- The page waits for Boot.
- The service worker stays inside `/os-lab/`.
- The Lab OS Start menu opens the page.

The full Linux and FreeDOS boot tests download from jsDelivr, so they only run with `OS_LAB_BOOT=1`.

## Licenses

- v86: BSD-2-Clause.
- SeaBIOS and the VGA BIOS: LGPL-3.0.
- Buildroot Linux and FreeDOS images: GPL-2.0. They are fetched from the v86 author's repository, not redistributed here.
- coi-serviceworker: MIT. Its license file is in this folder.
