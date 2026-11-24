import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hostPattern, instanceOrigin } from "../extension/lib/config.ts";

describe("the Extension reads an Instance address as an origin it may call", () => {
  it("keeps the origin of an https address and drops the path, the query and the surrounding space", () => {
    assert.equal(
      instanceOrigin("  https://Library.Example.com/reader?x=1#top  "),
      "https://library.example.com",
    );
    assert.equal(
      instanceOrigin("https://library.example.com:8443/"),
      "https://library.example.com:8443",
    );
  });

  it("accepts plain http only for localhost and 127.0.0.1", () => {
    assert.equal(instanceOrigin("http://localhost:3000/path"), "http://localhost:3000");
    assert.equal(instanceOrigin("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
    assert.equal(instanceOrigin("http://library.example.com"), null);
    assert.equal(instanceOrigin("http://192.168.1.20:3000"), null);
  });

  it("refuses an address with credentials, another scheme, no scheme or no address", () => {
    assert.equal(instanceOrigin("https://owner:secret@library.example.com"), null);
    assert.equal(instanceOrigin("https://owner@library.example.com"), null);
    assert.equal(instanceOrigin("https://:secret@library.example.com"), null);
    assert.equal(instanceOrigin("ftp://library.example.com"), null);
    assert.equal(instanceOrigin("library.example.com"), null);
    assert.equal(instanceOrigin("localhost:3000"), null);
    assert.equal(instanceOrigin(""), null);
  });
});

describe("the Extension asks for access to an origin by its scheme and host", () => {
  it("names the scheme and the host with any path and drops the port", () => {
    assert.equal(hostPattern("https://library.example.com"), "https://library.example.com/*");
    assert.equal(hostPattern("https://library.example.com:8443"), "https://library.example.com/*");
    assert.equal(hostPattern("http://localhost:3000"), "http://localhost/*");
  });
});
