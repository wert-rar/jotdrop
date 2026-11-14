# Native editor integration

Native editor prototype discovery is adapted from [Fevol and Matthew Meyers' embeddable editor](https://gist.github.com/Fevol/caa478ce303e69eabede7b12b2323838). The installed Obsidian 1.13.7 implementation was inspected to verify sourceMode, set/get, update and lifecycle contracts. This uses an internal Obsidian API; future Obsidian updates require revalidation.

Copyright 2024 Matthew Meyers, Fevol

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Local tools

Drawing format/editor, line diff, duplicate matching and Excalidraw previews are adapted from Diexar-Labs/jotdrop tag 0.31.1 under the repository's MIT license. Duplicate matching is wrapped as a self-contained worker function and its equal-text search also obeys the result/time limits. Excalidraw rendering does not reset the user's shared scripting instance.

Tesseract.js 7.0.0 and Tesseract.js-core 7.0.0 provide local OCR under Apache-2.0; their licenses and bundled dependency notices are included in the built plugin. Russian and English language models are from the official tessdata_fast repository, commit 87416418657359cb625c412a48b6e1d6d41c29bd, under Apache-2.0. Language downloads are data only and are checked against pinned SHA-256 hashes.
