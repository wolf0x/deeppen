import { describe, it, expect } from "vitest";
import { StreamBridge } from "./StreamBridge.js";

describe("StreamBridge", () => {
  it("can be instantiated", () => {
    const bridge = new StreamBridge();
    expect(bridge).toBeDefined();
  });

  it("tracks connected clients", () => {
    const bridge = new StreamBridge();
    expect(bridge.getClientCount()).toBe(0);
  });

  it("has addClient method", () => {
    const bridge = new StreamBridge();
    expect(typeof bridge.addClient).toBe("function");
  });

  it("has removeClient method", () => {
    const bridge = new StreamBridge();
    expect(typeof bridge.removeClient).toBe("function");
  });

  it("has broadcast method", () => {
    const bridge = new StreamBridge();
    expect(typeof bridge.broadcast).toBe("function");
  });
});
