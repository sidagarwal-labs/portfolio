# stories260K (llama2.c)

The two files here are Andrej Karpathy's pretrained **stories260K** model and its 512-token tokenizer. They are copied unmodified from his [`karpathy/tinyllamas`](https://huggingface.co/karpathy/tinyllamas) Hugging Face repository. The portfolio runs them in the browser through a dependency-free TypeScript port of `run.c` (`src/features/views/model/pretrained/`).

## Source

| File | Bytes | SHA-256 | Downloaded from |
| --- | ---: | --- | --- |
| `stories260K.bin` | 1,056,540 | `b0a507e7ad0f626624f17112325e66691f9076d622e1d3274d103d00299f2696` | https://huggingface.co/karpathy/tinyllamas/resolve/0bd21da7698eaf29a0d7de3992de8a46ef624add/stories260K/stories260K.bin |
| `tok512.bin` | 6,227 | `037cb335abb25d1fa9e8ecae30ed2a3a8ace9302862ebcdc05d51a6bbb10c312` | https://huggingface.co/karpathy/tinyllamas/resolve/0bd21da7698eaf29a0d7de3992de8a46ef624add/stories260K/tok512.bin |

- Hugging Face repo: https://huggingface.co/karpathy/tinyllamas/tree/main/stories260K
- Revision: `0bd21da7698eaf29a0d7de3992de8a46ef624add` (last modified 2023-08-15). Repo license tag: `mit`.
- Both SHA-256 values equal the Git LFS object ids that Hugging Face lists for these files at that revision. The Git blob ids are `a68dba0ed17d2c7fd0ce69f550fe3b82b8cae7d8` (model) and `1a7155fdd6f2ad8d0605b4b3a630cdbad82e3716` (tokenizer).
- Reference implementation and documentation: [karpathy/llama2.c](https://github.com/karpathy/llama2.c) at commit `350e04fe35433e6d2941dce5a1f53308f87058eb`. The relevant files are `run.c` and [`doc/stories260K.md`](https://github.com/karpathy/llama2.c/blob/350e04fe35433e6d2941dce5a1f53308f87058eb/doc/stories260K.md).
- Training data: [TinyStories](https://huggingface.co/datasets/roneneldan/TinyStories) (Eldan & Li, 2023, [arXiv:2305.07759](https://arxiv.org/abs/2305.07759)). It is a dataset of simple, synthetic children's stories.

## Model

The model uses the Llama 2 architecture: RMSNorm, rotary position embeddings, SwiGLU feed-forward layers and grouped-query attention. The values below come from the checkpoint header, read by `parseCheckpoint`:

| dim | hidden_dim | n_layers | n_heads | n_kv_heads | vocab_size | seq_len |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 | 172 | 5 | 8 | 4 | 512 (positive, so the classifier shares the token embedding) | 512 |

- **Parameter count:** 260,032 learned floats. This counts the token embedding, the 5 layers and the final RMSNorm. The shared classifier is counted once. The 4,096 legacy `freq_cis` floats that the file still contains are excluded, because `run.c` skips them.
- **Grouped-query attention:** query heads 2k and 2k+1 share key/value head k.
- **Training:** `doc/stories260K.md` documents the training command (`train.py`, custom 512-token vocabulary, 100k iterations). Karpathy reports a validation loss of 1.2968.

## Verification

`tests/e2e/pretrained-model.spec.ts` covers the following:

- **Greedy decoding:** decoding from BOS at temperature 0 for 256 steps reproduces the `run.c` output printed in `doc/stories260K.md` exactly. That output begins "Once upon a time, there was a little girl named Lily. She loved to play outside in the park."
- **Tokenizer:** encoding that documented text gives the same 257 token ids that the model generated.
- **Attention:** every captured attention row is causal and sums to 1.
- **Grouped-query attention:** perturbing one key/value head in layer 1 changes exactly the two query heads that share it.
- **Served files:** the built site serves both files byte-for-byte, matching the hashes above.

## License

stories260K is published under the MIT license (Hugging Face `karpathy/tinyllamas`), as is llama2.c, whose `run.c` the TypeScript inference code follows. Model, tokenizer and reference code are by Andrej Karpathy. TinyStories is published under CDLA-Sharing-1.0.

```
MIT License

Copyright (c) 2023 Andrej

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The license text above is copied verbatim from https://github.com/karpathy/llama2.c/blob/350e04fe35433e6d2941dce5a1f53308f87058eb/LICENSE.
