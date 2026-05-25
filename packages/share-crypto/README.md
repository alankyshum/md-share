# @alankyshum/share-crypto

Encryption helpers for `md-share`.

## Design Decisions & Security Posture

- **Plaintext title/description are intentional for rich OG previews and storage-repo manageability.** They are **not suitable for enterprise PII scenarios**. Use only for content you'd be willing to leave on a public GitHub repo if the URL leaks.
- **AES-256-GCM remains quantum-resistant for this use case:** Grover's algorithm reduces effective security to 128 bits, well above the 80-bit comfort threshold. Shor's algorithm does not apply (symmetric primitive).
- **Idempotent Storage Keys:** The encrypted share `key` (filename, 12-char sha256) must hash the **plaintext markdown body** (not the ciphertext) so identical content from the same user produces idempotent filenames.
