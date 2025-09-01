import express from "express";
import multer from "multer";
import FormData from "form-data";
import openai, {
  createVectorStore,
  listVectorStores,
  listVectorStoreFiles,
  addFileToVectorStore,
} from "../clients/azureOpenAI";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /vector-stores (form-data)
 * name (text) - vector store name
 * files (file) - one or more files to ingest immediately
 */
router.post("/", upload.array("files"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // 1) create the vector store
    const vs = await createVectorStore(name);

    // 2) ingest uploaded files (if any)
    const files = ((req as any).files as any[]) || [];
    const uploadedIds: string[] = [];

    for (const file of files) {
      const form = new FormData();
      form.append("purpose", "assistants");
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const fRes = await openai.post("/files", form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        maxBodyLength: Infinity,
      });

      uploadedIds.push(fRes.data.id);
      await addFileToVectorStore(vs.id, fRes.data.id);
    }

    res.json({ vectorStore: vs, uploadedFileIds: uploadedIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create vector store" });
  }
});

/**
 * GET /vector-stores
 */
router.get("/", async (_, res) => {
  try {
    const data = await listVectorStores();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list vector stores" });
  }
});

/**
 * GET /vector-stores/:id/files
 */
router.get("/:id/files", async (req, res) => {
  try {
    const { id } = req.params;
    const data = await listVectorStoreFiles(id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list vector store files" });
  }
});

export default router;
