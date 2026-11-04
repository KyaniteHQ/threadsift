# Deepening

How to deepen a cluster of shallow modules safely, given its dependencies. Assumes the vocabulary in [SKILL.md](SKILL.md): **module**, **interface**, **seam**, **adapter**.

## Dependency categories

When assessing a candidate for deepening, classify its dependencies. The category determines how the deepened module is tested across its seam. Every category tests against the real dependency, because tests use no fakes (`docs/testing.md`).

### 1. In-process

Pure computation, in-memory state, no I/O. Always deepenable: merge the modules and test through the new interface directly. No adapter needed.

### 2. Local-substitutable

Dependencies that run locally for real in the test suite: Postgres in a container or PGLite (the Postgres engine compiled to WebAssembly), a temporary directory for the filesystem, or a vendor's own local emulator. Deepenable if such a local instance exists. The deepened module is tested against it. The seam is internal; no port at the module's external interface.

### 3. Remote but owned (Ports & Adapters)

Your own services across a network boundary (microservices, internal APIs). The deep module owns the logic, and the transport sits in one **adapter** (HTTP, gRPC, or a queue). Tests start the owned service for real, as a local process or a container, and call it through that production adapter. Define a **port** at the seam only when a second production adapter exists (see "Seam discipline").

Recommendation shape: *"Keep the logic in one deep module with the HTTP transport in one adapter, and test it against the service started locally, so the logic sits in one place even though it's deployed across a network."*

### 4. True external (real service)

Third-party services (Stripe, Twilio, etc.) you don't control. The deepened module reaches them through the production client. Tests call the real service: its test mode where the vendor offers one, or input whose real answer is the behaviour under test, such as a made-up token that it refuses. A contract that only a real account can show stays unverified, and the report says so.

## Seam discipline

- **One adapter means a hypothetical seam. Two adapters means a real one.** Don't introduce a port unless at least two production adapters are justified, such as two providers or two transports. A test adapter does not count, because tests use no fakes. A single-adapter seam is just indirection.
- **No seam for tests.** A deep module has its external seam at its interface and nothing else that tests reach into; a hook, export or parameter that only tests use is a test-only seam.

## Testing strategy: replace, don't layer

- Old unit tests on shallow modules become waste once the deepened module is proven through its interface; delete them.
- Prove the deepened module through its interface. The **interface is the test surface**: the end-to-end run by default, and a unit test only when the owner asks for one (`docs/testing.md`).
- Tests assert on observable outcomes through the interface, not internal state.
- Tests should survive internal refactors, since they describe behaviour, not implementation. If a test has to change when the implementation changes, it's testing past the interface.
