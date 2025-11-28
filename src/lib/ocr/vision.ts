import { ImageAnnotatorClient } from "@google-cloud/vision";
import { env } from "@/lib/env";

let cachedClient: ImageAnnotatorClient | null = null;

function getVisionClient() {
  if (!cachedClient) {
    // Support both local (file path) and serverless (JSON string) environments
    if (env.GOOGLE_CLOUD_CREDENTIALS_JSON) {
      // Serverless/Vercel: credentials as JSON string
      try {
        const credentials = JSON.parse(env.GOOGLE_CLOUD_CREDENTIALS_JSON);
        cachedClient = new ImageAnnotatorClient({
          credentials,
        });
      } catch (error) {
        throw new Error(
          "GOOGLE_CLOUD_CREDENTIALS_JSON is invalid JSON. Please check your environment variable.",
        );
      }
    } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Local development: credentials as file path
      cachedClient = new ImageAnnotatorClient({
        keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS,
      });
    } else {
      throw new Error(
        "Google Cloud Vision credentials not configured. " +
        "For local dev, set GOOGLE_APPLICATION_CREDENTIALS to a file path. " +
        "For serverless (Vercel), set GOOGLE_CLOUD_CREDENTIALS_JSON to a JSON string.",
      );
    }
  }
  return cachedClient;
}

export async function extractTextFromImage(buffer: Buffer) {
  const client = getVisionClient();
  const [result] = await client.documentTextDetection({
    image: { content: buffer },
  });

  const annotation = result.fullTextAnnotation ?? null;
  const text = annotation?.text ?? "";

  return {
    text,
    annotation,
  };
}

