import express from "express";
import multer from "multer";
import FormData from "form-data";
import {
  addFileToVectorStore,
  listVectorStoreFiles,
} from "../clients/azureOpenAI";
import openai from "../clients/azureOpenAI";

const router = express.Router();

// Multer setup – store in memory
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /vector-stores/:id/files
 * Uploads one or more files, then attaches them to the vector store.
 * Returns the vector store file objects.
 */
router.post("/:id/files", upload.array("files"), async (req, res) => {
  const { id: vectorStoreId } = req.params;
  const files = ((req as any).files as any[]) || [];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  try {
    const uploadedFileIds: string[] = [];

    // Upload each file to OpenAI Files API (purpose=assistants)
    for (const file of files) {
      const form = new FormData();
      form.append("purpose", "assistants");
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const response = await openai.post("/files", form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        maxBodyLength: Infinity,
      });

      uploadedFileIds.push(response.data.id);
      // Attach to vector store
      await addFileToVectorStore(vectorStoreId, response.data.id);
    }

    // Return updated list of vector store files
    const updated = await listVectorStoreFiles(vectorStoreId);
    res.json({ uploadedFileIds, vectorStoreFiles: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File upload failed" });
  }
});

export default router;
