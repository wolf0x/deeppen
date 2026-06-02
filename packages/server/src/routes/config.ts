import { Router } from "express";
import { ConfigStore } from "../services/ConfigStore.js";
import { createChatModel } from "../services/AgentRunner.js";

export function createConfigRoutes(configStore: ConfigStore): Router {
  const router = Router();

  // ─── Model Configs ───────────────────────────────
  router.get("/models", async (_req, res) => {
    const models = await configStore.listModels();
    res.json(models);
  });

  router.post("/models", async (req, res) => {
    try {
      const { name, provider, apiKey, modelId } = req.body;

      // Validate required fields
      if (!name || !provider || !modelId) {
        return res.status(400).json({ error: "name, provider, and modelId are required" });
      }

      // Validate API key for providers that need it
      const noKeyProviders = ["ollama"];
      if (!noKeyProviders.includes(provider) && (!apiKey || !apiKey.trim())) {
        return res.status(400).json({ error: `API key is required for ${provider}` });
      }

      const model = await configStore.createModel(req.body);
      res.status(201).json(model);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put("/models/:id", async (req, res) => {
    try {
      const { name, provider, apiKey, modelId } = req.body;

      // Validate required fields if provided
      if (name !== undefined && !name?.trim()) {
        return res.status(400).json({ error: "name cannot be empty" });
      }
      if (provider !== undefined && !provider) {
        return res.status(400).json({ error: "provider cannot be empty" });
      }
      if (modelId !== undefined && !modelId?.trim()) {
        return res.status(400).json({ error: "modelId cannot be empty" });
      }

      // Validate API key for providers that need it
      const noKeyProviders = ["ollama"];
      if (apiKey !== undefined && !noKeyProviders.includes(provider ?? "") && !apiKey?.trim()) {
        return res.status(400).json({ error: `API key is required for ${provider}` });
      }

      const model = await configStore.updateModel(req.params.id, req.body);
      if (!model) return res.status(404).json({ error: "Not found" });
      res.json(model);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/models/:id", async (req, res) => {
    try {
      await configStore.deleteModel(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/models/:id/test", async (req, res) => {
    try {
      const model = await configStore.getModelWithKey(req.params.id);
      if (!model) return res.status(404).json({ error: "Not found" });

      // Validate API key for providers that need it
      const noKeyProviders = ["ollama"];
      if (!noKeyProviders.includes(model.provider) && !model.apiKey) {
        const errMsg = `API key is missing for ${model.provider}. Please edit this model and add your API key.`;
        await configStore.updateModelTestResult(req.params.id, "error", errMsg);
        return res.json({ ok: false, error: errMsg });
      }

      const chatModel = createChatModel(model);
      const start = Date.now();
      const response = await chatModel.invoke("Say hello in one word.");
      const latencyMs = Date.now() - start;

      await configStore.updateModelTestResult(req.params.id, "ok");
      res.json({
        ok: true,
        latencyMs,
        response: typeof response.content === "string" ? response.content : "",
      });
    } catch (err: any) {
      await configStore.updateModelTestResult(
        req.params.id,
        "error",
        err.message,
      );
      res.json({ ok: false, error: err.message });
    }
  });

  // ─── SubAgent Configs ────────────────────────────
  router.get("/agents", async (_req, res) => {
    const agents = await configStore.listSubagents();
    res.json(agents);
  });

  router.post("/agents", async (req, res) => {
    try {
      const agent = await configStore.createSubagent(req.body);
      res.status(201).json(agent);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put("/agents/:id", async (req, res) => {
    try {
      const agent = await configStore.updateSubagent(req.params.id, req.body);
      if (!agent) return res.status(404).json({ error: "Not found" });
      res.json(agent);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete("/agents/:id", async (req, res) => {
    try {
      await configStore.deleteSubagent(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
